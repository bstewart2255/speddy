  "use client";

  import React, { useState } from 'react';
  import type { Database } from '../../../src/types/database';
  import { createClient } from '@/lib/supabase/client';
  import { SessionGenerator } from '@/lib/services/session-generator';

  type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

  interface CalendarTodayViewProps {
    sessions: ScheduleSession[];
    students: Map<string, { initials: string }>;
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

    const [notesModalOpen, setNotesModalOpen] = useState(false);
    const [selectedSession, setSelectedSession] = useState<ScheduleSession | null>(null);
    const [notesValue, setNotesValue] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [updatingCompletion, setUpdatingCompletion] = useState<string | null>(null);
    const [sessionsState, setSessionsState] = useState<ScheduleSession[]>([]);

    const supabase = createClient<Database>();
    const sessionGenerator = new SessionGenerator();

    // Load sessions for the current date
    React.useEffect(() => {
      const loadSessions = async () => {
        if (!currentDate) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

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

    // Just make sure the handler functions use sessionsState instead of the sessions prop

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
  const todaySessions = sessions.filter(s => s.day_of_week === adjustedDayOfWeek);

  // Sort sessions by start time
  const sortedSessions = [...todaySessions].sort((a, b) => 
    a.start_time.localeCompare(b.start_time)
  );

  // Format time helper
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
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

      {sortedSessions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No sessions scheduled for today</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedSessions.map((session) => {
            const student = students.get(session.student_id);
            const currentSession = sessionsState.find(s => s.id === session.id) || session;

            return (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
              >
                <div 
                  className="flex items-center space-x-4 flex-1 cursor-pointer"
                  onClick={() => onSessionClick?.(session)}
                >
                  <div className="text-sm font-medium text-gray-900">
                    {formatTime(session.start_time)} - {formatTime(session.end_time)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {student?.initials || 'Unknown'}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    session.delivered_by === 'sea' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {session.delivered_by === 'sea' ? 'SEA' : 'Provider'}
                  </span>

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
                      className="mr-1.5 h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500 disabled:opacity-50"
                    />
                    <span className="text-xs text-gray-600">
                      {updatingCompletion === session.id ? 'Updating...' : 'Completed'}
                    </span>
                  </label>

                  {/* Notes Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNotesClick(session);
                    }}
                    className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
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

      {/* Notes Modal */}
      {notesModalOpen && selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Session Notes</h3>

              <div className="mb-4 text-sm text-gray-600">
                <p><strong>Student:</strong> {students.get(selectedSession.student_id)?.initials || 'Unknown'}</p>
                <p><strong>Time:</strong> {formatTime(selectedSession.start_time)} - {formatTime(selectedSession.end_time)}</p>
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