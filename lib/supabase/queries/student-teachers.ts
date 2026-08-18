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
  /** Display labels only (SPE-334) — secondary carries them, elementary does not. */
  subject: string | null;
  period: string | null;
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
    .select('child_id, created_at, id, subject, period, teachers(id, first_name, last_name, email, account_id)')
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
      subject: link.subject,
      period: link.period,
    });
    byChild.set(link.child_id, list);
  }

  return byChild;
}

// ---------------------------------------------------------------------------
// Reading a teacher set on screen
// ---------------------------------------------------------------------------

/**
 * A period label's place in the school day, as `[period number, start time]`.
 *
 * `period` is display-only free text (SPE-334) and arrives in more than one
 * shape: the SIS link sync writes whatever the roster carries
 * ("5 (1:30 PM - 2:25 PM)"), and a provider editing by hand may type "3" or
 * "Period 3". Both shapes sit in one student's set the moment somebody adds a
 * teacher to a synced roster, so this reads the label rather than trusting a
 * format, and the two shapes have to interleave: a hand-typed "2" belongs
 * between the SIS's first and third periods, not below its sixth.
 *
 * The period NUMBER leads, because it is the half both shapes carry, and
 * within a school it already runs in time order. The start time follows as the
 * tiebreak — and as the only ordering an unnumbered label ("Advisory
 * (7:30 AM)") has, which is why those sort among themselves at the bottom.
 *
 * Times are read out of the label BEFORE the number, and taken out of the way:
 * "Advisory (7:30 AM - 8:20 AM)" must not be read as period 7.
 *
 * A teacher a student sits with twice carries both classes in one label, "/"
 * joined (`linkLabels`), and belongs at the earlier of them — so the label is
 * read a segment at a time, each segment offering its LEADING number, and the
 * earliest wins. Leading, not smallest, so a trailing room number in a
 * hand-typed "5 - Rm 2" does not pull the row up to second period.
 *
 * `Infinity` for a half the label does not carry, so a row Speddy cannot place
 * sinks below the ones it can, and an unlabeled row sinks below both.
 */
function periodSortKey(period: string | null | undefined): [number, number] {
  const label = period?.trim();
  if (!label) return [Infinity, Infinity];

  let earliest = Infinity;
  const withoutTimes = label.replace(
    /(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?/gi,
    (_match, rawHour: string, rawMinute: string, meridiem?: string) => {
      let hour = Number(rawHour);
      const minute = Number(rawMinute);
      // Not a clock time (a room number, say) — still taken out of the label,
      // since whatever it is, it is not this class's period either.
      if (hour > 23 || minute > 59) return ' ';
      const half = meridiem?.toLowerCase();
      if (half === 'a' && hour === 12) hour = 0;
      if (half === 'p' && hour < 12) hour += 12;
      earliest = Math.min(earliest, hour * 60 + minute);
      return ' ';
    },
  );

  let lowest = Infinity;
  for (const segment of withoutTimes.split('/')) {
    const leading = /\d+/.exec(segment);
    if (leading) lowest = Math.min(lowest, Number(leading[0]));
  }

  return [lowest, earliest];
}

/** Infinity-safe: `Infinity - Infinity` is NaN, which breaks a comparator. */
function compareKeyPart(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * A student's teachers in the order their classes run, earliest first.
 *
 * The set itself is unordered — co-teachers are equals, and nothing here ranks
 * them (product decision 2026-07-26). This is a reading aid for the secondary
 * case, where six rows arriving in the order the links happened to be created
 * are six rows the provider has to scan; a school day the student actually
 * walks through reads down the page. Unlabeled rows keep their relative order
 * at the bottom, so elementary — where no link carries a period — is untouched.
 *
 * Display only. Callers hold their own array order; this returns a copy, so
 * nothing that reads meaning into link order (the legacy `students.teacher_id`
 * mirror's "first listed", the one gen-ed teacher an IEP meeting is assembled
 * around) sees a reshuffled set.
 *
 * Read-only lists call this as they render. An EDITABLE one must not: the row
 * carries the Period input that decides where the row goes, so re-sorting per
 * keystroke would move the focused `<li>` — and a DOM move blurs whatever is
 * focused inside it. Those surfaces sort the set once, where it loads.
 */
export function sortTeachersByPeriod<T extends { period: string | null }>(
  teachers: T[],
): T[] {
  return [...teachers].sort((a, b) => {
    const [aNumber, aTime] = periodSortKey(a.period);
    const [bNumber, bTime] = periodSortKey(b.period);
    return compareKeyPart(aNumber, bNumber) || compareKeyPart(aTime, bTime);
  });
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

/**
 * SPE-337 — how a teacher set reads in a table cell.
 *
 * Elementary lists every name, because a class has one teacher or two and both
 * belong on screen. Secondary summarises: a student with six subject teachers
 * turns a roster row into a paragraph, and the individual names are not what
 * the reader is scanning for. One teacher renders as the name at either level,
 * so nothing changes for the single-teacher case.
 */
export function summarizeTeacherSet(
  teachers: LinkedTeacher[],
  isSecondary: boolean,
): string | null {
  if (teachers.length === 0) return null;
  if (teachers.length === 1) return teachers[0].name ?? 'Unnamed teacher';
  if (!isSecondary) return formatTeacherSet(teachers);
  return `${teachers.length} teachers`;
}

// ---------------------------------------------------------------------------
// SPE-337 — reading and writing a student's teacher set by hand
// ---------------------------------------------------------------------------

/** A link as the editing UI holds it. `id` is absent until it is saved. */
export interface EditableTeacherLink {
  id?: string;
  teacherId: string;
  name: string | null;
  /** Display labels only — secondary carries them, elementary leaves them null. */
  subject: string | null;
  period: string | null;
}

/** The child a caseload row serves. Null only if the row predates SPE-347. */
async function childIdForStudent(supabase: Client, studentId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('students').select('child_id').eq('id', studentId).single();
  if (error) throw error;
  return (data?.child_id as string | null) ?? null;
}

/** The teacher set of one caseload row, in link order. */
export async function getTeacherLinksForStudent(
  supabase: Client,
  studentId: string,
): Promise<EditableTeacherLink[]> {
  const childId = await childIdForStudent(supabase, studentId);
  if (!childId) return [];

  const { data, error } = await supabase
    .from('student_teachers')
    .select('id, teacher_id, subject, period, created_at, teachers(first_name, last_name)')
    .eq('child_id', childId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;

  return (data ?? []).map(row => {
    const teacher = Array.isArray(row.teachers) ? row.teachers[0] : row.teachers;
    return {
      id: row.id,
      teacherId: row.teacher_id,
      name: [teacher?.first_name, teacher?.last_name].filter(Boolean).join(' ') || null,
      subject: row.subject,
      period: row.period,
    };
  });
}

/**
 * Make the child's teacher set match `links`.
 *
 * A DIFF, not a replace-all: rows the user did not touch are left alone, so
 * their `created_at` — and therefore the "first listed" link that the legacy
 * `students.teacher_id` mirror follows (SPE-334) — does not shuffle every time
 * somebody edits a subject label.
 *
 * Deletes run LAST. Removing every link before re-adding would briefly leave
 * the child with none, and the legacy-column mirror would fire on that empty
 * moment and null out `teacher_id` on every caseload row of the child.
 *
 * Not transactional — PostgREST has no client-side transaction — so a failure
 * midway leaves a partially-applied set. The operations are individually
 * idempotent and the UI re-reads afterwards, so a retry converges; the
 * alternative (an RPC) is more surface than this ticket needs.
 */
export async function saveTeacherLinksForStudent(
  supabase: Client,
  studentId: string,
  links: EditableTeacherLink[],
): Promise<void> {
  const childId = await childIdForStudent(supabase, studentId);
  if (!childId) throw new Error('This student has no child record yet; reload and try again.');

  const existing = await getTeacherLinksForStudent(supabase, studentId);
  const existingByTeacher = new Map(existing.map(l => [l.teacherId, l]));

  // Guard against a double-added teacher slipping through as a unique violation.
  const wanted = new Map<string, EditableTeacherLink>();
  for (const link of links) {
    if (link.teacherId) wanted.set(link.teacherId, link);
  }

  const toInsert = [...wanted.values()].filter(l => !existingByTeacher.has(l.teacherId));
  const toUpdate = [...wanted.values()].filter(l => {
    const prev = existingByTeacher.get(l.teacherId);
    return prev && (prev.subject !== l.subject || prev.period !== l.period);
  });
  const toDelete = existing.filter(l => !wanted.has(l.teacherId));

  if (toInsert.length > 0) {
    const { error } = await supabase.from('student_teachers').insert(
      toInsert.map(l => ({
        child_id: childId,
        teacher_id: l.teacherId,
        subject: l.subject,
        period: l.period,
      })),
    );
    if (error) throw error;
  }

  for (const link of toUpdate) {
    const { error } = await supabase
      .from('student_teachers')
      .update({ subject: link.subject, period: link.period })
      .eq('child_id', childId)
      .eq('teacher_id', link.teacherId);
    if (error) throw error;
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('student_teachers')
      .delete()
      .eq('child_id', childId)
      .in('teacher_id', toDelete.map(l => l.teacherId));
    if (error) throw error;
  }
}

/**
 * Link one more teacher to a student, leaving the rest of the set alone.
 *
 * Idempotent: the `(child_id, teacher_id)` unique constraint means re-adding
 * an existing teacher is a no-op rather than an error, so callers can assign
 * without first checking.
 */
export async function addTeacherLinkForStudent(
  supabase: Client,
  studentId: string,
  teacherId: string,
): Promise<void> {
  const childId = await childIdForStudent(supabase, studentId);
  if (!childId) throw new Error('This student has no child record yet; reload and try again.');

  const { error } = await supabase
    .from('student_teachers')
    .upsert({ child_id: childId, teacher_id: teacherId }, { onConflict: 'child_id,teacher_id', ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * Teacher sets for a page of students, keyed by `students.id`.
 *
 * Two round trips for the whole table rather than one per row.
 */
export async function getTeacherSetsForStudents(
  supabase: Client,
  studentIds: string[],
): Promise<Map<string, LinkedTeacher[]>> {
  const byStudent = new Map<string, LinkedTeacher[]>();
  const unique = Array.from(new Set(studentIds.filter(Boolean)));
  if (unique.length === 0) return byStudent;

  const { data: rows, error } = await supabase
    .from('students').select('id, child_id').in('id', unique);
  if (error) throw error;

  const childIds = (rows ?? []).map(r => r.child_id).filter((c): c is string => !!c);
  const byChild = await getTeachersByChildId(supabase, childIds);

  for (const row of rows ?? []) {
    byStudent.set(row.id, row.child_id ? (byChild.get(row.child_id) ?? []) : []);
  }
  return byStudent;
}
