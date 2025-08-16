"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createClient } from '@/lib/supabase/client';
import type { Database } from "../../../src/types/database";
import { AIContentModal } from "../ai-content-modal";
import { SessionGenerator } from '@/lib/services/session-generator';
import { LessonTypeModal } from "../modals/lesson-type-modal";
import { ManualLessonFormModal } from "../modals/manual-lesson-form-modal";
import { ManualLessonViewModal } from "../modals/manual-lesson-view-modal";
import { useToast } from "../../contexts/toast-context";
import { sessionUpdateService } from '@/lib/services/session-update-service';
import { cn } from '@/src/utils/cn';

type ScheduleSession = Database["public"]["Tables"]["schedule_sessions"]["Row"];
type ManualLesson = Database["public"]["Tables"]["manual_lesson_plans"]["Row"];

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
  const [selectedDaySessions, setSelectedDaySessions] = useState<ScheduleSession[]>([]);
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
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionConflicts, setSessionConflicts] = useState<Record<string, boolean>>({});
  
  // State for manual lesson creation
  const [showLessonTypeModal, setShowLessonTypeModal] = useState(false);
  const [selectedLessonDate, setSelectedLessonDate] = useState<Date | null>(null);
  const [showManualLessonForm, setShowManualLessonForm] = useState(false);
  const [manualLessons, setManualLessons] = useState<Map<string, ManualLesson[]>>(new Map());
  const [selectedManualLesson, setSelectedManualLesson] = useState<ManualLesson | null>(null);
  const [loadingManualLessons, setLoadingManualLessons] = useState(false);
  const [showManualLessonView, setShowManualLessonView] = useState(false);
  const [viewingManualLesson, setViewingManualLesson] = useState<ManualLesson | null>(null);

  const supabase = createClient<Database>();
  const sessionGenerator = new SessionGenerator();
  const { showToast } = useToast();

  // Helper function for time conversion
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Replace the useEffect that loads sessions
  React.useEffect(() => {
    const loadSessions = async () => {
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

      // Get the Monday of the current week
      const weekStart = new Date();
      const currentDay = weekStart.getDay();
      const diff = currentDay === 0 ? -6 : 1 - currentDay;
      weekStart.setDate(weekStart.getDate() + diff + (weekOffset * 7));

      // Get the Sunday (end of week)
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const weekSessions = await sessionGenerator.getSessionsForDateRange(user.id, weekStart, weekEnd);

      setSessionsState(weekSessions);
    };

    loadSessions();
  }, [weekOffset]);

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

  // Load manual lessons for the week
  React.useEffect(() => {
    const loadManualLessons = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setLoadingManualLessons(true);
      const toast = showToast; // Capture showToast to use in the effect
      try {
        // Get the Monday of the current week
        const weekStart = new Date();
        const currentDay = weekStart.getDay();
        const diff = currentDay === 0 ? -6 : 1 - currentDay;
        weekStart.setDate(weekStart.getDate() + diff + (weekOffset * 7));

        // Get the Sunday (end of week)
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        // Format dates for API
        const startDate = weekStart.toISOString().split('T')[0];
        const endDate = weekEnd.toISOString().split('T')[0];

        const response = await fetch(`/api/manual-lessons?start_date=${startDate}&end_date=${endDate}`);
        
        if (response.ok) {
          const data = await response.json();
          // Fetched manual lessons
          
          // Group lessons by date
          const lessonsByDate = new Map<string, ManualLesson[]>();
          data.lessons.forEach((lesson: ManualLesson) => {
            const dateKey = lesson.lesson_date;
            // Processing lesson for date
            if (!lessonsByDate.has(dateKey)) {
              lessonsByDate.set(dateKey, []);
            }
            lessonsByDate.get(dateKey)!.push(lesson);
          });
          
          setManualLessons(lessonsByDate);
        }
      } catch (error) {
        // Failed to load manual lessons
      } finally {
        setLoadingManualLessons(false);
      }
    };

    loadManualLessons();
  }, [weekOffset]);

  // Load saved AI lessons
  React.useEffect(() => {
    // Skip if weekDates is not ready
    if (!weekDates || weekDates.length === 0) return;

    // Skip if already loading
    if (loadingSavedLessons) return;

    const loadSavedLessons = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setLoadingSavedLessons(true);
      try {
        const weekStart = weekDates[0];
        const weekEnd = weekDates[weekDates.length - 1];

        const startDate = weekStart.toISOString().split('T')[0];
        const endDate = weekEnd.toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('ai_generated_lessons')
          .select('*')
          .eq('provider_id', user.id)
          .gte('lesson_date', startDate)
          .lte('lesson_date', endDate);

        if (error) {
          // Check if it's a "table doesn't exist" error
          if (error.code === '42P01') {
            // Don't log this repeatedly
            setSavedLessons(new Map());
          } else {
            console.error('Failed to load saved lessons:', error);
          }
        } else {
          const lessonsMap = new Map<string, any>();
          data?.forEach(lesson => {
            lessonsMap.set(lesson.lesson_date, lesson);
          });
          setSavedLessons(lessonsMap);
        }
      } catch (error) {
        console.error('Failed to load saved lessons:', error);
      } finally {
        setLoadingSavedLessons(false);
      }
    };

    loadSavedLessons();
  }, [weekOffset]); // Change dependency to weekOffset instead of weekDates

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

  const formatTime = (time: string) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const getDayName = (date: Date) => {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  };

  const isDateInPast = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const getDayColor = (date: Date, isHolidayDay: boolean) => {
    const dateStr = date.toISOString().split("T")[0];
    const hasAIContent = savedLessons.has(dateStr);
    const hasManualLessons = manualLessons.has(dateStr);

    // Past dates are gray
    if (isDateInPast(date)) {
      return "bg-gray-50 border-gray-200";
    }

    // Holidays are red
    if (isHolidayDay) {
      return "bg-red-50 border-red-200";
    }

    // Today's date
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return "bg-blue-50 border-blue-300";
    }

    // Has content
    if (hasAIContent && hasManualLessons) {
      return "bg-purple-50 border-purple-300"; // Both types
    } else if (hasAIContent) {
      return "bg-green-50 border-green-300"; // AI content only
    } else if (hasManualLessons) {
      return "bg-yellow-50 border-yellow-300"; // Manual lessons only
    }

    return "bg-white border-gray-200";
  };

  const handleGenerateDailyAILesson = (
    date: Date,
    daySessions: ScheduleSession[],
  ) => {
    setSelectedDate(date);
    setSelectedDaySessions(daySessions);
    setModalOpen(true);
  };

  const generateAIContent = async (prompt: string) => {
    if (!selectedDate || !currentUser) return;

    setGeneratingContent(true);
    try {
      const response = await fetch('/api/generate-lesson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: selectedDate.toISOString(),
          sessions: selectedDaySessions,
          students: Array.from(students.entries()).map(([id, student]) => ({
            id,
            ...student,
          })),
          additionalContext: prompt,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate content');

      const data = await response.json();
      setAiContent(data.content);

      // Save the generated lesson
      const { error } = await supabase
        .from('ai_generated_lessons')
        .upsert({
          provider_id: currentUser.id,
          lesson_date: selectedDate.toISOString().split('T')[0],
          content: data.content,
          prompt: prompt,
          session_data: selectedDaySessions,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      // Update saved lessons
      setSavedLessons(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedDate.toISOString().split('T')[0], {
          content: data.content,
          prompt: prompt
        });
        return newMap;
      });

      showToast('AI lesson generated and saved successfully', 'success');
    } catch (error) {
      console.error('Error generating content:', error);
      showToast('Failed to generate AI content', 'error');
    } finally {
      setGeneratingContent(false);
    }
  };

  const handleViewAILesson = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const lesson = savedLessons.get(dateStr);
    if (lesson) {
      setSelectedDate(date);
      setAiContent(lesson.content);
      setViewingSavedLesson(true);
      setModalOpen(true);
    }
  };

  const handleEditAILesson = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const lesson = savedLessons.get(dateStr);
    if (lesson) {
      setSelectedDate(date);
      const daySessions = sessionsState.filter((s) => {
        const sessionDate = new Date(weekDates[0]);
        sessionDate.setDate(
          weekDates[0].getDate() + (s.day_of_week - 1)
        );
        return sessionDate.toDateString() === date.toDateString();
      });
      setSelectedDaySessions(daySessions);
      setAiContent(lesson.content);
      setViewingSavedLesson(false);
      setModalOpen(true);
    }
  };

  const getDaysInWeek = () => {
    const startDate = weekDates[0];
    const weekSessions = sessionsState.filter((session) => {
      const sessionDate = new Date(startDate);
      sessionDate.setDate(
        startDate.getDate() + (session.day_of_week - 1)
      );
      const sessionDateStr = sessionDate.toISOString().split("T")[0];
      return weekDates.some(
        (d) => d.toISOString().split("T")[0] === sessionDateStr
      );
    });

    return weekDates.map((date, index) => {
      const dayOfWeek = index + 1; // 1-5 for Monday-Friday
      const daySessions = weekSessions.filter(
        (s) => s.day_of_week === dayOfWeek
      );
      const isHolidayDay = isHoliday(date);
      const holidayName = isHolidayDay ? getHolidayName(date) : null;

      return {
        date,
        sessions: daySessions,
        dayOfWeek,
        isHoliday: isHolidayDay,
        holidayName,
      };
    });
  };

  const daysInWeek = getDaysInWeek();

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const addMinutesToTime = (time: string, minutesToAdd: number): string => {
    const totalMinutes = timeToMinutes(time) + minutesToAdd;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  };

  // Handler for Create Lesson button
  const handleCreateLesson = (date: Date) => {
    setSelectedLessonDate(date);
    setShowLessonTypeModal(true);
  };

  const handleLessonTypeSelect = (type: 'ai' | 'manual') => {
    setShowLessonTypeModal(false);
    
    if (type === 'ai' && selectedLessonDate) {
      // Get sessions for the selected date
      const daySessions = sessionsState.filter((s) => {
        const sessionDate = new Date(weekDates[0]);
        sessionDate.setDate(
          weekDates[0].getDate() + (s.day_of_week - 1)
        );
        return sessionDate.toDateString() === selectedLessonDate.toDateString();
      });
      handleGenerateDailyAILesson(selectedLessonDate, daySessions);
    } else if (type === 'manual') {
      setShowManualLessonForm(true);
    }
  };

  const handleSaveManualLesson = async (lessonData: {
    title: string;
    subject?: string;
    gradeLevels?: string;
    duration?: number;
    learningObjectives?: string;
    materialsNeeded?: string;
    activities?: string;
    assessmentMethods?: string;
    notes?: string;
  }) => {
    if (!selectedLessonDate || !currentUser) return;

    try {
      const lessonDate = selectedLessonDate.toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('manual_lesson_plans')
        .insert({
          provider_id: currentUser.id,
          lesson_date: lessonDate,
          title: lessonData.title,
          subject: lessonData.subject,
          grade_levels: lessonData.gradeLevels ? lessonData.gradeLevels.split(',').map(g => g.trim()) : null,
          duration_minutes: lessonData.duration,
          objectives: lessonData.learningObjectives,
          materials: lessonData.materialsNeeded,
          activities: lessonData.activities ? (typeof lessonData.activities === 'string' ? JSON.parse(lessonData.activities) : lessonData.activities) : null,
          assessment: lessonData.assessmentMethods,
          notes: lessonData.notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setManualLessons(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(lessonDate) || [];
        newMap.set(lessonDate, [...existing, data]);
        return newMap;
      });

      showToast('Manual lesson saved successfully', 'success');
      setShowManualLessonForm(false);
    } catch (error) {
      console.error('Error saving manual lesson:', error);
      showToast('Failed to save manual lesson', 'error');
    }
  };

  const handleEditManualLesson = (lesson: ManualLesson) => {
    setSelectedManualLesson(lesson);
    setShowManualLessonForm(true);
  };

  const handleDeleteManualLesson = async (lessonId: string) => {
    if (!window.confirm('Are you sure you want to delete this lesson?')) return;

    try {
      const { error } = await supabase
        .from('manual_lesson_plans')
        .delete()
        .eq('id', lessonId);

      if (error) throw error;

      // Update local state
      setManualLessons(prev => {
        const newMap = new Map(prev);
        newMap.forEach((lessons, date) => {
          newMap.set(date, lessons.filter(l => l.id !== lessonId));
        });
        return newMap;
      });

      showToast('Manual lesson deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting manual lesson:', error);
      showToast('Failed to delete manual lesson', 'error');
    }
  };

  const handleUpdateManualLesson = async (lessonData: {
    title: string;
    subject?: string;
    gradeLevels?: string;
    duration?: number;
    learningObjectives?: string;
    materialsNeeded?: string;
    activities?: string;
    assessmentMethods?: string;
    notes?: string;
  }) => {
    if (!selectedManualLesson) return;

    try {
      const { data, error } = await supabase
        .from('manual_lesson_plans')
        .update({
          title: lessonData.title,
          subject: lessonData.subject,
          grade_levels: lessonData.gradeLevels ? lessonData.gradeLevels.split(',').map(g => g.trim()) : null,
          duration_minutes: lessonData.duration,
          objectives: lessonData.learningObjectives,
          materials: lessonData.materialsNeeded,
          activities: lessonData.activities ? (typeof lessonData.activities === 'string' ? JSON.parse(lessonData.activities) : lessonData.activities) : null,
          assessment: lessonData.assessmentMethods,
          notes: lessonData.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedManualLesson.id)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setManualLessons(prev => {
        const newMap = new Map(prev);
        newMap.forEach((lessons, date) => {
          newMap.set(date, lessons.map(l => l.id === data.id ? data : l));
        });
        return newMap;
      });

      showToast('Manual lesson updated successfully', 'success');
      setShowManualLessonForm(false);
      setSelectedManualLesson(null);
    } catch (error) {
      console.error('Error updating manual lesson:', error);
      showToast('Failed to update manual lesson', 'error');
    }
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-5 gap-3 mb-4">
        {daysInWeek.map(({ date, sessions: daySessions, dayOfWeek, isHoliday: isHolidayDay, holidayName }) => {
          const dateStr = date.toISOString().split("T")[0];
          const hasAIContent = savedLessons.has(dateStr);
          const dayManualLessons = manualLessons.get(dateStr) || [];
          const isPast = isDateInPast(date);

          return (
            <div
              key={dayOfWeek}
              className={cn(
                "relative border rounded-lg transition-colors",
                getDayColor(date, isHolidayDay)
              )}
            >
              <div
                className={`p-2 text-center font-medium text-sm relative ${
                  isToday(date) ? "bg-blue-100" : isHolidayDay ? "bg-red-100" : "bg-gray-100"
                } rounded-t-lg border-b border-gray-200`}
              >
                <span className="font-semibold">{getDayName(date)}</span>
                <br />
                <span className="text-xs text-gray-600">{formatDate(date)}</span>
                {isHolidayDay && (
                  <span className="block text-xs text-red-600 mt-1">🎉 {holidayName}</span>
                )}
              </div>

              <div className="p-2 min-h-[400px]">
                {/* AI Content Indicator and Buttons */}
                {!isHolidayDay && !isPast && (
                  <div className="mb-2 flex items-center gap-1">
                    {hasAIContent ? (
                      <>
                        <button
                          onClick={() => handleViewAILesson(date)}
                          className="flex-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 py-1 px-2 rounded flex items-center justify-center gap-1"
                          title="View AI-generated lesson"
                        >
                          <span>📄</span>
                          <span>AI Lesson</span>
                        </button>
                        <button
                          onClick={() => handleEditAILesson(date)}
                          className="text-xs bg-green-100 hover:bg-green-200 text-green-700 p-1 rounded"
                          title="Edit AI lesson"
                        >
                          ✏️
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleCreateLesson(date)}
                        className="w-full text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 py-1 px-2 rounded"
                        disabled={daySessions.length === 0}
                        title={daySessions.length === 0 ? "No sessions scheduled" : "Create lesson plan"}
                      >
                        + Create Lesson
                      </button>
                    )}
                  </div>
                )}

                {/* Manual Lessons */}
                {dayManualLessons.length > 0 && (
                  <div className="mb-2 p-2 bg-yellow-100 rounded-md border border-yellow-300">
                    <div className="text-xs font-medium text-yellow-800 mb-1">
                      Manual Lessons ({dayManualLessons.length})
                    </div>
                    {dayManualLessons.map((lesson) => (
                      <div key={lesson.id} className="flex items-center justify-between gap-1 mb-1">
                        <button
                          onClick={() => {
                            setViewingManualLesson(lesson);
                            setShowManualLessonView(true);
                          }}
                          className="text-xs text-left hover:text-yellow-900 truncate flex-1"
                        >
                          • {lesson.title}
                        </button>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditManualLesson(lesson)}
                            className="text-xs text-yellow-700 hover:text-yellow-900"
                            title="Edit lesson"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteManualLesson(lesson.id)}
                            className="text-xs text-red-600 hover:text-red-800"
                            title="Delete lesson"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sessions */}
                {isHolidayDay ? (
                  <p className="text-xs text-red-600 text-center mt-4">
                    Holiday - No sessions
                  </p>
                ) : (
                  daySessions.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center mt-4">
                      No sessions
                    </p>
                  ) : (
                    daySessions
                      .sort((a, b) => a.start_time.localeCompare(b.start_time))
                      .map((session) => {
                        const student = students.get(session.student_id);
                        return (
                          <div key={session.id} className="mb-2">
                            <div className="bg-white border border-gray-200 rounded p-2 text-xs">
                              <div className="font-medium text-gray-900">
                                {formatTime(session.start_time)}
                              </div>
                              <div className={session.delivered_by === 'sea' ? 'text-green-600' : 'text-gray-700'}>
                                {student?.initials || 'S'}
                                {session.delivered_by === 'sea' && (
                                  <div className="text-green-600 text-xs">SEA</div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Session Details</h3>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Student:</strong> {students.get(selectedSession.student_id)?.initials || 'Unknown'}
              </p>
              <p>
                <strong>Time:</strong> {formatTime(selectedSession.start_time)} - {formatTime(selectedSession.end_time)}
              </p>
              <p>
                <strong>Type:</strong> {selectedSession.service_type}
              </p>
              {selectedSession.delivered_by === 'sea' && (
                <p className="text-green-600">
                  <strong>Delivered by SEA</strong>
                </p>
              )}
              {sessionConflicts[selectedSession.id] && (
                <p className="text-red-600">
                  <strong>⚠️ This session has a scheduling conflict</strong>
                </p>
              )}
              {selectedSession.session_notes && (
                <div className="mt-2">
                  <strong>Notes:</strong>
                  <p className="mt-1 p-2 bg-gray-50 rounded">{selectedSession.session_notes}</p>
                </div>
              )}
              {selectedSession.completed_at && (
                <p className="text-green-600">
                  <strong>✓ Completed</strong>
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedSession(null)}
              className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* AI Content Modal */}
      <AIContentModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setAiContent(null);
          setViewingSavedLesson(false);
        }}
        timeSlot={selectedDate ? formatDate(selectedDate) : ''}
        students={Array.from(students.entries()).map(([id, student]) => ({
          id,
          student_number: '',
          first_name: '',
          last_name: '',
          initials: student.initials,
          grade_level: student.grade_level || '',
          teacher_name: ''
        }))}
        content={aiContent}
        isLoading={generatingContent}
        isViewingSaved={viewingSavedLesson}
      />

      {/* Lesson Type Modal */}
      <LessonTypeModal
        isOpen={showLessonTypeModal}
        onClose={() => {
          setShowLessonTypeModal(false);
          setSelectedLessonDate(null);
        }}
        onSelectAI={() => handleLessonTypeSelect('ai')}
        onSelectManual={() => handleLessonTypeSelect('manual')}
      />

      {/* Manual Lesson Form Modal */}
      <ManualLessonFormModal
        isOpen={showManualLessonForm}
        onClose={() => {
          setShowManualLessonForm(false);
          setSelectedManualLesson(null);
        }}
        onSave={selectedManualLesson ? handleUpdateManualLesson : handleSaveManualLesson}
        initialData={selectedManualLesson ? {
          id: selectedManualLesson.id,
          title: selectedManualLesson.title,
          subject: selectedManualLesson.subject || '',
          gradeLevels: selectedManualLesson.grade_levels?.join(', ') || '',
          duration: selectedManualLesson.duration_minutes || undefined,
          learningObjectives: selectedManualLesson.objectives || '',
          materialsNeeded: selectedManualLesson.materials || '',
          activities: selectedManualLesson.activities ? JSON.stringify(selectedManualLesson.activities) : '',
          assessmentMethods: selectedManualLesson.assessment || '',
          notes: selectedManualLesson.notes || ''
        } : undefined}
        lessonDate={selectedLessonDate || new Date()}
      />

      {/* Manual Lesson View Modal */}
      {showManualLessonView && viewingManualLesson && (
        <ManualLessonViewModal
          isOpen={showManualLessonView}
          onClose={() => {
            setShowManualLessonView(false);
            setViewingManualLesson(null);
          }}
          lesson={viewingManualLesson}
          onEdit={(lesson) => {
            setShowManualLessonView(false);
            handleEditManualLesson(lesson);
          }}
          onDelete={(lessonId) => {
            setShowManualLessonView(false);
            handleDeleteManualLesson(lessonId);
          }}
        />
      )}
    </div>
  );
}