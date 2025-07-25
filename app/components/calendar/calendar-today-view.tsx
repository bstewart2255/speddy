"use client";

import React, { useState, useCallback, useEffect } from 'react';
import type { Database } from '../../../src/types/database';
import { createClient } from '@/lib/supabase/client';
import { SessionGenerator } from '@/lib/services/session-generator';
import { sessionUpdateService } from '@/lib/services/session-update-service';
import { cn } from '@/src/utils/cn';
import { useToast } from '../../contexts/toast-context';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

interface CalendarTodayViewProps {
  sessions: ScheduleSession[];
  students: Map<string, { initials: string; grade_level?: string }>;
  onSessionClick?: (session: ScheduleSession) => void;
  currentDate?: Date;  
  holidays?: Array<{ date: string; name?: string }>;
}

export function CalendarTodayView({ 
  sessions, 
  students,
  onSessionClick,
  currentDate = new Date(),
  holidays = []
}: CalendarTodayViewProps) {
  const { showToast } = useToast();

  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ScheduleSession | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [updatingCompletion, setUpdatingCompletion] = useState<string | null>(null);
  const [sessionsState, setSessionsState] = useState<ScheduleSession[]>([]);
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionConflicts, setSessionConflicts] = useState<Record<string, boolean>>({});

  const supabase = createClient<Database>();
  const sessionGenerator = new SessionGenerator();

  // Helper function for time conversion
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Load sessions and user info for the current date
  React.useEffect(() => {
    const loadSessions = async () => {
      if (!currentDate) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUser(user);
      setProviderId(user.id);

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, school_site, school_district')
        .eq('id', user.id)
        .single();
      
      setUserProfile(profile);

      // Get sessions for just this day
      const sessions = await sessionGenerator.getSessionsForDateRange(
        user.id,
        currentDate,
        currentDate
      );

      setSessionsState(sessions);
    };

    loadSessions();
  }, [currentDate]);

  // Check for conflicts after sessions are loaded
  const checkSessionConflicts = useCallback(async () => {
    const conflicts: Record<string, boolean> = {};
    
    for (const session of sessionsState) {
      const validation = await sessionUpdateService.validateSessionMove({
        session,
        targetDay: session.day_of_week,
        targetStartTime: session.start_time,
        targetEndTime: session.end_time,
        studentMinutes: timeToMinutes(session.end_time) - timeToMinutes(session.start_time)
      });
      
      conflicts[session.id] = !validation.valid;
    }
    
    setSessionConflicts(conflicts);
  }, [sessionsState]);
  
  // Check conflicts when sessions change
  useEffect(() => {
    const timer = setTimeout(() => {
      checkSessionConflicts();
    }, 500); // Small delay to batch updates
    
    return () => clearTimeout(timer);
  }, [sessionsState, checkSessionConflicts]);

  // Check if current date is a holiday
  const isHoliday = () => {
    const dateStr = currentDate.toISOString().split('T')[0];
    return holidays.some(h => h.date === dateStr);
  };

  // Get holiday name for current date
  const getHolidayName = () => {
    const dateStr = currentDate.toISOString().split('T')[0];
    const holiday = holidays.find(h => h.date === dateStr);
    return holiday?.name || 'Holiday';
  };

  // Generate time slots for the day
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour <= 15; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(time);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Format time for display
  const formatTimeDisplay = (time: string) => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Handler for completing/uncompleting a session
  const handleCompleteToggle = async (sessionId: string, completed: boolean) => {
    setUpdatingCompletion(sessionId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const session = sessionsState.find(s => s.id === sessionId);
      if (!session) return;

      const updates = {
        completed_at: completed ? new Date().toISOString() : null,
        completed_by: completed ? user.id : null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('schedule_sessions')
        .update(updates)
        .eq('id', sessionId);

      if (error) throw error;

      // Update local state immediately
      setSessionsState(prev =>
        prev.map(s =>
          s.id === sessionId
            ? { ...s, ...updates }
            : s
        )
      );

      showToast(
        completed ? 'Session marked as completed' : 'Session marked as incomplete',
        'success'
      );
    } catch (error) {
      console.error('Error updating session completion:', error);
      showToast('Failed to update session', 'error');
    } finally {
      setUpdatingCompletion(null);
    }
  };

  // Handler for saving notes
  const handleSaveNotes = async () => {
    if (!selectedSession) return;
    
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('schedule_sessions')
        .update({
          session_notes: notesValue.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedSession.id);

      if (error) throw error;

      // Update local state
      setSessionsState(prev =>
        prev.map(s =>
          s.id === selectedSession.id
            ? { ...s, session_notes: notesValue.trim() || null }
            : s
        )
      );

      showToast('Notes saved successfully', 'success');
      setNotesModalOpen(false);
    } catch (error) {
      console.error('Error saving notes:', error);
      showToast('Failed to save notes', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  // Group sessions by time slot
  const getSessionsForTimeSlot = (timeSlot: string) => {
    const slotTime = `${timeSlot}:00`;
    return sessionsState.filter((session) => {
      const sessionStartTime = session.start_time;
      return sessionStartTime === slotTime;
    });
  };

  const isCurrentTimeSlot = (timeSlot: string) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    const [slotHour, slotMinute] = timeSlot.split(':').map(Number);
    const slotTimeInMinutes = slotHour * 60 + slotMinute;
    const slotEndTimeInMinutes = slotTimeInMinutes + 30;
    
    return currentTimeInMinutes >= slotTimeInMinutes && currentTimeInMinutes < slotEndTimeInMinutes;
  };

  const isPastTimeSlot = (timeSlot: string) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    const [slotHour, slotMinute] = timeSlot.split(':').map(Number);
    const slotTimeInMinutes = slotHour * 60 + slotMinute;
    
    return currentTimeInMinutes > slotTimeInMinutes + 30;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          {formatDate(currentDate)}
        </h2>
        {isHoliday() && (
          <p className="text-sm text-red-600 mt-1">
            🎉 {getHolidayName()} - No sessions scheduled
          </p>
        )}
      </div>

      {/* Sessions list */}
      {!isHoliday() && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="divide-y divide-gray-100">
            {sessionsState.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No sessions scheduled for today
              </div>
            ) : (
              sessionsState
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                .map((session) => {
                  const student = students.get(session.student_id);

                  return (
                    <div key={session.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="text-sm font-medium text-gray-900">
                            {formatTime(session.start_time)} - {formatTime(session.end_time)}
                          </div>
                          <div className="text-sm font-semibold text-gray-900">
                            {student?.initials || 'S'}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-1 rounded ${
                            session.delivered_by === 'sea' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {session.delivered_by === 'sea' ? 'SEA' : 'Provider'}
                          </span>

                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!session.completed_at}
                              onChange={() => handleCompleteToggle(session.id, !session.completed_at)}
                              disabled={updatingCompletion === session.id}
                              className="rounded border-gray-300"
                            />
                            <span className="text-gray-700">Completed</span>
                          </label>

                          <button
                            onClick={() => {
                              setSelectedSession(session);
                              setNotesValue(session.session_notes || '');
                              setNotesModalOpen(true);
                            }}
                            className="text-gray-400 hover:text-gray-600"
                            title={session.session_notes ? 'Edit notes' : 'Add notes'}
                          >
                            📝
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {notesModalOpen && selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Session Notes</h3>
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              className="w-full h-32 p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add your notes here..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setNotesModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {savingNotes ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}