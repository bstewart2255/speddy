/**
 * SPE-336 — resolving a teacher's students through `student_teachers`.
 *
 * The link is anchored on the CHILD (SPE-334), not on the caseload row, so
 * "the students of teacher X" is two hops:
 *
 *     teacher -> student_teachers.child_id -> students.child_id
 *
 * Every teacher-facing read goes through one of these helpers rather than
 * `.eq('teacher_id', …)`, which only ever saw the single legacy column.
 *
 * Why helpers and not a nested PostgREST embed: an embed
 * (`children!inner(student_teachers!inner(…))`) would work, but it injects a
 * `children` key into every returned row that each caller has to strip, and it
 * keys off ONE teacher row. These return plain id lists, so call sites keep
 * their exact result shape and just swap `.eq(...)` for `.in('id', ids)`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../src/types/database';

type Client = SupabaseClient<Database>;

/**
 * The caseload rows a single `teachers` row is linked to.
 *
 * Used by admin/directory surfaces, which ask about a specific teacher record.
 * Returns [] when the teacher has no links — callers should short-circuit
 * rather than issue an `.in('id', [])` query.
 *
 * RLS applies normally: the caller sees only links and caseload rows they are
 * already permitted to read.
 */
export async function getLinkedStudentIds(
  supabase: Client,
  teacherId: string,
): Promise<string[]> {
  const { data: links, error } = await supabase
    .from('student_teachers')
    .select('child_id')
    .eq('teacher_id', teacherId);
  if (error) throw error;

  const childIds = Array.from(new Set((links ?? []).map(l => l.child_id)));
  if (childIds.length === 0) return [];

  const { data: rows, error: rowsError } = await supabase
    .from('students')
    .select('id')
    .in('child_id', childIds);
  if (rowsError) throw rowsError;

  return Array.from(new Set((rows ?? []).map(r => r.id)));
}

/**
 * The caseload rows the signed-in teacher ACCOUNT may see.
 *
 * Keyed on the account rather than a teacher row, via the same SECURITY
 * DEFINER seam every RLS policy uses (`get_teacher_student_ids`), so this
 * returns exactly the set RLS would allow — no more, no less — and covers an
 * account holding teacher rows at more than one school (SPE-362), which
 * `getCurrentTeacher()`'s `.single()` cannot.
 */
export async function getMyLinkedStudentIds(
  supabase: Client,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_teacher_student_ids', {
    user_id: userId,
  });
  if (error) throw error;
  return Array.from(new Set((data ?? []) as string[]));
}

export interface LinkedTeacher {
  /** `teachers` row id. */
  id: string;
  /** Display name, or null when the directory row carries neither name. */
  name: string | null;
  /** `profiles` id when the teacher has a Speddy account, else null. */
  profileId: string | null;
  email: string | null;
}

/**
 * Every child's teacher set, keyed by `children.id`.
 *
 * One round trip for a page's worth of students. The order within each child
 * is the link order (oldest first, id as tiebreak) — the same order the
 * legacy-column mirror calls "first listed", so a surface that shows one
 * teacher shows the same one the legacy column names.
 */
export async function getTeachersByChildId(
  supabase: Client,
  childIds: string[],
): Promise<Map<string, LinkedTeacher[]>> {
  const byChild = new Map<string, LinkedTeacher[]>();
  const unique = Array.from(new Set(childIds.filter(Boolean)));
  if (unique.length === 0) return byChild;

  const { data, error } = await supabase
    .from('student_teachers')
    .select('child_id, created_at, id, teachers(id, first_name, last_name, email, account_id)')
    .in('child_id', unique)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;

  for (const link of data ?? []) {
    const teacher = Array.isArray(link.teachers) ? link.teachers[0] : link.teachers;
    if (!teacher) continue;
    const list = byChild.get(link.child_id) ?? [];
    list.push({
      id: teacher.id,
      name: [teacher.first_name, teacher.last_name].filter(Boolean).join(' ') || null,
      profileId: teacher.account_id ?? null,
      email: teacher.email ?? null,
    });
    byChild.set(link.child_id, list);
  }

  return byChild;
}

/**
 * How a set of teachers reads on screen.
 *
 * Elementary class lists are written "Davis / Winbery", so that is the
 * separator (SPE-337 uses the same rule for the students page). Returns null
 * for an empty set so callers can fall back to whatever they showed before.
 */
export function formatTeacherSet(teachers: LinkedTeacher[]): string | null {
  const names = teachers.map(t => t.name).filter((n): n is string => !!n);
  return names.length > 0 ? names.join(' / ') : null;
}
