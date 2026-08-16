import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { getCurrentSchoolYear } from '@/lib/school-year';
import type { Database } from '../../../src/types/database';

export type StudentServiceTime = Database['public']['Tables']['student_service_times']['Row'];
export type ServiceTimeSetting = 'own_room' | 'push_in';

/** Row plus the display joins the week view and student section render. */
export interface StudentServiceTimeWithJoins extends StudentServiceTime {
  students: { initials: string | null; grade_level: string | null } | null;
  teachers: { first_name: string | null; last_name: string | null } | null;
}

const JOINED_COLUMNS =
  '*, students(initials, grade_level), teachers(first_name, last_name)';

export interface StudentServiceTimeInput {
  student_id: string;
  school_id: string;
  setting: ServiceTimeSetting;
  /** Which period of the school's grid ("Period 3", "Advisory"). */
  period_name: string;
  /** Destination classroom — required for push_in, must be absent for own_room. */
  teacher_id: string | null;
  note?: string | null;
}

/**
 * Insert service-time entries for the authenticated provider — one row per
 * selected weekday (SPE-513). RLS enforces ownership, the caseload check and
 * the school bindings; this asserts rows actually persisted rather than
 * trusting a 2xx, because PostgREST reports an RLS-filtered write as success
 * with an empty body.
 */
export async function addStudentServiceTimes(
  input: StudentServiceTimeInput,
  daysOfWeek: number[]
): Promise<StudentServiceTime[]> {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_add_student_service_times' }
  );
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }
  const user = authResult.data.data.user;

  const note = input.note?.trim() || null;
  const rows = daysOfWeek.map(day => ({
    provider_id: user.id,
    student_id: input.student_id,
    school_id: input.school_id,
    day_of_week: day,
    setting: input.setting,
    period_name: input.period_name.trim(),
    teacher_id: input.setting === 'push_in' ? input.teacher_id : null,
    note,
    school_year: getCurrentSchoolYear(),
  }));

  const insertPerf = measurePerformanceWithAlerts('add_student_service_times', 'database');
  const insertResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('student_service_times')
        .insert(rows)
        .select();
      if (error) throw error;
      if (!data || data.length !== rows.length) {
        throw new Error(
          `Service times not saved (${data?.length ?? 0} of ${rows.length} persisted) — likely blocked by row-level security`
        );
      }
      return data;
    },
    {
      operation: 'add_student_service_times',
      userId: user.id,
      studentId: input.student_id,
      days: daysOfWeek.join(','),
    }
  );
  insertPerf.end({ success: !insertResult.error });

  if (insertResult.error) throw insertResult.error;
  return insertResult.data!;
}

/**
 * Delete one service-time entry owned by the current user. The explicit owner
 * filter plus the returned-row check make an RLS-filtered no-op fail loudly
 * instead of reporting success.
 */
export async function deleteStudentServiceTime(id: string): Promise<void> {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    () => supabase.auth.getUser(),
    { operation: 'get_user_for_delete_student_service_time' }
  );
  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }
  const user = authResult.data.data.user;

  const deletePerf = measurePerformanceWithAlerts('delete_student_service_time', 'database');
  const deleteResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('student_service_times')
        .delete()
        .eq('id', id)
        .eq('provider_id', user.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Service time not found or not yours to delete');
      }
      return null;
    },
    { operation: 'delete_student_service_time', userId: user.id, serviceTimeId: id }
  );
  deletePerf.end({ success: !deleteResult.error });

  if (deleteResult.error) throw deleteResult.error;
}

/**
 * The signed-in provider's service-time entries at one school for the current
 * year, with the display joins — the week view's data set.
 */
export async function getMyServiceTimesForSchool(
  schoolId: string
): Promise<StudentServiceTimeWithJoins[]> {
  const supabase = createClient<Database>();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('student_service_times')
    .select(JOINED_COLUMNS)
    .eq('provider_id', auth.user.id)
    .eq('school_id', schoolId)
    .eq('school_year', getCurrentSchoolYear())
    .order('day_of_week', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as StudentServiceTimeWithJoins[];
}

/**
 * The signed-in provider's entries for ONE student ("Where I see this
 * student", the student-modal section). Deliberately provider-scoped: the
 * section describes the caller's own service, not every co-server's.
 */
export async function getMyServiceTimesForStudent(
  studentId: string
): Promise<StudentServiceTimeWithJoins[]> {
  const supabase = createClient<Database>();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('student_service_times')
    .select(JOINED_COLUMNS)
    .eq('provider_id', auth.user.id)
    .eq('student_id', studentId)
    .eq('school_year', getCurrentSchoolYear())
    .order('day_of_week', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as StudentServiceTimeWithJoins[];
}

/** One period of a school's grid, with its earliest start across the week. */
export interface SchoolPeriod {
  name: string;
  /** "HH:MM" of the period's earliest start across the week — the sort key. */
  earliestStart: string;
}

/**
 * The school's period grid as an ordered list of period names (SPE-491 bell
 * rows, school_id-keyed — a school without normalized rows has no grid, the
 * same legacy rule the scheduling data manager applies). Deduplicated across
 * days/providers and ordered by earliest start, so "Period A" (zero period)
 * leads and lunch falls where it belongs. Returns [] when no grid exists —
 * callers fall back to the standard secondary picklist.
 */
export async function getSchoolPeriodGrid(schoolId: string): Promise<SchoolPeriod[]> {
  const supabase = createClient<Database>();

  const { data, error } = await supabase
    .from('bell_schedules')
    .select('period_name, start_time')
    .eq('school_id', schoolId)
    .eq('school_year', getCurrentSchoolYear())
    .not('period_name', 'is', null);
  if (error) throw error;

  const earliestByName = new Map<string, string>();
  for (const row of data ?? []) {
    const name = row.period_name?.trim();
    if (!name) continue;
    const start = (row.start_time ?? '').slice(0, 5);
    const existing = earliestByName.get(name);
    if (!existing || start < existing) {
      earliestByName.set(name, start);
    }
  }

  return Array.from(earliestByName.entries())
    .map(([name, earliestStart]) => ({ name, earliestStart }))
    .sort(
      (a, b) =>
        a.earliestStart.localeCompare(b.earliestStart) ||
        a.name.localeCompare(b.name)
    );
}
