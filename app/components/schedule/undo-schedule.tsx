'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '../ui/button';

interface UndoScheduleProps {
  onComplete?: () => void;
}

interface ScheduleSnapshot {
  timestamp: Date;
  sessions: any[];
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
        sessions: parsed.sessions
      });
    }
  }, []);

  const handleUndo = async () => {
    if (!lastSnapshot) {
      alert('No previous schedule to restore');
      return;
    }

    const timeSinceSnapshot = Date.now() - lastSnapshot.timestamp.getTime();
    const minutesSince = Math.floor(timeSinceSnapshot / 60000);

    const confirmMessage = `This will restore your schedule to how it was ${minutesSince} minutes ago.

This will:
- Remove all current sessions
- Restore ${lastSnapshot.sessions.length} sessions from the previous state

Continue?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsProcessing(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Clear all current sessions
      const { error: deleteError } = await supabase
        .from('schedule_sessions')
        .delete()
        .eq('provider_id', user.id);

      if (deleteError) throw deleteError;

      // Restore the snapshot sessions
      if (lastSnapshot.sessions.length > 0) {
        // Remove any fields that shouldn't be inserted (like id if it exists)
        const sessionsToRestore = lastSnapshot.sessions.map(session => ({
          student_id: session.student_id,
          provider_id: session.provider_id,
          day_of_week: session.day_of_week,
          start_time: session.start_time,
          end_time: session.end_time,
          service_type: session.service_type
        }));

        const { error: insertError } = await supabase
          .from('schedule_sessions')
          .insert(sessionsToRestore);

        if (insertError) throw insertError;
      }

      alert(`Schedule restored successfully!\n\nRestored ${lastSnapshot.sessions.length} sessions`);

      // Clear the snapshot after successful restore
      localStorage.removeItem('scheduleSnapshot');
      setLastSnapshot(null);

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      } else {
        // Refresh the page to show restored sessions
        window.location.reload();
      }
    } catch (error) {
      console.error('Error restoring schedule:', error);
      alert('Failed to restore schedule: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Don't show the button if there's no snapshot
  if (!lastSnapshot) {
    return null;
  }

  const timeSinceSnapshot = Date.now() - lastSnapshot.timestamp.getTime();
  const minutesSince = Math.floor(timeSinceSnapshot / 60000);

  return (
    <Button
      onClick={handleUndo}
      disabled={isProcessing}
      variant="secondary"
      title={`Undo - Restore schedule from ${minutesSince} minutes ago`}
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
  );
}

// Helper function to save current schedule snapshot
export async function saveScheduleSnapshot(providerId: string) {
  const supabase = createClient();

  try {
    // Get all current sessions
    const { data: sessions, error } = await supabase
      .from('schedule_sessions')
      .select('*')
      .eq('provider_id', providerId);

    if (error) throw error;

    // Save to localStorage
    const snapshot = {
      timestamp: new Date().toISOString(),
      sessions: sessions || []
    };

    localStorage.setItem('scheduleSnapshot', JSON.stringify(snapshot));
    console.log(`Saved snapshot with ${sessions?.length || 0} sessions`);
  } catch (error) {
    console.error('Error saving schedule snapshot:', error);
  }
}