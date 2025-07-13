'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAutoSchedule } from '../../../lib/supabase/hooks/use-auto-schedule';
import { Button } from '../ui/button';
import { saveScheduleSnapshot } from './undo-schedule';

interface ScheduleNewSessionsProps {
  onComplete?: () => void;
  currentSchool?: {
    school_site: string;
    school_district: string;
  } | null;
}

  export function ScheduleNewSessions({ onComplete, currentSchool }: ScheduleNewSessionsProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { scheduleBatchStudents } = useAutoSchedule();
  const supabase = createClient();

  const handleScheduleNew = async () => {
    const confirmMessage = `This will schedule only new/unscheduled sessions while keeping existing sessions intact.

This is useful when:
- You've added new students to your caseload
- You've increased session frequency for existing students
- Some sessions failed to schedule previously

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

      alert(`Scheduling complete!\n\nScheduled: ${results.totalScheduled} students\nFailed: ${results.totalFailed} students${
        results.errors.length > 0 ? '\n\nErrors:\n' + results.errors.slice(0, 5).join('\n') : ''
      }`);

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      } else {
        // Refresh the page to show new sessions
        window.location.reload();
      }
    } catch (error) {
      console.error('Error in scheduling new sessions:', error);
      alert('Failed to schedule new sessions: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Button
      onClick={handleScheduleNew}
      disabled={isProcessing}
      variant="secondary"
    >
      {isProcessing ? 'Scheduling...' : 'Schedule-in New Sessions'}
    </Button>
  );
}