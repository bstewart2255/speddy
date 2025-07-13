"use client";

import React, { useState } from "react";
import { createClient } from '@/lib/supabase/client';
import type { Database } from "../../../src/types/database";
import { AIContentModal } from "../ai-content-modal";

type ScheduleSession = Database["public"]["Tables"]["schedule_sessions"]["Row"];

interface CalendarWeekViewProps {
  sessions: ScheduleSession[];
  students: Map<string, {
    initials: string;
    grade_level?: string;
  }>;
  onSessionClick?: (session: ScheduleSession) => void;
  weekOffset?: number;
  holidays?: Array<{ date: string; name?: string }>;
}


export function CalendarWeekView({
  sessions,
  students,
  onSessionClick,
  weekOffset = 0,
  holidays = [] // Add holiday feature
  }: CalendarWeekViewProps) {
  const getWeekDates = () => {
    const today = new Date();
    // Apply week offset
    today.setDate(today.getDate() + (weekOffset * 7));

    const currentDay = today.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay; // Adjust for Monday start
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);

    const weekDates: Date[] = [];
    for (let i = 0; i < 5; i++) {
      // Monday to Friday only
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      weekDates.push(date);
    }
    return weekDates;
  };

  const weekDates = getWeekDates();

  // Check if a date is a holiday
  const isHoliday = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return holidays.some(h => h.date === dateStr);
  };

  // Get holiday name for a date
  const getHolidayName = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const holiday = holidays.find(h => h.date === dateStr);
    return holiday?.name || 'Holiday';
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDaySessions, setSelectedDaySessions] = useState<
    ScheduleSession[]
  >([]);
  const [aiContent, setAiContent] = useState<string | null>(null);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [savedLessons, setSavedLessons] = useState<Map<string, any>>(new Map());
  const [loadingSavedLessons, setLoadingSavedLessons] = useState(true);
  const [viewingSavedLesson, setViewingSavedLesson] = useState(false);
  
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ScheduleSession | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [sessionsState, setSessionsState] = useState(sessions);

  const supabase = createClient<Database>();

  // Update sessions when props change
  React.useEffect(() => {
    setSessionsState(sessions);
  }, [sessions]);

  // Handler for completing/uncompleting a session
  const handleCompleteToggle = async (sessionId: string, completed: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updateData: any = completed 
        ? { 
            completed_at: new Date().toISOString(),
            completed_by: user.id
          }
        : {
            completed_at: null,
            completed_by: null
          };

      const { error } = await supabase
        .from('schedule_sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (error) throw error;

      // Update local state
      setSessionsState(prev => prev.map(session => 
        session.id === sessionId 
          ? { ...session, ...updateData }
          : session
      ));
    } catch (error) {
      console.error('Error updating completion status:', error);
      alert('Failed to update completion status');
    }
  };

  // Handler for notes
  const handleNotesClick = (session: ScheduleSession) => {
    setSelectedSession(session);
    setNotesValue(session.session_notes || '');
    setNotesModalOpen(true);
  };

  // Handler for saving notes
  const handleSaveNotes = async () => {
    if (!selectedSession) return;

    setSavingNotes(true);

    try {
      const { error } = await supabase
        .from('schedule_sessions')
        .update({ session_notes: notesValue.trim() || null })
        .eq('id', selectedSession.id);

      if (error) throw error;

      // Update local state
      setSessionsState(prev => prev.map(session => 
        session.id === selectedSession.id 
          ? { ...session, session_notes: notesValue.trim() || null }
          : session
      ));

      setNotesModalOpen(false);
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  // Add this after your state declarations
  React.useEffect(() => {
    if (
      modalOpen &&
      selectedDaySessions.length > 0 &&
      !aiContent &&
      !generatingContent
    ) {
      const generateDailyAIContent = async () => {
        setGeneratingContent(true);

        try {
          // Group sessions by time slot (same logic as GroupSessionsWidget)
          const sessionsByTimeSlot: Record<string, ScheduleSession[]> = {};

          selectedDaySessions.forEach((session) => {
            const timeKey = session.start_time;
            if (!sessionsByTimeSlot[timeKey]) {
              sessionsByTimeSlot[timeKey] = [];
            }
            sessionsByTimeSlot[timeKey].push(session);
          });

          // Sort time slots
          const sortedTimeSlots = Object.keys(sessionsByTimeSlot).sort();

          // Generate content for each time slot
          const lessonPromises = sortedTimeSlots.map(async (timeSlot) => {
            const slotSessions = sessionsByTimeSlot[timeSlot];
            const studentDetails = slotSessions.map((session) => ({
              id: session.student_id,
              initials: students.get(session.student_id)?.initials || 'Unknown',
              grade_level: students.get(session.student_id)?.grade_level || '1', // Default grade if missing
              teacher_name: '' // Intentionally empty for PII protection
            }));

            const response = await fetch("/api/generate-lesson", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                students: studentDetails,
                timeSlot: formatTime(timeSlot),
                duration: 30,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('API Error Response:', errorText);
              console.error('Response status:', response.status);
              throw new Error(`Failed to generate content: ${errorText}`);
            }

            const { content } = await response.json();
            return {
              timeSlot: formatTime(timeSlot),
              students: studentDetails,
              content,
            };
          });

          const lessons = await Promise.all(lessonPromises);

          // Combine all lessons into a daily plan
          const combinedContent = `
            <div class="daily-lesson-plan">
              <h2 style="color: #6B46C1; margin-bottom: 1rem;">Daily Lesson Plan - ${selectedDate?.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</h2>
              ${lessons
                .map(
                  (lesson) => `
                <div style="margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid #E5E7EB;">
                  <h3 style="color: #374151; margin-bottom: 0.5rem;">${lesson.timeSlot}</h3>
                  <p style="color: #6B7280; font-size: 0.875rem; margin-bottom: 1rem;">Students: ${lesson.students.map((s) => s.initials).join(", ")}</p>
                  ${lesson.content}
                </div>
              `,
                )
                .join("")}
            </div>
          `;

          setAiContent(combinedContent);
        } catch (error) {
          console.error("Error generating daily content:", error);
          setAiContent(`
            <div style="color: red; text-align: center; padding: 20px;">
              <p><strong>Error generating daily lesson plan</strong></p>
              <p>Please try again or contact support if the problem persists.</p>
            </div>
          `);
        } finally {
          setGeneratingContent(false);
        }
      };

      generateDailyAIContent();
    }
  }, [
    modalOpen,
    selectedDaySessions,
    aiContent,
    generatingContent,
    students,
    selectedDate,
  ]);

  // Fetch saved lessons for the current week
  // Fetch saved lessons for the current week
  React.useEffect(() => {
    const fetchSavedLessons = async () => {
      try {
        const response = await fetch("/api/save-lesson");
        if (!response.ok) return;

        const { lessons } = await response.json();

        // Create a map of saved lessons by date
        const lessonsMap = new Map();
        weekDates.forEach((date) => {
          const dateStr = date.toISOString().split("T")[0];
          const dailyLessons = lessons.filter(
            (lesson: any) =>
              lesson.lesson_date === dateStr &&
              lesson.time_slot.includes("Daily Lessons"),
          );
          if (dailyLessons.length > 0) {
            lessonsMap.set(dateStr, dailyLessons[0]);
          }
        });

        setSavedLessons(lessonsMap);
      } catch (error) {
        console.error("Error fetching saved lessons:", error);
      } finally {
        setLoadingSavedLessons(false);
      }
    };

    if (weekDates.length > 0) {
      fetchSavedLessons();
    }
  }, [weekDates.map((d) => d.toISOString()).join(",")]); 

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  const handleGenerateDailyAILesson = (
    date: Date,
    daySessions: ScheduleSession[],
  ) => {
    setSelectedDate(date);

    // Deduplicate sessions by student_id to avoid duplicate worksheets
    const uniqueStudentSessions = daySessions.reduce((acc, session) => {
      if (!acc.find(s => s.student_id === session.student_id)) {
        acc.push(session);
      }
      return acc;
    }, [] as ScheduleSession[]);

    setSelectedDaySessions(uniqueStudentSessions);
    setModalOpen(true);
    setAiContent(null);
    setViewingSavedLesson(false); // Add this line
  };

  const handleViewSavedLesson = (lesson: any) => {
    // Use the same modal to display the saved lesson
    setSelectedDate(new Date(lesson.lesson_date));
    setAiContent(lesson.content);
    setModalOpen(true);
    setViewingSavedLesson(true);

    // Set the selectedDaySessions with student data from the saved lesson
    // This will enable worksheet generation
    if (lesson.student_details && Array.isArray(lesson.student_details)) {
      // Create mock sessions from the saved student details
      const mockSessions = lesson.student_details.map((student: any, index: number) => ({
        id: `saved-${index}`,
        student_id: student.id,
        // Add other required fields with default values
        provider_id: '',
        day_of_week: 1,
        start_time: '',
        end_time: '',
        service_type: '',
        delivered_by: 'provider' as const,
        created_at: '',
        assigned_to_sea_id: null,
        completed_at: null,
        completed_by: null,
        session_notes: null
      }));
      setSelectedDaySessions(mockSessions);
    }
  };

  const handleDeleteSavedLesson = async (lessonId: string, dateStr: string) => {
    // Remove the confirm here since it's now in the onClick
    try {
      const response = await fetch(`/api/save-lesson/${lessonId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete lesson");

      // Remove from local state
      const newSavedLessons = new Map(savedLessons);
      newSavedLessons.delete(dateStr);
      setSavedLessons(newSavedLessons);
    } catch (error) {
      console.error("Error deleting lesson:", error);
      alert("Failed to delete lesson. Please try again.");
    }
  };

  // Group sessions by day
  const sessionsByDay = sessionsState.reduce(
    (acc, session) => {
      if (!acc[session.day_of_week]) {
        acc[session.day_of_week] = [];
      }
      acc[session.day_of_week].push(session);
      return acc;
    },
    {} as Record<number, ScheduleSession[]>,
  );

  // Sort sessions within each day
  Object.keys(sessionsByDay).forEach((day) => {
    sessionsByDay[Number(day)].sort((a, b) =>
      a.start_time.localeCompare(b.start_time),
    );
  });

  return (
    <div>
      <div className="grid grid-cols-5 gap-4">
        {weekDates.map((date, index) => {
          const dayOfWeek = index + 1; // 1 = Monday, 2 = Tuesday, etc.
          const daySessions = sessionsByDay[dayOfWeek] || [];
          const isToday = date.toDateString() === new Date().toDateString();

          return (
            <div
              key={dayOfWeek}
              className={`border rounded-lg ${isToday ? "border-blue-400 bg-blue-50" : isHoliday(date) ? "border-red-200 bg-red-50" : "border-gray-200"}`}
            >
              <div
                className={`p-2 text-center font-medium text-sm ${
                  isToday ? "bg-blue-100" : isHoliday(date) ? "bg-red-100" : "bg-gray-50"
                }`}
              >
                <div>
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div className="text-lg">{date.getDate()}</div>
                {isHoliday(date) && (
                  <div className="text-xs text-red-600 font-medium mt-0.5">
                    {getHolidayName(date)}
                  </div>
                )}
              </div>

              {/* AI Lesson Buttons - only show if there are sessions */}
              {daySessions.length > 0 && (
                <div className="px-2 pt-1 pb-2 space-y-1">
                  {/* AI Daily Lesson Button */}
                  <button
                    onClick={() =>
                      handleGenerateDailyAILesson(date, daySessions)
                    }
                    disabled={savedLessons.has(
                      date.toISOString().split("T")[0],
                    ) || loadingSavedLessons}
                    className={`w-full text-white text-xs px-2 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                      savedLessons.has(date.toISOString().split("T")[0]) || loadingSavedLessons
                        ? "bg-gray-400 cursor-not-allowed opacity-60"
                        : "bg-purple-500 hover:bg-purple-600"
                    }`}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                    AI Daily Lesson
                  </button>

                  {/* Show loading placeholder while checking for saved lessons */}
                  {loadingSavedLessons && (
                    <div className="w-full bg-gray-200 animate-pulse text-transparent text-xs px-2 py-1.5 rounded-md">
                      Loading...
                    </div>
                  )}

                  {/* Saved Lesson Button - only show if there's a saved lesson and not loading */}
                  {!loadingSavedLessons && savedLessons.has(date.toISOString().split("T")[0]) && (
                    <div className="relative group">
                      <button
                        onClick={() =>
                          handleViewSavedLesson(
                            savedLessons.get(date.toISOString().split("T")[0]),
                          )
                        }
                        className="w-full bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        Saved Lesson
                      </button>

                      {/* Delete button (X) - only visible on hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Are you sure you want to delete this lesson?")) {
                            const lesson = savedLessons.get(
                              date.toISOString().split("T")[0],
                            );
                            handleDeleteSavedLesson(
                              lesson.id,
                              date.toISOString().split("T")[0],
                            );
                          }
                        }}
                        className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                        title="Delete saved lesson"
                      >
                        <span className="text-xs leading-none">×</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="p-2 space-y-1 min-h-[200px]">
                {daySessions.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center mt-4">
                    No sessions
                  </p>
                ) : (
                  daySessions.map((session) => {
                    const student = students.get(session.student_id);
                    return (
                      <div
                        key={session.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSession(sessionsState.find(s => s.id === session.id) || session);
                        }}
                        className="p-2 text-xs bg-white border border-gray-200 rounded cursor-pointer hover:shadow-sm transition-shadow"
                      >
                        <div className="font-medium text-gray-900">
                          {formatTime(session.start_time)}
                        </div>
                        <div className="text-gray-600 truncate">
                          {student?.initials || "Unknown"}
                        </div>
                        <div className="flex items-center justify-between">
                          {session.delivered_by === "sea" && (
                            <div className="text-green-600 text-xs">SEA</div>
                          )}
                          <div className="flex items-center gap-1">
                            {session.completed_at && (
                              <span className="text-green-600" title="Completed">✓</span>
                            )}
                            {session.session_notes && (
                              <span className="text-blue-600" title="Has notes">📝</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add the AI Content Modal here */}
      <AIContentModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setViewingSavedLesson(false); // Reset when closing
        }}
        timeSlot={
          selectedDate
            ? `Daily Lessons - ${selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
            : ""
        }
        students={(() => {
          // If viewing a saved lesson, use the student details from the lesson
          if (viewingSavedLesson && savedLessons.has(selectedDate?.toISOString().split('T')[0] || '')) {
            const savedLesson = savedLessons.get(selectedDate?.toISOString().split('T')[0] || '');
            if (savedLesson?.student_details) {
              return savedLesson.student_details.map((student: any) => ({
                id: student.id,
                initials: student.initials || '',
                grade_level: student.grade_level || '',
                teacher_name: student.teacher_name || ''
              }));
            }
          }
          // Otherwise use the regular mapping
          return selectedDaySessions.map((session, index) => ({
            id: `${session.student_id}-${index}`,
            initials: students.get(session.student_id)?.initials || '',
            grade_level: students.get(session.student_id)?.grade_level || '',
            teacher_name: ''
          }));
        })()}
        content={aiContent}
        isLoading={generatingContent}
        isViewingSaved={viewingSavedLesson}
        onSave={(savedLesson) => {
          // Update the saved lessons map
          if (selectedDate) {
            const dateStr = selectedDate.toISOString().split("T")[0];
            const newSavedLessons = new Map(savedLessons);
            newSavedLessons.set(dateStr, savedLesson);
            setSavedLessons(newSavedLessons);
          }
        }}
        />

        {/* Session Details Popup */}
        {selectedSession && !notesModalOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedSession(null)}
          >
            <div 
              className="bg-white rounded-lg shadow-xl max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4">Session Details</h3>

                <div className="space-y-3 mb-6">
                  <div>
                    <p className="text-sm text-gray-600">Student</p>
                    <p className="font-medium">{students.get(selectedSession.student_id)?.initials || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Time</p>
                    <p className="font-medium">{formatTime(selectedSession.start_time)} - {formatTime(selectedSession.end_time)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Delivered by</p>
                    <p className="font-medium">{selectedSession.delivered_by === 'sea' ? 'SEA' : 'Provider'}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Completed Checkbox */}
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!sessionsState.find(s => s.id === selectedSession.id)?.completed_at}
                      onChange={() => {
                        const currentSession = sessionsState.find(s => s.id === selectedSession.id);
                        handleCompleteToggle(selectedSession.id, !currentSession?.completed_at);
                      }}
                      className="mr-2 h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                    />
                    <span className="text-sm">Mark as completed</span>
                  </label>

                  {/* Notes Button */}
                  <button
                    onClick={() => handleNotesClick(selectedSession)}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
                      />
                    </svg>
                    {sessionsState.find(s => s.id === selectedSession.id)?.session_notes ? 'Edit Notes' : 'Add Notes'}
                  </button>

                  {selectedSession.session_notes && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-md">
                      <p className="text-sm text-gray-600 mb-1">Current Notes:</p>
                      <p className="text-sm">{selectedSession.session_notes}</p>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setSelectedSession(null)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
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