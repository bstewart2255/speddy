'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useAutoSchedule } from '../../../lib/supabase/hooks/use-auto-schedule';
import { Button } from '../ui/button';

export function AutoScheduleAll() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { scheduleBatchStudents } = useAutoSchedule();
  const supabase = createClientComponentClient();

  const handleScheduleAll = async () => {
    if (!confirm('This will auto-schedule sessions for all students who are missing sessions. Continue?')) {
      return;
    }

    setIsProcessing(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get all students
      const { data: allStudents } = await supabase
        .from('students')
        .select('*')
        .eq('provider_id', user.id);

      if (!allStudents || allStudents.length === 0) {
        alert('No students found');
        return;
      }

      // Get existing sessions to find which students need scheduling
      const { data: existingSessions } = await supabase
        .from('schedule_sessions')
        .select('student_id')
        .eq('provider_id', user.id);

      // Count sessions per student
      const sessionCounts = new Map<string, number>();
      existingSessions?.forEach(session => {
        const count = sessionCounts.get(session.student_id) || 0;
        sessionCounts.set(session.student_id, count + 1);
      });

      // Find students who need sessions
      const studentsNeedingScheduling = allStudents.filter(student => {
        const currentSessions = sessionCounts.get(student.id) || 0;
        return currentSessions < student.sessions_per_week;
      });

      if (studentsNeedingScheduling.length === 0) {
        alert('All students are fully scheduled!');
        return;
      }

      console.log(`Found ${studentsNeedingScheduling.length} students needing sessions`);

      // Schedule them
      const results = await scheduleBatchStudents(studentsNeedingScheduling);

      alert(`Scheduling complete!\n\nScheduled: ${results.totalScheduled} students\nFailed: ${results.totalFailed} students${
        results.errors.length > 0 ? '\n\nErrors:\n' + results.errors.slice(0, 5).join('\n') : ''
      }`);

      // Refresh the page to show new sessions
      window.location.reload();
    } catch (error) {
      console.error('Error in batch scheduling:', error);
      alert('Failed to schedule students: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Button
      onClick={handleScheduleAll}
      disabled={isProcessing}
      variant="primary"
    >
      {isProcessing ? 'Scheduling...' : 'Auto-Schedule All Missing Sessions'}
    </Button>
  );
}