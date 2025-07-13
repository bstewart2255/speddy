import { createClient } from '@/lib/supabase/client';
import type { Database } from '../../../src/types/database';

/**
 * Calculate how many sessions still need to be scheduled this week.
 *
 * Combines the required sessions_per_week for each student with the number of
 * sessions already scheduled to return the remaining count.
 */
export async function getUnscheduledSessionsCount(schoolSite?: string | null) {
  const supabase = createClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get all students and their requirements for the current school
  let studentsQuery = supabase
    .from('students')
    .select('id, sessions_per_week')
    .eq('provider_id', user.id);

  // Filter by school if provided
  if (schoolSite) {
    studentsQuery = studentsQuery.eq('school_site', schoolSite);
  }

  const { data: students } = await studentsQuery;

  if (!students || students.length === 0) return 0;

  // Get current scheduled sessions count per student
  const { data: sessions } = await supabase
    .from('schedule_sessions')
    .select('student_id')
    .eq('provider_id', user.id);

  // Count sessions per student
  const sessionCounts = new Map<string, number>();
  sessions?.forEach(session => {
    const count = sessionCounts.get(session.student_id) || 0;
    sessionCounts.set(session.student_id, count + 1);
  });

  // Calculate total unscheduled sessions
  let unscheduledCount = 0;
  students.forEach(student => {
    const currentSessions = sessionCounts.get(student.id) || 0;
    const needed = student.sessions_per_week - currentSessions;
    if (needed > 0) unscheduledCount += needed;
  });

  return unscheduledCount;
}