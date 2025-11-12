"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { Database } from '../../../src/types/database';
import { createClient } from '@/lib/supabase/client';
import { SessionGenerator } from '@/lib/services/session-generator';
import { DraggableSessionBox } from '@/app/components/session/draggable-session-box';
import { sessionUpdateService } from '@/lib/services/session-update-service';
import { useSessionSync } from '@/lib/hooks/use-session-sync';
import { cn } from '@/src/utils/cn';
import { useToast } from '../../contexts/toast-context';
import { toLocalDateKey } from '@/lib/utils/date-time';

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
    
    // Drag and drop state
    const [draggedSession, setDraggedSession] = useState<ScheduleSession | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const [validDropTargets, setValidDropTargets] = useState<Set<string>>(new Set());
    const [invalidDropTargets, setInvalidDropTargets] = useState<Set<string>>(new Set());
    const [isValidating, setIsValidating] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [providerId, setProviderId] = useState<string | null>(null);

    const supabase = useMemo(() => createClient<Database>(), []);
    const sessionGenerator = useMemo(() => new SessionGenerator(), []);

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
          currentDate,
          profile?.role
        );

        setSessionsState(sessions);
      };

      loadSessions();
    }, [currentDate, sessionGenerator, supabase]);

    // Use session sync hook for real-time updates
    const { isConnected, lastSync, optimisticUpdate, forceRefresh } = useSessionSync({
      sessions: sessionsState,
      setSessions: setSessionsState,
      providerId: providerId || undefined,
      onConflict: (local, remote) => {
        // showToast('Session was updated by another user. Refreshing...', 'warning');
      },
      showToast
    });

    // Just make sure the handler functions use sessionsState instead of the sessions prop

  // Check if current date is a holiday
  const isHoliday = () => {
    const dateStr = toLocalDateKey(currentDate);
    return holidays.some(h => h.date === dateStr);
  };

  // Get holiday name for current date
  const getHolidayName = () => {
    const dateStr = toLocalDateKey(currentDate);
    const holiday = holidays.find(h => h.date === dateStr);
    return holiday?.name || 'Holiday';
  };

  const todayIsHoliday = isHoliday();
  const holidayName = getHolidayName();
   
  const todayDate = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Filter sessions for the selected date (based on day_of_week)
  const selectedDayOfWeek = currentDate.getDay();
  const adjustedDayOfWeek = selectedDayOfWeek === 0 ? 7 : selectedDayOfWeek; // Convert Sunday (0) to 7
  const todaySessions = useMemo(
    () => sessionsState.filter(s => s.day_of_week === adjustedDayOfWeek && s.student_id && students.has(s.student_id)),
    [sessionsState, adjustedDayOfWeek, students]
  );

  // Sort sessions by start time (filter out unscheduled sessions)
  const sortedSessions = [...todaySessions]
    .filter(s => s.start_time && s.end_time)
    .sort((a, b) =>
      a.start_time!.localeCompare(b.start_time!)
    );

  // Format time helper
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Permission check for editing sessions
  const canEditSession = useCallback((session: ScheduleSession) => {
    if (!currentUser || !userProfile) return false;
    
    // SEA users cannot drag sessions
    if (userProfile.role === 'sea') return false;
    
    // Provider can edit their own sessions
    if (session.provider_id === currentUser.id) {
      // If it's an SEA session, only the supervising provider can drag it
      if (session.delivered_by === 'sea') {
        return true; // Provider supervises SEA sessions
      }
      // Regular provider sessions
      return session.delivered_by === 'provider';
    }
    
    return false;
  }, [currentUser, userProfile]);

  // Generate time slots for the day (every 30 minutes from 8 AM to 3 PM)
  const generateTimeSlots = () => {
    const slots: string[] = [];
    for (let hour = 8; hour <= 15; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === 15 && minute > 0) break; // Stop at 3:00 PM
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        slots.push(time);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Helper functions for time conversion
  const timeToMinutes = useCallback((time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }, []);

  const addMinutesToTime = useCallback((time: string, minutesToAdd: number): string => {
    const totalMinutes = timeToMinutes(time) + minutesToAdd;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  }, [timeToMinutes]);

  const validateAllDropTargets = useCallback(async (session: ScheduleSession) => {
    if (!session) return;

    // Skip validation for unscheduled sessions
    if (!session.start_time || !session.end_time || !session.day_of_week) {
      setValidDropTargets(new Set());
      setInvalidDropTargets(new Set());
      return;
    }

    setIsValidating(true);
    const valid = new Set<string>();
    const invalid = new Set<string>();

    // Check all time slots for the current day
    for (const targetTime of timeSlots) {
      // Skip if it's the current slot
      if (targetTime === session.start_time) continue;

      // Calculate new end time based on session duration
      const duration = timeToMinutes(session.end_time) - timeToMinutes(session.start_time);
      const newEndTime = addMinutesToTime(targetTime, duration);

      // Validate the move
      const validation = await sessionUpdateService.validateSessionMove({
        session,
        targetDay: session.day_of_week,
        targetStartTime: targetTime,
        targetEndTime: newEndTime,
        studentMinutes: duration
      });
      
      if (validation.valid) {
        valid.add(targetTime);
      } else {
        invalid.add(targetTime);
      }
    }
    
    setValidDropTargets(valid);
    setInvalidDropTargets(invalid);
    setIsValidating(false);
  }, [timeSlots, addMinutesToTime, timeToMinutes]);

  // Drag and drop handlers
  const handleDragStart = useCallback((session: ScheduleSession, event: React.DragEvent) => {
    setDraggedSession(session);
    // Validate all potential drop targets when drag starts
    validateAllDropTargets(session);
  }, [validateAllDropTargets]);

  const handleDragEnd = useCallback(() => {
    setDraggedSession(null);
    setDropTarget(null);
    setValidDropTargets(new Set());
    setInvalidDropTargets(new Set());
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent, targetTime: string) => {
    if (!draggedSession) return;
    
    event.preventDefault();
    event.dataTransfer.dropEffect = validDropTargets.has(targetTime) ? 'move' : 'none';
    setDropTarget(targetTime);
  }, [draggedSession, validDropTargets]);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent, targetTime: string) => {
    event.preventDefault();

    if (!draggedSession || !validDropTargets.has(targetTime)) {
      // showToast('Cannot move session to this time slot', 'error');
      return;
    }

    // Skip if session has null times (unscheduled)
    if (!draggedSession.start_time || !draggedSession.end_time || !draggedSession.day_of_week) {
      return;
    }

    // Calculate new end time
    const duration = timeToMinutes(draggedSession.end_time) - timeToMinutes(draggedSession.start_time);
    const newEndTime = addMinutesToTime(targetTime, duration);

    // Use optimistic update for immediate UI feedback
    optimisticUpdate(draggedSession.id, {
      start_time: targetTime,
      end_time: newEndTime
    });
    
    try {
      const result = await sessionUpdateService.updateSessionTime(
        draggedSession.id,
        draggedSession.day_of_week,
        targetTime,
        newEndTime
      );
      
      if (result.success) {
        // showToast('Session moved successfully', 'success');
      } else {
        // showToast(result.error || 'Failed to move session', 'error');
        // Optimistic update will be rolled back automatically
      }
    } catch (error) {
      // showToast('An error occurred while moving the session', 'error');
    } finally {
      handleDragEnd();
    }
  }, [draggedSession, validDropTargets, optimisticUpdate, handleDragEnd, addMinutesToTime, timeToMinutes]);

  // Handler for completing/uncompleting a session
    const handleCompleteToggle = async (sessionId: string, completed: boolean) => {
      setUpdatingCompletion(sessionId);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const session = sessionsState.find(s => s.id === sessionId);
        if (!session) return;

        const updateData: any = completed 
          ? { 
              completed_at: new Date().toISOString(),
              completed_by: user.id
            }
          : {
              completed_at: null,
              completed_by: null
            };

        // Check if this is a temporary session
        if (session.id.startsWith('temp-')) {
          // Create a new instance in the database
          const sessionGenerator = new SessionGenerator();
          const savedSession = await sessionGenerator.saveSessionInstance({
            ...session,
            ...updateData
          });

          if (savedSession) {
            setSessionsState(prev => prev.map(s => 
              s.id === sessionId ? savedSession : s
            ));
          }
        } else {
          // Update existing session
          const { error } = await supabase
            .from('schedule_sessions')
            .update(updateData)
            .eq('id', sessionId);

          if (error) throw error;

          // Update local session data
          setSessionsState(prev => prev.map(s => 
            s.id === sessionId 
              ? { ...s, ...updateData }
              : s
          ));
        }
      } catch (error) {
        console.error('Error updating completion status:', error);
        alert('Failed to update completion status');
      } finally {
        setUpdatingCompletion(null);
      }
    };

  // Handler for notes button click
  const handleNotesClick = (session: ScheduleSession) => {
    setSelectedSession(session);
    setNotesValue(session.session_notes || '');
    setNotesModalOpen(true);
  };

  // Handler for saving notes
    // In calendar-today-view.tsx
    const handleSaveNotes = async () => {
      if (!selectedSession) return;

      setSavingNotes(true);

      try {
        // Check if this is a temporary session
        if (selectedSession.id.startsWith('temp-')) {
          // Create a new instance with notes
          const sessionGenerator = new SessionGenerator();
          const savedSession = await sessionGenerator.saveSessionInstance({
            ...selectedSession,
            session_notes: notesValue.trim() || null
          });

          if (savedSession) {
            setSessionsState(prev => prev.map(s => 
              s.id === selectedSession.id ? savedSession : s
            ));
          }
        } else {
          // Update existing session
          const { error } = await supabase
            .from('schedule_sessions')
            .update({ session_notes: notesValue.trim() || null })
            .eq('id', selectedSession.id);

          if (error) throw error;

          // Update local session data
          setSessionsState(prev => prev.map(s => 
            s.id === selectedSession.id 
              ? { ...s, session_notes: notesValue.trim() || null }
              : s
          ));
        }

        setNotesModalOpen(false);
      } catch (error) {
        console.error('Error saving notes:', error);
        alert('Failed to save notes');
      } finally {
        setSavingNotes(false);
      }
    };

  return (
    <div>
      <div className="mb-4">
        {todayIsHoliday && (
          <div className="mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            {holidayName}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Time grid with sessions and drop zones */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="space-y-1">
            {timeSlots.map((timeSlot) => {
              const sessionsAtTime = sortedSessions.filter(s => s.start_time === timeSlot);
              const hasSession = sessionsAtTime.length > 0;
              
              return (
                <div key={timeSlot} className="flex items-start gap-4">
                  {/* Time label */}
                  <div className="w-20 text-sm text-gray-500 font-medium pt-2">
                    {formatTime(timeSlot)}
                  </div>
                  
                  {/* Drop zone and sessions */}
                  <div
                    className={cn(
                      "flex-1 min-h-[3rem] rounded-md border-2 border-dashed transition-all",
                      dropTarget === timeSlot && "ring-2",
                      dropTarget === timeSlot && validDropTargets.has(timeSlot) && "bg-blue-50 border-blue-400 ring-blue-400",
                      dropTarget === timeSlot && invalidDropTargets.has(timeSlot) && "bg-red-50 border-red-400 ring-red-400",
                      draggedSession && !dropTarget && validDropTargets.has(timeSlot) && "bg-blue-50/50 border-blue-300",
                      draggedSession && !dropTarget && invalidDropTargets.has(timeSlot) && "bg-red-50/50 border-red-300",
                      !draggedSession && !hasSession && "border-gray-200",
                      hasSession && "border-transparent"
                    )}
                    onDragOver={(e) => handleDragOver(e, timeSlot)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, timeSlot)}
                  >
                    {draggedSession && dropTarget === timeSlot && (
                      <div className="text-xs text-center text-gray-500 p-2">
                        {validDropTargets.has(timeSlot) ? 'Drop here to move session' : 'Cannot move session here'}
                      </div>
                    )}
                    
                    {hasSession && (
                      <div className="flex flex-wrap gap-2 p-2">
                        {sessionsAtTime.map((session) => {
                          const student = session.student_id ? students.get(session.student_id) : undefined;
                          const currentSession = sessionsState.find(s => s.id === session.id) || session;
                          
                          return (
                            <div key={session.id} className="flex items-center gap-2">
                              <DraggableSessionBox
                                session={currentSession}
                                student={{
                                  initials: student?.initials || '?',
                                  grade_level: student?.grade_level || '',
                                  id: session.student_id || ''
                                }}
                                isSeaSession={session.delivered_by === 'sea'}
                                canEdit={canEditSession(session)}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                size="medium"
                              />
                              
                              {/* Session details and controls */}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => onSessionClick?.(session)}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  Details
                                </button>
                                
                                {/* Completed Checkbox */}
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!currentSession.completed_at}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      handleCompleteToggle(session.id, !currentSession.completed_at);
                                    }}
                                    disabled={updatingCompletion === session.id}
                                    className="h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500 disabled:opacity-50"
                                  />
                                </label>
                                
                                {/* Notes Button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNotesClick(currentSession);
                                  }}
                                  className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                                    currentSession.session_notes ? 'text-blue-600' : 'text-gray-400'
                                  }`}
                                  title={currentSession.session_notes ? 'Edit notes' : 'Add notes'}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Connection status indicator */}
        {isConnected && (
          <div className="text-xs text-gray-500 text-right">
            Real-time sync active • Last update: {lastSync ? new Date(lastSync).toLocaleTimeString() : 'Never'}
          </div>
        )}
      </div>

      {/* Notes Modal */}
      {notesModalOpen && selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Session Notes</h3>

              <div className="mb-4 text-sm text-gray-600">
                <p><strong>Student:</strong> {selectedSession.student_id ? students.get(selectedSession.student_id)?.initials || 'Unknown' : 'Unknown'}</p>
                {selectedSession.start_time && selectedSession.end_time && (
                  <p><strong>Time:</strong> {formatTime(selectedSession.start_time)} - {formatTime(selectedSession.end_time)}</p>
                )}
              </div>

              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add notes about this session..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                autoFocus
              />

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setNotesModalOpen(false);
                    setNotesValue('');
                    setSelectedSession(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingNotes ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  }