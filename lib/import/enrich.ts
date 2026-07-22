/**
 * Enrichment data access + teacher matching for the bulk import preview
 * (SPE-230).
 *
 * Owns the Supabase reads that feed matching (profile, existing students,
 * details, teachers) and the class-list teacher resolution. Kept free of any
 * runtime import of the Supabase server module (the client is passed in), so
 * `classify` can import `resolveClassListTeacher` without pulling server-only
 * code into unit tests.
 */
import { matchTeacher, TeacherInfo } from '@/lib/parsers/class-list-parser';
import type {
  DbTeacherRow,
  ImportSupabaseClient,
  JoinedExistingStudent,
  TeacherMatch,
} from '@/lib/import/preview-types';
import type { ExistingStudentRow, StudentDetailRow } from '@/lib/import/classify';

/**
 * Resolve a class-list teacher against the school's teachers, falling back to
 * the raw class-list name when no DB teacher resolves. Verbatim behavior from
 * the main and update-only paths.
 */
export function resolveClassListTeacher(teacher: TeacherInfo, dbTeachers: DbTeacherRow[]): TeacherMatch {
  const teacherMatch = matchTeacher(teacher, dbTeachers);
  return {
    teacherId: teacherMatch.teacherId,
    teacherName: teacherMatch.teacherName || teacher.rawName,
    confidence: teacherMatch.confidence,
    reason: teacherMatch.reason,
  };
}

/** Fetch the user's profile (multi-school flag + role). */
export async function loadProfile(
  supabase: ImportSupabaseClient,
  userId: string
): Promise<{ works_at_multiple_schools?: boolean | null; role?: string | null } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('works_at_multiple_schools, role')
    .eq('id', userId)
    .single();
  return data;
}

/** Fetch the provider's existing students (flat shape for the main path). */
export async function loadExistingStudents(
  supabase: ImportSupabaseClient,
  userId: string
): Promise<{ data: ExistingStudentRow[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('students')
    .select('id, initials, grade_level, school_site, school_id, sessions_per_week, minutes_per_session, teacher_id')
    .eq('provider_id', userId);
  return { data: (data as unknown as ExistingStudentRow[] | null), error };
}

/**
 * Fetch student details (names + goals) for the given students, for matching.
 * Surfaces the query error (SPE-284): the caller must know whether a null result
 * means "no details rows" vs "the load failed" — treating a failed load as
 * "every student is nameless" would let the initials-enrichment fallback
 * overwrite a real (merely-unloaded) name.
 */
export async function loadStudentDetails(
  supabase: ImportSupabaseClient,
  dbStudents: Array<{ id: string }> | null | undefined
): Promise<{ data: StudentDetailRow[] | null; error: unknown }> {
  if (!dbStudents || dbStudents.length === 0) return { data: null, error: null };
  const { data, error } = await supabase
    .from('student_details')
    .select('student_id, first_name, last_name, iep_goals, upcoming_iep_date, upcoming_triennial_date')
    .in('student_id', dbStudents.map(s => s.id));
  return { data: (data as unknown as StudentDetailRow[] | null), error };
}

/** Fetch the provider's existing students joined to details (update-only path). */
export async function loadJoinedStudents(
  supabase: ImportSupabaseClient,
  userId: string
): Promise<{ data: JoinedExistingStudent[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('students')
    .select(`
      id,
      initials,
      grade_level,
      school_site,
      school_id,
      student_details!inner(first_name, last_name, upcoming_iep_date, upcoming_triennial_date)
    `)
    .eq('provider_id', userId);
  return { data: (data as unknown as JoinedExistingStudent[] | null), error };
}

/** Fetch teachers at a school for class-list / roster teacher matching. */
export async function fetchTeachers(
  supabase: ImportSupabaseClient,
  schoolId: string | null
): Promise<DbTeacherRow[]> {
  const { data } = await supabase
    .from('teachers')
    .select('id, first_name, last_name')
    .eq('school_id', schoolId || '');
  return (data as unknown as DbTeacherRow[] | null) || [];
}
