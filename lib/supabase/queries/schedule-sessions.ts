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
export async function getUnscheduledSessionsCount(schoolSite?: string | null) {
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

      // Filter by school if provided
      if (schoolSite) {
        studentsQuery = studentsQuery.eq('school_site', schoolSite);
      }

      const { data, error } = await studentsQuery;
      if (error) throw error;
      return data;
    },
    { 
      operation: 'fetch_students_for_unscheduled_count', 
      userId: user.id,
      schoolSite 
    }
  );
  studentsPerf.end({ success: !studentsResult.error });

  if (studentsResult.error) throw studentsResult.error;
  
  const students = studentsResult.data || [];
  if (!Array.isArray(students) || students.length === 0) return 0;

  // Get student IDs from the already-filtered students list
  const studentIds = students.map(s => s.id);

  // Get current scheduled sessions count per student
  // IMPORTANT: Only fetch sessions for students at THIS school to avoid cross-school contamination
  const sessionsPerf = measurePerformanceWithAlerts('fetch_sessions_for_unscheduled_count', 'database');
  const sessionsResult = await safeQuery(
    async () => {
      const { data, error } = await supabase
        .from('schedule_sessions')
        .select('student_id')
        .in('student_id', studentIds);
      if (error) throw error;
      return data;
    },
    {
      operation: 'fetch_sessions_for_unscheduled_count',
      userId: user.id,
      schoolSite
    }
  );
  sessionsPerf.end({ success: !sessionsResult.error });

  if (sessionsResult.error) throw sessionsResult.error;
  
  const sessions = sessionsResult.data || [];

  // Count sessions per student
  const sessionCounts = new Map<string, number>();
  if (Array.isArray(sessions)) {
    sessions.forEach(session => {
      const count = sessionCounts.get(session.student_id) || 0;
      sessionCounts.set(session.student_id, count + 1);
    });
  }

  // Calculate total unscheduled sessions
  let unscheduledCount = 0;
  if (Array.isArray(students)) {
    students.forEach(student => {
      const currentSessions = sessionCounts.get(student.id) || 0;
      const needed = student.sessions_per_week - currentSessions;
      if (needed > 0) unscheduledCount += needed;
    });
  }

  return unscheduledCount;
}