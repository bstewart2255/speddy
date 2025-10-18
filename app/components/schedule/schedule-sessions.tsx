'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAutoSchedule } from '../../../lib/supabase/hooks/use-auto-schedule';
import { Button } from '../ui/button';
import { saveScheduleSnapshot } from './undo-schedule';
import { ManualPlacementModal } from './manual-placement-modal';

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
      const result = await placeSessionsManually(unplacedStudents);
      
      if (result.success) {
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
      alert('Failed to place sessions manually: ' + error.message);
    } finally {
      setIsPlacingManually(false);
      setShowManualPlacementModal(false);
    }
  };

  const handleKeepUnscheduled = () => {
    // Just close the modal and refresh
    setShowManualPlacementModal(false);
    if (onComplete) {
      onComplete();
    }
  };

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

      // Filter students for the current school if specified
      const studentsForCurrentSchool = currentSchool 
        ? allStudents.filter(student => student.school_site === currentSchool.school_site)
        : allStudents;

      // Get existing sessions to determine which students need scheduling
      // IMPORTANT: We select all fields to ensure accurate counting and prevent duplicate sessions
      const { data: existingSessions } = await supabase
        .from('schedule_sessions')
        .select('*')
        .eq('provider_id', user.id);

      // Count sessions per student
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

      // Check if all sessions were successfully scheduled
      if (results.totalFailed > 0 && results.canManuallyPlace) {
        // Show manual placement modal
        setUnplacedStudents(results.unplacedStudents || []);
        setShowManualPlacementModal(true);
      } else if (results.totalFailed > 0) {
        alert(`Scheduling partially complete.\n\nScheduled: ${results.totalScheduled} students\nFailed: ${results.totalFailed} students\n\nThe system couldn't place all sessions due to conflicts. You may need to:\n- Adjust the number of sessions per student\n- Modify bell schedules or special activities\n\nErrors:\n${results.errors.slice(0, 5).join('\n')}`);
        // Call onComplete callback if provided
        if (onComplete) {
          onComplete();
        }
      } else {
        alert(`Successfully scheduled ${results.totalScheduled} students!`);
        // Call onComplete callback if provided
        if (onComplete) {
          onComplete();
        }
      }
    } catch (error) {
      if (debug) console.error('Error scheduling sessions:', error);
      alert('Failed to schedule sessions: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleScheduleSessions}
        disabled={isProcessing || unscheduledCount === 0}
        variant={unscheduledCount > 0 ? "primary" : "secondary"}
        className={unscheduledCount === 0 ? "opacity-50 cursor-not-allowed" : ""}
        title={unscheduledCount === 0 ? "No sessions to schedule" : `Schedule ${unscheduledCount} session${unscheduledCount !== 1 ? 's' : ''}`}
      >
        {isProcessing ? 'Scheduling...' : 'Schedule Sessions'}
      </Button>

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