'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useAutoSchedule } from '../../../lib/supabase/hooks/use-auto-schedule';
import { Button } from '../ui/button';
import { saveScheduleSnapshot } from './undo-schedule';

interface ScheduleSessionsProps {
  onComplete?: () => void;
  currentSchool?: {
    school_site: string;
    school_district: string;
  } | null;
  unscheduledCount: number;
}

export function ScheduleSessions({ onComplete, currentSchool, unscheduledCount }: ScheduleSessionsProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { scheduleBatchStudents } = useAutoSchedule();
  const supabase = createClientComponentClient();

  const handleScheduleSessions = async () => {
    if (unscheduledCount === 0) return;

    const confirmMessage = `This will schedule ${unscheduledCount} new session${unscheduledCount !== 1 ? 's' : ''}. 

These are sessions that have never been scheduled before.

Continue?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsProcessing(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get students for current school only
      let studentsQuery = supabase
        .from('students')
        .select('*')
        .eq('provider_id', user.id);

      if (currentSchool) {
        studentsQuery = studentsQuery.eq('school_site', currentSchool.school_site);
      }

      const { data: allStudents } = await studentsQuery;

      if (!allStudents || allStudents.length === 0) {
        alert('No students found');
        return;
      }

      // Get existing sessions to determine which students need scheduling
      const { data: existingSessions } = await supabase
        .from('schedule_sessions')
        .select('student_id')
        .eq('provider_id', user.id);

      // Count sessions per student
      const sessionCounts = existingSessions?.reduce((acc, session) => {
        acc[session.student_id] = (acc[session.student_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      // Filter students who need scheduling
      const studentsNeedingScheduling = allStudents.filter(student => {
        const currentSessions = sessionCounts[student.id] || 0;
        return currentSessions < student.sessions_per_week;
      });

      if (studentsNeedingScheduling.length === 0) {
        alert('All students are fully scheduled!');
        return;
      }

      console.log(`Found ${studentsNeedingScheduling.length} students needing scheduling`);

      // Save snapshot before making changes
      await saveScheduleSnapshot(user.id);

      // Schedule only these students
      const results = await scheduleBatchStudents(studentsNeedingScheduling);

      // Check if all sessions were successfully scheduled
      if (results.totalFailed > 0) {
        alert(`Scheduling partially complete.\n\nScheduled: ${results.totalScheduled} students\nFailed: ${results.totalFailed} students\n\nThe system couldn't place all sessions due to conflicts. You may need to:\n- Adjust the number of sessions per student\n- Modify bell schedules or special activities\n\nErrors:\n${results.errors.slice(0, 5).join('\n')}`);
      } else {
        alert(`Successfully scheduled ${results.totalScheduled} students!`);
      }

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error scheduling sessions:', error);
      alert('Failed to schedule sessions: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Button
      onClick={handleScheduleSessions}
      disabled={isProcessing || unscheduledCount === 0}
      variant={unscheduledCount > 0 ? "primary" : "secondary"}
      className={unscheduledCount === 0 ? "opacity-50 cursor-not-allowed" : ""}
      title={unscheduledCount === 0 ? "No sessions to schedule" : `Schedule ${unscheduledCount} session${unscheduledCount !== 1 ? 's' : ''}`}
    >
      {isProcessing ? 'Scheduling...' : 'Schedule Sessions'}
    </Button>
  );
}