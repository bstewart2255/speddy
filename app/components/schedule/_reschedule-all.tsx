'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAutoSchedule } from '../../../lib/supabase/hooks/use-auto-schedule';
import { Button } from '../ui/button';
import { LongHoverTooltip } from '../ui/long-hover-tooltip';
import { saveScheduleSnapshot, saveScheduledSessionIds } from './undo-schedule';

interface RescheduleAllProps {
  onComplete?: () => void;
  currentSchool?: {
    school_site: string;
    school_district: string;
  } | null;
}

export function RescheduleAll({ onComplete, currentSchool }: RescheduleAllProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { scheduleBatchStudents } = useAutoSchedule();
  const supabase = createClient();

  const handleRescheduleAll = async () => {
    const confirmMessage = `This will clear your entire schedule and rebuild it from scratch. 

This is useful when:
- You've added new students or changed session requirements
- Your bell schedules or special activities have changed
- You want to optimize your current schedule

Continue?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsProcessing(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Save snapshot before making changes
      await saveScheduleSnapshot(user.id);

      // Clear all existing sessions
      const { error: deleteError } = await supabase
        .from('schedule_sessions')
        .delete()
        .eq('provider_id', user.id);

      if (deleteError) throw deleteError;

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
        alert('No students found to schedule');
        return;
      }

      console.log(`Rescheduling ${allStudents.length} students`);

      // Schedule all students
      const results = await scheduleBatchStudents(allStudents);

      // Finalize the snapshot with the newly scheduled session IDs
      await saveScheduledSessionIds(user.id);

      alert(`Rescheduling complete!\n\nScheduled: ${results.totalScheduled} students\nFailed: ${results.totalFailed} students${
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
      console.error('Error in rescheduling:', error);
      alert('Failed to reschedule: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <LongHoverTooltip content="Clear the entire schedule and rebuild from scratch using the auto-scheduler. You can undo this action if needed.">
      <Button
        onClick={handleRescheduleAll}
        disabled={isProcessing}
        variant="primary"
      >
        {isProcessing ? 'Rescheduling...' : 'Re-schedule All Sessions'}
      </Button>
    </LongHoverTooltip>
  );
}