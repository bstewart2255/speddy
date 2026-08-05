'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAutoSchedule } from '../../../lib/supabase/hooks/use-auto-schedule';
import { isBlockedOnlyByMissingWorkdays } from '../../../lib/scheduling/optimized-scheduler';
import { Button } from '../ui/button';
import { LongHoverTooltip } from '../ui/long-hover-tooltip';
import { saveScheduleSnapshot, saveScheduledSessionIds } from './undo-schedule';
import { ManualPlacementModal } from './manual-placement-modal';

interface ScheduleSessionsProps {
  onComplete?: () => void;
  currentSchool?: {
    school_site: string;
    school_district: string;
  } | null;
  unscheduledCount: number;
  unscheduledPanelCount: number;
}

export function ScheduleSessions({ onComplete, currentSchool, unscheduledCount, unscheduledPanelCount }: ScheduleSessionsProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManualPlacementModal, setShowManualPlacementModal] = useState(false);
  const [unplacedStudents, setUnplacedStudents] = useState<any[]>([]);
  const [isPlacingManually, setIsPlacingManually] = useState(false);
  // Set debug to true only in development mode
  const debug = process.env.NODE_ENV === 'development';
  const { scheduleBatchStudents, placeSessionsManually } = useAutoSchedule(debug);
  const supabase = createClient();

  const handlePlaceAnyway = async () => {
    setIsPlacingManually(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const result = await placeSessionsManually(unplacedStudents);

      if (result.success) {
        // Finalize the snapshot with the newly scheduled session IDs
        await saveScheduledSessionIds(user.id);

        alert(`Successfully placed ${result.placedSessions.length} session${result.placedSessions.length !== 1 ? 's' : ''}. Please review the schedule for any conflicts that need manual adjustment.`);
      } else {
        alert(`Failed to place sessions: ${result.errors.join(', ')}`);
      }

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error placing sessions manually:', error);
      alert('Failed to place sessions manually: ' + (error as Error).message);
    } finally {
      setIsPlacingManually(false);
      setShowManualPlacementModal(false);
    }
  };

  const handleKeepUnscheduled = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Finalize the snapshot with whatever sessions were successfully scheduled
    // so the user can undo the auto-scheduled ones even if they skip manual placement
    if (user) {
      await saveScheduledSessionIds(user.id);
    }

    // Close the modal and refresh
    setShowManualPlacementModal(false);
    if (onComplete) {
      onComplete();
    }
  };

  const handleScheduleSessions = async () => {
    if (unscheduledCount === 0 && unscheduledPanelCount === 0) return;

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

      // Filter students for the current school if specified
      const studentsForCurrentSchool = currentSchool
        ? allStudents.filter(student => student.school_site === currentSchool.school_site)
        : allStudents;

      // Get student IDs for this school to filter sessions
      const studentIds = studentsForCurrentSchool.map(s => s.id);

      // Get existing SCHEDULED sessions to determine which students need scheduling
      // IMPORTANT: Only count sessions that are already scheduled (day_of_week IS NOT NULL)
      // Unscheduled sessions (day_of_week IS NULL) don't count as "scheduled"
      const { data: existingSessions } = await supabase
        .from('schedule_sessions')
        .select('*')
        .in('student_id', studentIds)
        .not('day_of_week', 'is', null)
        .not('start_time', 'is', null)
        .not('end_time', 'is', null);

      // Count SCHEDULED sessions per student
      const sessionCounts = existingSessions?.reduce((acc, session) => {
        acc[session.student_id] = (acc[session.student_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      // Filter students who need scheduling
      const studentsNeedingScheduling = studentsForCurrentSchool.filter(student => {
        const currentSessions = sessionCounts[student.id] || 0;
        return currentSessions < student.sessions_per_week;
      });

      if (studentsNeedingScheduling.length === 0) {
        alert('All students are fully scheduled!');
        return;
      }
      // Detailed logging to understand scheduling issues (only in debug mode)
      if (debug) {
        console.log('=== SCHEDULING ANALYSIS ===');
        console.log(`Total students at ${currentSchool?.school_site}: ${allStudents.length}`);
        console.log(`Total existing sessions: ${existingSessions?.length || 0}`);

        // Log each student's status
        allStudents.forEach(student => {
          const currentSessions = sessionCounts[student.id] || 0;
          const needed = student.sessions_per_week - currentSessions;
          console.log(`Student ${student.initials}: ${currentSessions}/${student.sessions_per_week} sessions scheduled (${needed} needed)`);
        });

        console.log(`Students needing scheduling: ${studentsNeedingScheduling.length}`);
        console.log('Students to schedule:', studentsNeedingScheduling.map(s => ({
          initials: s.initials,
          sessionsNeeded: s.sessions_per_week - (sessionCounts[s.id] || 0)
        })));
        console.log('=========================');
        console.log(`Found ${studentsNeedingScheduling.length} students needing scheduling`);
      }

      // Save snapshot before making changes
      await saveScheduleSnapshot(user.id);

      // Schedule only these students
      const results = await scheduleBatchStudents(studentsNeedingScheduling);

      // SPE-367: surface missing work days on its own, before the branching
      // below — the manual-placement branch never shows `results.errors`, and
      // this is the one failure the provider can actually fix.
      if (results.schoolsMissingWorkdays?.length) {
        const schools = results.schoolsMissingWorkdays;
        // A batch can span several schools, so say what DID schedule before
        // explaining what didn't — otherwise the run reads as a total failure.
        const placed = results.totalScheduled > 0
          ? `Scheduled ${results.totalScheduled} student${results.totalScheduled !== 1 ? 's' : ''} at your other schools.\n\n`
          : '';
        alert(
          `${placed}Can't schedule at ${schools.join(' or ')} yet.\n\n` +
          `You work at more than one school, and Speddy doesn't know which days you're ` +
          `at ${schools.length > 1 ? 'these schools' : schools[0]}. Without that it could place sessions on days ` +
          `you're somewhere else.\n\n` +
          `Go to Settings → Work Schedule, set your days, then run Auto-Schedule again.`
        );
      }

      // When missing work days explains every failure, the alert above has
      // already said the one useful thing. Following it with the generic
      // "couldn't place due to conflicts, adjust your bell schedules" message
      // would contradict it and send the provider somewhere useless.
      const blockedOnlyByWorkdays = isBlockedOnlyByMissingWorkdays(results);

      // Check if all sessions were successfully scheduled
      if (blockedOnlyByWorkdays) {
        await saveScheduledSessionIds(user.id);
        if (onComplete) {
          onComplete();
        }
      } else if (results.totalFailed > 0 && results.canManuallyPlace) {
        // Show manual placement modal (snapshot will be finalized after manual placement)
        setUnplacedStudents(results.unplacedStudents || []);
        setShowManualPlacementModal(true);
      } else if (results.totalFailed > 0) {
        // Finalize the snapshot with whatever sessions were successfully scheduled
        await saveScheduledSessionIds(user.id);

        alert(`Scheduling partially complete.\n\nScheduled: ${results.totalScheduled} students\nFailed: ${results.totalFailed} students\n\nThe system couldn't place all sessions due to conflicts. You may need to:\n- Adjust the number of sessions per student\n- Modify bell schedules or special activities\n\nErrors:\n${results.errors.slice(0, 5).join('\n')}`);
        // Call onComplete callback if provided
        if (onComplete) {
          onComplete();
        }
      } else {
        // Finalize the snapshot with the newly scheduled session IDs
        await saveScheduledSessionIds(user.id);

        alert(`Successfully scheduled ${results.totalScheduled} students!`);
        // Call onComplete callback if provided
        if (onComplete) {
          onComplete();
        }
      }
    } catch (error) {
      if (debug) console.error('Error scheduling sessions:', error);
      alert('Failed to schedule sessions: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <LongHoverTooltip content="Automatically schedule all unscheduled sessions based on student availability and scheduling constraints. This process may take a few moments.">
        <Button
          onClick={handleScheduleSessions}
          disabled={isProcessing || (unscheduledCount === 0 && unscheduledPanelCount === 0)}
          variant={(unscheduledCount > 0 || unscheduledPanelCount > 0) ? "primary" : "secondary"}
          className={(unscheduledCount === 0 && unscheduledPanelCount === 0) ? "opacity-50 cursor-not-allowed" : ""}
        >
          {isProcessing ? 'Scheduling...' : 'Auto-Schedule Sessions'}
        </Button>
      </LongHoverTooltip>

      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-lg font-medium mb-2">Scheduling Sessions</p>
              <p className="text-sm text-gray-600 text-center">
                This may take a few minutes depending on the number of students and schedule complexity.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Please don't close this window.
              </p>
            </div>
          </div>
        </div>
      )}

      <ManualPlacementModal
        isOpen={showManualPlacementModal}
        onClose={() => setShowManualPlacementModal(false)}
        unplacedCount={unplacedStudents.length}
        onPlaceAnyway={handlePlaceAnyway}
        onKeepUnscheduled={handleKeepUnscheduled}
        isPlacing={isPlacingManually}
      />
    </>
  );
}