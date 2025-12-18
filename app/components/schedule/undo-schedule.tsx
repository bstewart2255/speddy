'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '../ui/button';
import { LongHoverTooltip } from '../ui/long-hover-tooltip';

interface UndoScheduleProps {
  onComplete?: () => void;
}

interface ScheduleSnapshot {
  timestamp: Date;
  scheduledSessionIds: string[];
}

export function UndoSchedule({ onComplete }: UndoScheduleProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<ScheduleSnapshot | null>(null);
  const supabase = createClient();

  // Load the last snapshot from localStorage on component mount
  useEffect(() => {
    const savedSnapshot = localStorage.getItem('scheduleSnapshot');
    if (savedSnapshot) {
      const parsed = JSON.parse(savedSnapshot);
      setLastSnapshot({
        timestamp: new Date(parsed.timestamp),
        scheduledSessionIds: parsed.scheduledSessionIds || []
      });
    }
  }, []);

  const handleUndo = async () => {
    if (!lastSnapshot) {
      alert('No previous schedule to restore');
      return;
    }

    if (lastSnapshot.scheduledSessionIds.length === 0) {
      alert('No sessions to unschedule');
      localStorage.removeItem('scheduleSnapshot');
      setLastSnapshot(null);
      return;
    }

    const timeSinceSnapshot = Date.now() - lastSnapshot.timestamp.getTime();
    const minutesSince = Math.floor(timeSinceSnapshot / 60000);

    const confirmMessage = `This will unschedule ${lastSnapshot.scheduledSessionIds.length} session${lastSnapshot.scheduledSessionIds.length !== 1 ? 's' : ''} that were scheduled ${minutesSince} minute${minutesSince !== 1 ? 's' : ''} ago.

The sessions will be moved back to the unscheduled section.

Continue?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsProcessing(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Unschedule only the sessions that were scheduled during the operation
      // Set their day_of_week, start_time, and end_time to null
      const { data: updatedSessions, error: updateError } = await supabase
        .from('schedule_sessions')
        .update({
          day_of_week: null,
          start_time: null,
          end_time: null,
          status: 'active',
          conflict_reason: null
        })
        .in('id', lastSnapshot.scheduledSessionIds)
        .eq('provider_id', user.id)
        .select();

      if (updateError) throw updateError;

      const actualUnscheduled = updatedSessions?.length || 0;
      const expectedCount = lastSnapshot.scheduledSessionIds.length;

      if (actualUnscheduled < expectedCount) {
        alert(`Partially unscheduled: ${actualUnscheduled} of ${expectedCount} session${expectedCount !== 1 ? 's' : ''}.\n\nSome sessions may have been manually deleted.`);
      } else {
        alert(`Successfully unscheduled ${actualUnscheduled} session${actualUnscheduled !== 1 ? 's' : ''}!`);
      }

      // Clear the snapshot after successful undo
      localStorage.removeItem('scheduleSnapshot');
      setLastSnapshot(null);

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      } else {
        // Refresh the page to show unscheduled sessions
        window.location.reload();
      }
    } catch (error) {
      console.error('Error unscheduling sessions:', error);
      alert('Failed to unschedule sessions: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Don't show the button if there's no snapshot or no sessions to undo
  // (handles old snapshot format gracefully)
  if (!lastSnapshot || !lastSnapshot.scheduledSessionIds || lastSnapshot.scheduledSessionIds.length === 0) {
    return null;
  }

  const timeSinceSnapshot = Date.now() - lastSnapshot.timestamp.getTime();
  const minutesSince = Math.floor(timeSinceSnapshot / 60000);

  return (
    <LongHoverTooltip content="Revert the last scheduling action. This will restore sessions to their previous state before the most recent auto-schedule or manual change.">
      <Button
        onClick={handleUndo}
        disabled={isProcessing}
        variant="secondary"
        aria-label={`Undo - Unschedule ${lastSnapshot.scheduledSessionIds.length} session${lastSnapshot.scheduledSessionIds.length !== 1 ? 's' : ''} from ${minutesSince} minute${minutesSince !== 1 ? 's' : ''} ago`}
        className="p-2"
      >
        {isProcessing ? (
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600" />
        ) : (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z"
          />
        </svg>
        )}
      </Button>
    </LongHoverTooltip>
  );
}

// Helper function to save current schedule snapshot (before scheduling operation)
export async function saveScheduleSnapshot(providerId: string) {
  const supabase = createClient();

  try {
    // Get IDs of all currently scheduled sessions (not unscheduled ones)
    const { data: sessions, error } = await supabase
      .from('schedule_sessions')
      .select('id')
      .eq('provider_id', providerId)
      .not('day_of_week', 'is', null)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null);

    if (error) throw error;

    const beforeScheduledIds = sessions?.map(s => s.id) || [];

    // Save to localStorage as the "before" state
    const snapshot = {
      timestamp: new Date().toISOString(),
      beforeScheduledIds,
      scheduledSessionIds: [] // Will be populated after scheduling
    };

    localStorage.setItem('scheduleSnapshot', JSON.stringify(snapshot));
    console.log(`Saved snapshot with ${beforeScheduledIds.length} existing scheduled sessions`);
  } catch (error) {
    console.error('Error saving schedule snapshot:', error);
  }
}

// Helper function to finalize the snapshot after scheduling (after scheduling operation)
export async function saveScheduledSessionIds(providerId: string) {
  const supabase = createClient();

  try {
    // Get the current snapshot
    const savedSnapshot = localStorage.getItem('scheduleSnapshot');
    if (!savedSnapshot) {
      console.warn('No snapshot found to finalize');
      return;
    }

    const snapshot = JSON.parse(savedSnapshot);
    const beforeScheduledIds = snapshot.beforeScheduledIds || [];

    // Get IDs of all currently scheduled sessions
    const { data: sessions, error } = await supabase
      .from('schedule_sessions')
      .select('id')
      .eq('provider_id', providerId)
      .not('day_of_week', 'is', null)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null);

    if (error) throw error;

    const afterScheduledIds = sessions?.map(s => s.id) || [];

    // Find the difference: sessions that are now scheduled but weren't before
    const newlyScheduledIds = afterScheduledIds.filter(id => !beforeScheduledIds.includes(id));

    // Update the snapshot with the newly scheduled session IDs
    const updatedSnapshot = {
      timestamp: snapshot.timestamp,
      scheduledSessionIds: newlyScheduledIds
    };

    localStorage.setItem('scheduleSnapshot', JSON.stringify(updatedSnapshot));
    console.log(`Finalized snapshot: ${newlyScheduledIds.length} sessions can be undone`);
  } catch (error) {
    console.error('Error finalizing schedule snapshot:', error);
  }
}
