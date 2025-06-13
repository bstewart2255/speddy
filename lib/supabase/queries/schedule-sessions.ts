import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../../src/types/database';

export async function getUnscheduledSessionsCount() {
  const supabase = createClientComponentClient<Database>();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get all students and their requirements
  const { data: students } = await supabase
    .from('students')
    .select('id, sessions_per_week')
    .eq('provider_id', user.id);

  if (!students) return 0;

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