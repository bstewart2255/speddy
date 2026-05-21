import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';

/**
 * Removes a schedule_sessions row while preserving instance history.
 *
 * - A dated instance the user explicitly removed is hard-deleted.
 * - A template that has >=1 dated instance is soft-deleted (deleted_at set), so
 *   those instances keep a valid template_id and completed history survives.
 * - A template with no instances is hard-deleted (nothing to preserve).
 *
 * Template reads must filter `.is('deleted_at', null)` so archived templates stay
 * out of the schedule grid, count math, conflict checks, and instance generation.
 */
export async function deleteOrArchiveTemplate(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<{ archived: boolean; error: PostgrestError | Error | null }> {
  const { data: row, error: fetchError } = await supabase
    .from('schedule_sessions')
    .select('id, session_date')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) return { archived: false, error: fetchError };
  if (!row) return { archived: false, error: new Error(`Session ${sessionId} not found`) };

  // A dated instance is removed outright; history preservation is about template lineage.
  if (row.session_date !== null) {
    const { error } = await supabase.from('schedule_sessions').delete().eq('id', sessionId);
    return { archived: false, error };
  }

  // Template: archive only if it has instances worth keeping.
  const { count, error: countError } = await supabase
    .from('schedule_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', sessionId);

  if (countError) return { archived: false, error: countError };

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from('schedule_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId);
    return { archived: true, error };
  }

  const { error } = await supabase.from('schedule_sessions').delete().eq('id', sessionId);
  return { archived: false, error };
}

/**
 * Calculate how many sessions still need to be scheduled this week.
 *
 * Combines the required sessions_per_week for each student with the number of
 * sessions already scheduled to return the remaining count.
 *
 * @param school - School information for filtering. district_id is included for
 *                 type compatibility with school objects but is not used in filtering.
 *                 School identification uses either school_id (normalized) or the
 *                 combination of school_site + school_district (legacy).
 */
export async function getUnscheduledSessionsCount(
  school: {
    school_id?: string | null;
    district_id?: string | null; // Included for type compatibility, not used in filtering
    school_site?: string | null;
    school_district?: string | null;
  } | null
) {
  const supabase = createClient<Database>();

  const authResult = await safeQuery(
    async () => supabase.auth.getUser(),
    { operation: 'get_user_for_unscheduled_count' }
  );

  if (authResult.error || !authResult.data?.data.user) {
    throw new Error('Not authenticated');
  }

  const user = authResult.data.data.user;

  // Get all students and their requirements for the current school
  const studentsPerf = measurePerformanceWithAlerts('fetch_students_for_unscheduled_count', 'database');
  const studentsResult = await safeQuery(
    async () => {
      let studentsQuery = supabase
        .from('students')
        .select('id, sessions_per_week')
        .eq('provider_id', user.id);

      // Filter by school using normalized fields (school_id) if available,
      // otherwise fall back to legacy fields (school_site + school_district)
      if (school) {
        if (school.school_id) {
          studentsQuery = studentsQuery.eq('school_id', school.school_id);
        } else if (school.school_site && school.school_district) {
          // Legacy schools without school_id
          studentsQuery = studentsQuery
            .eq('school_site', school.school_site)
            .eq('school_district', school.school_district);
        } else if (school.school_site || school.school_district) {
          // Incomplete school data - don't filter to prevent incorrect results
          console.warn('[getUnscheduledSessionsCount] Incomplete school data provided:', {
            school_id: school.school_id,
            school_site: school.school_site,
            school_district: school.school_district
          });
          throw new Error('Incomplete school data: both school_site and school_district are required when school_id is not available');
        }
      }

      const { data, error } = await studentsQuery;
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_students_for_unscheduled_count',
      userId: user.id,
      schoolId: school?.school_id,
      schoolSite: school?.school_site
    }
  );
  studentsPerf.end({ success: !studentsResult.error });

  if (studentsResult.error) throw studentsResult.error;

  const students = studentsResult.data || [];
  if (!Array.isArray(students) || students.length === 0) return 0;

  // Get student IDs from the already-filtered students list
  const studentIds = students.map(s => s.id);

  // Get current UNSCHEDULED sessions (day_of_week, start_time, end_time are null)
  // IMPORTANT: Only count template/unscheduled sessions (session_date IS NULL), not dated instances
  // Dated instances with null day/time are historical records, not sessions that need scheduling
  const sessionsPerf = measurePerformanceWithAlerts('fetch_unscheduled_sessions_count', 'database');
  const sessionsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('schedule_sessions')
        .select('id')
        .in('student_id', studentIds)
        .is('session_date', null) // Only templates/unscheduled, not dated instances
        .is('deleted_at', null)
        .is('day_of_week', null)
        .is('start_time', null)
        .is('end_time', null);
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_unscheduled_sessions_count',
      userId: user.id,
      schoolId: school?.school_id,
      schoolSite: school?.school_site
    }
  );
  sessionsPerf.end({ success: !sessionsResult.error });

  if (sessionsResult.error) throw sessionsResult.error;

  const unscheduledSessions = sessionsResult.data || [];

  // Return the count of actual unscheduled sessions
  return Array.isArray(unscheduledSessions) ? unscheduledSessions.length : 0;
}