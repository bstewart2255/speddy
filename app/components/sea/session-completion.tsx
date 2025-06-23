'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface SessionCompletionProps {
  session: {
    id: string;
    student_initials: string;
    start_time: string;
    end_time: string;
    completed_at: string | null;
    session_notes: string | null;
  };
  onUpdate: () => void;
}

export function SessionCompletion({ session, onUpdate }: SessionCompletionProps) {
  const [loading, setLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(session.session_notes || '');
  const supabase = createClientComponentClient();

  const handleMarkComplete = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('schedule_sessions')
        .update({
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          session_notes: notes.trim() || null
        })
        .eq('id', session.id);

      if (error) throw error;

      onUpdate();
      setShowNotes(false);
    } catch (error) {
      console.error('Error marking session complete:', error);
      alert('Failed to mark session as complete');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkIncomplete = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('schedule_sessions')
        .update({
          completed_at: null,
          completed_by: null,
          session_notes: null
        })
        .eq('id', session.id);

      if (error) throw error;

      onUpdate();
      setNotes('');
    } catch (error) {
      console.error('Error marking session incomplete:', error);
      alert('Failed to update session');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const isCompleted = !!session.completed_at;

  return (
    <div className={`p-4 rounded-lg border ${
      isCompleted 
        ? 'bg-green-50 border-green-200' 
        : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900">
            {session.student_initials}
          </h3>
          <p className="text-sm text-gray-600">
            {formatTime(session.start_time)} - {formatTime(session.end_time)}
          </p>
          {isCompleted && (
            <p className="text-xs text-green-600 mt-1">
              ✓ Completed {new Date(session.completed_at!).toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isCompleted ? (
            <>
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                disabled={loading}
              >
                {showNotes ? 'Cancel' : 'Add Notes'}
              </button>
              <button
                onClick={handleMarkComplete}
                className="px-3 py-1 text-sm text-white bg-green-600 rounded hover:bg-green-700"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Complete'}
              </button>
            </>
          ) : (
            <button
              onClick={handleMarkIncomplete}
              className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              disabled={loading}
            >
              Mark Incomplete
            </button>
          )}
        </div>
      </div>

      {showNotes && !isCompleted && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this session (optional)..."
            className="w-full p-2 text-sm border border-gray-300 rounded resize-none"
            rows={3}
          />
        </div>
      )}

      {isCompleted && session.session_notes && (
        <div className="mt-3 pt-3 border-t border-green-200">
          <p className="text-sm text-gray-700">
            <span className="font-medium">Notes:</span> {session.session_notes}
          </p>
        </div>
      )}
    </div>
  );
}