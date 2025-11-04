import { createClient } from '@/lib/supabase/client';
import { safeQuery } from '@/lib/supabase/safe-query';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import type { Database } from '../../../src/types/database';

/**
 * Calculate how many sessions still need to be scheduled this week.
 *
 * Combines the required sessions_per_week for each student with the number of
 * sessions already scheduled to return the remaining count.
 */
export async function getUnscheduledSessionsCount(
  school: {
    school_id?: string | null;
    district_id?: string | null;
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
  // IMPORTANT: Only fetch sessions for students at THIS school to avoid cross-school contamination
  const sessionsPerf = measurePerformanceWithAlerts('fetch_unscheduled_sessions_count', 'database');
  const sessionsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('schedule_sessions')
        .select('id')
        .in('student_id', studentIds)
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