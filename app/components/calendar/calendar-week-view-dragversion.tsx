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
import { toLocalDateKey } from '@/lib/utils/date-time';
import { isScheduledSession } from '@/lib/utils/session-helpers';

type ScheduleSession = Database["public"]["Tables"]["schedule_sessions"]["Row"];
type Lesson = Database["public"]["Tables"]["lessons"]["Row"];

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
    const dateStr = toLocalDateKey(date);
    return holidays.some(h => h.date === dateStr);
  };

  // Get holiday name for a date
  const getHolidayName = (date: Date) => {
    const dateStr = toLocalDateKey(date);
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
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionConflicts, setSessionConflicts] = useState<Record<string, boolean>>({});
  
  // State for manual lesson creation
  const [showLessonTypeModal, setShowLessonTypeModal] = useState(false);
  const [selectedLessonDate, setSelectedLessonDate] = useState<Date | null>(null);
  const [showManualLessonForm, setShowManualLessonForm] = useState(false);
  const [manualLessons, setManualLessons] = useState<Map<string, Lesson[]>>(new Map());
  const [selectedManualLesson, setSelectedManualLesson] = useState<Lesson | null>(null);
  const [loadingManualLessons, setLoadingManualLessons] = useState(false);
  const [showManualLessonView, setShowManualLessonView] = useState(false);
  const [viewingManualLesson, setViewingManualLesson] = useState<Lesson | null>(null);
  
  // Drag and drop state
  const [draggedSession, setDraggedSession] = useState<ScheduleSession | null>(null);
  const [dropTarget, setDropTarget] = useState<{ day: number } | null>(null);
  const [validDropDays, setValidDropDays] = useState<Set<number>>(new Set());
  const [invalidDropDays, setInvalidDropDays] = useState<Set<number>>(new Set());
  const [isValidating, setIsValidating] = useState(false);
  
  // Real-time sync state
  const [isConnected, setIsConnected] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);

  const supabase = createClient<Database>();
  const { showToast } = useToast();

  // Replace the useEffect that loads sessions
  React.useEffect(() => {
    const sessionGenerator = new SessionGenerator();
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

      const weekSessions = await sessionGenerator.getSessionsForDateRange(user.id, weekStart, weekEnd, profile?.role);

      setSessionsState(weekSessions);
    };

    loadSessions();
  }, [weekOffset, supabase]);

  // Check for conflicts after sessions are loaded
  const checkSessionConflicts = useCallback(async () => {
    const conflicts: Record<string, boolean> = {};

    for (const session of sessionsState) {
      // Skip validation for unscheduled sessions (with null times)
      if (!session.day_of_week || !session.start_time || !session.end_time) {
        conflicts[session.id] = false;
        continue;
      }

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
          const lessonsByDate = new Map<string, Lesson[]>();
          data.lessons.forEach((lesson: Lesson) => {
            const dateKey = lesson.lesson_date;
            // Processing lesson for date
            if (!lessonsByDate.has(dateKey)) {
              lessonsByDate.set(dateKey, []);
            }
            lessonsByDate.get(dateKey)!.push(lesson);
          });
          
          // Manual lessons grouped by date
          setManualLessons(lessonsByDate);
        } else {
          console.error('Failed to fetch manual lessons:', response.status, response.statusText);
          toast('Failed to load manual lessons', 'error');
        }
      } catch (error) {
        console.error('Error loading manual lessons:', error);
        toast('Error loading manual lessons', 'error');
      } finally {
        setLoadingManualLessons(false);
      }
    };

    loadManualLessons();
  }, [weekOffset, showToast, supabase.auth]);

  // Handler for completing/uncompleting a session
  // In calendar-week-view.tsx
  const handleCompleteToggle = async (sessionId: string, completed: boolean) => {
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

        // Update local state
        setSessionsState(prev => prev.map(session => 
          session.id === sessionId 
            ? { ...session, ...updateData }
            : session
        ));
      }
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

        // Update local state
        setSessionsState(prev => prev.map(session => 
          session.id === selectedSession.id 
            ? { ...session, session_notes: notesValue.trim() || null }
            : session
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

          // Filter out unscheduled sessions before grouping
          selectedDaySessions
            .filter(session => session.start_time !== null)
            .forEach((session) => {
              const timeKey = session.start_time!;
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
              id: session.student_id || '',
              initials: session.student_id ? students.get(session.student_id)?.initials || 'Unknown' : 'Unknown',
              grade_level: session.student_id ? students.get(session.student_id)?.grade_level || '1' : '1', // Default grade if missing
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
  }, [weekOffset, weekDates]); 

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  // Helper functions for time conversion
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const addMinutesToTime = (time: string, minutesToAdd: number): string => {
    const totalMinutes = timeToMinutes(time) + minutesToAdd;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
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

  // Check if a date is in the past
  const isDateInPast = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Optimistically update session in state
  const optimisticUpdate = useCallback((sessionId: string, updates: Partial<ScheduleSession>) => {
    setSessionsState(prev => prev.map(session => 
      session.id === sessionId ? { ...session, ...updates } : session
    ));
  }, []);

  const validateAllDropTargets = useCallback(async (session: ScheduleSession) => {
    if (!session) return;

    // Skip validation for unscheduled sessions (with null times)
    if (!session.start_time || !session.end_time || !session.day_of_week) {
      setValidDropDays(new Set());
      setInvalidDropDays(new Set());
      return;
    }

    setIsValidating(true);
    const valid = new Set<number>();
    const invalid = new Set<number>();

    // Check all days in the week
    for (let dayIndex = 0; dayIndex < weekDates.length; dayIndex++) {
      const targetDate = weekDates[dayIndex];
      const targetDay = dayIndex + 1; // 1-5 for Monday-Friday

      // Skip if it's the current day
      if (targetDay === session.day_of_week) {
        valid.add(targetDay);
        continue;
      }

      // Check if date is in the past
      if (isDateInPast(targetDate)) {
        invalid.add(targetDay);
        continue;
      }

      // Basic validation for day change
      // In a real implementation, you might want to check provider availability
      const validation = await sessionUpdateService.validateSessionMove({
        session,
        targetDay: targetDay,
        targetStartTime: session.start_time,
        targetEndTime: session.end_time,
        studentMinutes: timeToMinutes(session.end_time) - timeToMinutes(session.start_time)
      });

      if (validation.valid) {
        valid.add(targetDay);
      } else {
        invalid.add(targetDay);
      }
    }

    setValidDropDays(valid);
    setInvalidDropDays(invalid);
    setIsValidating(false);
  }, [weekDates]);

  // Drag and drop handlers
  const handleDragStart = useCallback((session: ScheduleSession, event: DragEvent) => {
    setDraggedSession(session);
    // Validate all potential drop targets when drag starts
    validateAllDropTargets(session);
  }, [validateAllDropTargets]);

  const handleDragEnd = useCallback(() => {
    setDraggedSession(null);
    setDropTarget(null);
    setValidDropDays(new Set());
    setInvalidDropDays(new Set());
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent, targetDay: number) => {
    if (!draggedSession) return;
    
    event.preventDefault();
    event.dataTransfer.dropEffect = validDropDays.has(targetDay) ? 'move' : 'none';
    setDropTarget({ day: targetDay });
  }, [draggedSession, validDropDays]);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent, targetDay: number) => {
    event.preventDefault();

    if (!draggedSession || !validDropDays.has(targetDay)) {
      showToast('Cannot move session to this day', 'error');
      return;
    }

    // Skip if session doesn't have valid times
    if (!draggedSession.start_time || !draggedSession.end_time) {
      showToast('Cannot move unscheduled session', 'error');
      return;
    }

    // Use optimistic update for immediate UI feedback
    optimisticUpdate(draggedSession.id, {
      day_of_week: targetDay
    });

    try {
      const result = await sessionUpdateService.updateSessionTime(
        draggedSession.id,
        targetDay,
        draggedSession.start_time,
        draggedSession.end_time
      );
      
      if (result.success) {
        showToast('Session moved successfully', 'success');
      } else {
        showToast(result.error || 'Failed to move session', 'error');
        // Optimistic update will be rolled back automatically
      }
    } catch (error) {
      showToast('An error occurred while moving the session', 'error');
    } finally {
      handleDragEnd();
    }
  }, [draggedSession, validDropDays, optimisticUpdate, handleDragEnd, showToast]);

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

  // Group sessions by day, filtering out sessions without valid students and unscheduled sessions
  const sessionsByDay = React.useMemo(() => {
    return sessionsState
      .filter((session) =>
        session.student_id && students.has(session.student_id) &&
        isScheduledSession(session)
      )
      .reduce((acc, session) => {
        (acc[session.day_of_week!] ||= []).push(session);
        return acc;
      }, {} as Record<number, ScheduleSession[]>);
  }, [sessionsState, students]);

  // Sort sessions within each day
  Object.keys(sessionsByDay).forEach((day) => {
    sessionsByDay[Number(day)].sort((a, b) =>
      a.start_time!.localeCompare(b.start_time!),
    );
  });

  // Handler for manual lesson creation
  const handleAddLesson = (date: Date) => {
    setSelectedLessonDate(date);
    setShowLessonTypeModal(true);
  };

  // Handler for selecting AI lesson type
  const handleSelectAI = () => {
    if (selectedLessonDate) {
      const dayOfWeek = selectedLessonDate.getDay() === 0 ? 7 : selectedLessonDate.getDay();
      const daySessions = sessionsByDay[dayOfWeek] || [];
      handleGenerateDailyAILesson(selectedLessonDate, daySessions);
    }
  };

  // Handler for selecting manual lesson type
  const handleSelectManual = () => {
    setShowManualLessonForm(true);
  };

  // Handler for saving manual lesson
  const handleSaveManualLesson = async (lessonData: any) => {
    const dateKey = selectedLessonDate?.toISOString().split('T')[0];
    if (!dateKey) return;

    // Optimistic update - create temporary lesson
    const tempLesson: any = {
      id: selectedManualLesson?.id || `temp-${Date.now()}`,
      provider_id: '', // Will be set by server
      lesson_date: dateKey,
      title: lessonData.title,
      subject: lessonData.subject || null,
      grade_levels: lessonData.gradeLevels ? lessonData.gradeLevels.split(',').map((g: string) => g.trim()) : null,
      duration_minutes: lessonData.duration || null,
      objectives: lessonData.learningObjectives || null,
      materials: lessonData.materialsNeeded || null,
      activities: lessonData.activities || null,
      assessment: lessonData.assessmentMethods || null,
      notes: lessonData.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistically update UI - ensure we create new arrays/maps for React to detect changes
    const updatedLessons = new Map(manualLessons);
    const existingLessons = updatedLessons.get(dateKey) || [];
    const dateLessons = [...existingLessons];
    
    if (selectedManualLesson) {
      // Update existing lesson
      const index = dateLessons.findIndex(l => l.id === selectedManualLesson.id);
      if (index !== -1) {
        dateLessons[index] = tempLesson;
      }
    } else {
      // Add new lesson
      dateLessons.push(tempLesson);
    }
    
    updatedLessons.set(dateKey, dateLessons);
    // Setting manual lessons optimistically
    setManualLessons(updatedLessons);
    
    // Show optimistic success
    showToast(selectedManualLesson ? 'Updating lesson...' : 'Creating lesson...', 'info');
    
    // Close form after state update
    setShowManualLessonForm(false);

    try {
      const url = selectedManualLesson 
        ? `/api/manual-lessons/${selectedManualLesson.id}`
        : '/api/manual-lessons';
      
      const method = selectedManualLesson ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: lessonData.title,
          subject: lessonData.subject,
          grade_levels: lessonData.gradeLevels,
          duration_minutes: lessonData.duration,
          objectives: lessonData.learningObjectives,
          materials: lessonData.materialsNeeded,
          activities: lessonData.activities,
          assessment: lessonData.assessmentMethods,
          notes: lessonData.notes,
          lesson_date: dateKey,
        }),
      });

      if (response.ok) {
        const { lesson } = await response.json();
        
        // Replace temp lesson with real one
        const finalLessons = new Map(manualLessons);
        const finalDateLessons = [...(finalLessons.get(dateKey) || [])];
        
        if (selectedManualLesson) {
          const index = finalDateLessons.findIndex(l => l.id === selectedManualLesson.id);
          if (index !== -1) {
            finalDateLessons[index] = lesson;
          }
        } else {
          // Remove temp and add real
          const tempIndex = finalDateLessons.findIndex(l => l.id === tempLesson.id);
          if (tempIndex !== -1) {
            finalDateLessons[tempIndex] = lesson;
          } else {
            // If temp lesson wasn't found, just add the new lesson
            finalDateLessons.push(lesson);
          }
        }
        
        finalLessons.set(dateKey, finalDateLessons);
        // Setting final manual lessons
        setManualLessons(finalLessons);
        
        // showToast(
        //   selectedManualLesson ? 'Lesson updated successfully' : 'Lesson created successfully',
        //   'success'
        // );
        setSelectedManualLesson(null);
      } else {
        // Revert optimistic update
        const revertedLessons = new Map(manualLessons);
        if (selectedManualLesson) {
          // Revert to original
          const revertDateLessons = [...(revertedLessons.get(dateKey) || [])];
          const index = revertDateLessons.findIndex(l => l.id === selectedManualLesson.id);
          if (index !== -1) {
            revertDateLessons[index] = selectedManualLesson;
          }
          revertedLessons.set(dateKey, revertDateLessons);
        } else {
          // Remove temp lesson
          const revertDateLessons = (revertedLessons.get(dateKey) || [])
            .filter(l => l.id !== tempLesson.id);
          if (revertDateLessons.length === 0) {
            revertedLessons.delete(dateKey);
          } else {
            revertedLessons.set(dateKey, revertDateLessons);
          }
        }
        setManualLessons(revertedLessons);
        
        showToast('Failed to save lesson. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error saving manual lesson:', error);
      
      // Revert optimistic update on error
      if (!selectedManualLesson) {
        const revertedLessons = new Map(manualLessons);
        const revertDateLessons = (revertedLessons.get(dateKey) || [])
          .filter(l => l.id !== tempLesson.id);
        if (revertDateLessons.length === 0) {
          revertedLessons.delete(dateKey);
        } else {
          revertedLessons.set(dateKey, revertDateLessons);
        }
        setManualLessons(revertedLessons);
      }
      
      showToast('Error saving lesson. Please try again.', 'error');
    }
  };

  // Handler for editing manual lesson
  const handleEditManualLesson = (lesson: Lesson) => {
    setSelectedManualLesson(lesson);
    setSelectedLessonDate(new Date(lesson.lesson_date));
    setShowManualLessonForm(true);
  };

  // Handler for deleting manual lesson
  const handleDeleteManualLesson = async (lessonId: string, dateStr: string) => {
    if (!confirm('Are you sure you want to delete this manual lesson?')) {
      return;
    }

    // Optimistic update - remove lesson immediately
    const originalLessons = manualLessons.get(dateStr) || [];
    const lessonToDelete = originalLessons.find(l => l.id === lessonId);
    
    const updatedLessons = new Map(manualLessons);
    const filteredLessons = originalLessons.filter(l => l.id !== lessonId);
    
    if (filteredLessons.length === 0) {
      updatedLessons.delete(dateStr);
    } else {
      updatedLessons.set(dateStr, filteredLessons);
    }
    
    setManualLessons(updatedLessons);
    showToast('Deleting lesson...', 'info');

    try {
      const response = await fetch(`/api/manual-lessons/${lessonId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showToast('Lesson deleted successfully', 'success');
        // Close view modal if it's open
        if (viewingManualLesson?.id === lessonId) {
          setShowManualLessonView(false);
          setViewingManualLesson(null);
        }
      } else {
        // Revert optimistic update
        if (lessonToDelete) {
          const revertedLessons = new Map(updatedLessons);
          const currentDateLessons = revertedLessons.get(dateStr) || [];
          currentDateLessons.push(lessonToDelete);
          revertedLessons.set(dateStr, currentDateLessons);
          setManualLessons(revertedLessons);
        }
        showToast('Failed to delete lesson', 'error');
      }
    } catch (error) {
      console.error('Error deleting manual lesson:', error);
      // Revert optimistic update
      if (lessonToDelete) {
        const revertedLessons = new Map(updatedLessons);
        const currentDateLessons = revertedLessons.get(dateStr) || [];
        currentDateLessons.push(lessonToDelete);
        revertedLessons.set(dateStr, currentDateLessons);
        setManualLessons(revertedLessons);
      }
      showToast('Error deleting lesson', 'error');
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
        {weekDates.map((date, index) => {
          const dayOfWeek = index + 1; // 1 = Monday, 2 = Tuesday, etc.
          const daySessions = sessionsByDay[dayOfWeek] || [];
          const isToday = date.toDateString() === new Date().toDateString();
          
          // Sort sessions by start time for chronological order
          const sortedDaySessions = [...daySessions].sort((a, b) => a.start_time!.localeCompare(b.start_time!));

          return (
            <div
              key={dayOfWeek}
              className={cn(
                "border rounded-lg transition-all",
                isToday ? "border-blue-400 bg-blue-50" : isHoliday(date) ? "border-red-200 bg-red-50" : "border-gray-200",
                dropTarget?.day === dayOfWeek && "ring-2",
                dropTarget?.day === dayOfWeek && validDropDays.has(dayOfWeek) && "ring-blue-400 bg-blue-50",
                dropTarget?.day === dayOfWeek && invalidDropDays.has(dayOfWeek) && "ring-red-400 bg-red-50",
                draggedSession && !dropTarget && validDropDays.has(dayOfWeek) && "border-blue-300",
                draggedSession && !dropTarget && invalidDropDays.has(dayOfWeek) && "border-red-300"
              )}
              onDragOver={(e) => handleDragOver(e, dayOfWeek)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, dayOfWeek)}
            >
              <div
                className={`p-2 text-center font-medium text-sm relative ${
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
                
                {/* Plus button for manual lesson creation */}
                <button
                  onClick={() => handleAddLesson(date)}
                  className="absolute flex items-center justify-center bg-white rounded-full transition-all duration-200 hover:scale-110 touch-manipulation"
                  style={{
                    top: '4px',
                    right: '4px',
                    width: '32px',
                    height: '32px',
                    border: '2px dashed #9ca3af',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#3b82f6';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#9ca3af';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  title="Add manual lesson"
                  aria-label="Add manual lesson"
                >
                  <span className="text-gray-600 text-lg leading-none" aria-hidden="true">+</span>
                </button>
              </div>

              {/* AI Lesson Buttons - only show if there are sessions */}
              {sortedDaySessions.length > 0 && (
                <div className="px-2 pt-1 pb-2 space-y-1">
                  {/* AI Daily Lesson Button */}
                  <button
                    onClick={() =>
                      handleGenerateDailyAILesson(date, sortedDaySessions)
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

              {/* Manual Lessons */}
              {loadingManualLessons ? (
                <div className="px-2 pb-2">
                  <div className="flex items-center justify-center py-2">
                    <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                </div>
              ) : (() => {
                const dateStr = date.toISOString().split('T')[0];
                const dayManualLessons = manualLessons.get(dateStr) || [];
                // Check manual lessons for date
                
                return dayManualLessons.length > 0 ? (
                  <div className="px-2 pb-2 space-y-1">
                    {dayManualLessons.map((lesson) => (
                      <div key={lesson.id} className="relative group">
                        <button
                          onClick={() => {
                            setViewingManualLesson(lesson);
                            setShowManualLessonView(true);
                          }}
                          className="w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1.5 text-left"
                          title={lesson.title || undefined}
                        >
                          <span>📝</span>
                          <span className="truncate">Manual Lesson: {lesson.title}</span>
                        </button>
                        
                        {/* Delete button (X) - only visible on hover */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteManualLesson(lesson.id, dateStr);
                          }}
                          className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                          title="Delete manual lesson"
                        >
                          <span className="text-xs leading-none">×</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}

              <div className="p-2 space-y-1 min-h-[200px] relative">
                {draggedSession && dropTarget?.day === dayOfWeek && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded">
                    <p className="text-xs font-medium text-center px-2">
                      {validDropDays.has(dayOfWeek) 
                        ? `Drop here to move to ${date.toLocaleDateString('en-US', { weekday: 'short' })}`
                        : isDateInPast(date) 
                          ? 'Cannot move to past dates'
                          : 'Cannot move session here'
                      }
                    </p>
                  </div>
                )}
                {sortedDaySessions.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center mt-4">
                    No sessions
                  </p>
                ) : (
                  sortedDaySessions.map((session) => {
                      const student = session.student_id ? students.get(session.student_id) : undefined;
                      const currentSession = sessionsState.find(s => s.id === session.id) || session;
                    return (
                      <div
                        key={session.id}
                        className="flex items-start gap-2"
                      >
                        <div
                          className={cn(
                            "inline-flex items-center justify-center w-12 h-12 rounded-md border-2 font-medium text-xs",
                            {
                              // Conflict styling takes precedence
                              'bg-red-100 border-red-300': sessionConflicts[currentSession.id],
                              // SEA session styling (when no conflict)
                              'bg-green-100 border-green-300': session.delivered_by === 'sea' && !sessionConflicts[currentSession.id],
                              // Regular session styling (when no conflict)
                              'bg-gray-100 border-gray-300': session.delivered_by !== 'sea' && !sessionConflicts[currentSession.id],
                            }
                          )}
                        >
                          <span className="select-none">
                            {student?.initials || '?'}
                          </span>
                        </div>
                        <div className="flex-1 text-xs">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSession(currentSession);
                            }}
                            className="text-gray-900 hover:text-blue-600 font-medium"
                          >
                            {session.start_time && formatTime(session.start_time)}
                          </button>
                          <div className="flex items-center gap-1 mt-0.5">
                            {currentSession.completed_at && (
                              <span className="text-green-600" title="Completed">✓</span>
                            )}
                            {currentSession.session_notes && (
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

      {/* Connection status indicator */}
      {isConnected && (
        <div className="mt-2 text-xs text-gray-500 text-right">
          Real-time sync active • Last update: {lastSync ? new Date(lastSync).toLocaleTimeString() : 'Never'}
        </div>
      )}

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
            initials: session.student_id ? students.get(session.student_id)?.initials || '' : '',
            grade_level: session.student_id ? students.get(session.student_id)?.grade_level || '' : '',
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
                    <p className="font-medium">{selectedSession.student_id ? students.get(selectedSession.student_id)?.initials || 'Unknown' : 'Unknown'}</p>
                  </div>
                  {selectedSession.start_time && selectedSession.end_time && (
                    <div>
                      <p className="text-sm text-gray-600">Time</p>
                      <p className="font-medium">{formatTime(selectedSession.start_time)} - {formatTime(selectedSession.end_time)}</p>
                    </div>
                  )}
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

      {/* Lesson Type Selection Modal */}
      <LessonTypeModal
        isOpen={showLessonTypeModal}
        onClose={() => setShowLessonTypeModal(false)}
        onSelectAI={handleSelectAI}
        onSelectManual={handleSelectManual}
      />

      {/* Manual Lesson Form Modal */}
      <ManualLessonFormModal
        isOpen={showManualLessonForm}
        onClose={() => {
          setShowManualLessonForm(false);
          setSelectedManualLesson(null);
        }}
        onSave={handleSaveManualLesson}
        initialData={(selectedManualLesson ? {
          id: selectedManualLesson.id,
          title: selectedManualLesson.title,
          subject: selectedManualLesson.subject ?? undefined,
          gradeLevels: selectedManualLesson.grade_levels?.join(', ') ?? undefined,
          duration: selectedManualLesson.duration_minutes ?? undefined,
          learningObjectives: (selectedManualLesson.content as any)?.objectives || '',
          materialsNeeded: (selectedManualLesson.content as any)?.materials || '',
          activities: (selectedManualLesson.content as any)?.activities ?
            (typeof (selectedManualLesson.content as any).activities === 'string'
              ? (selectedManualLesson.content as any).activities
              : JSON.stringify((selectedManualLesson.content as any).activities, null, 2))
            : '',
          assessmentMethods: (selectedManualLesson.content as any)?.assessment || '',
          notes: selectedManualLesson.notes ?? undefined,
        } : undefined) as any}
        lessonDate={selectedLessonDate || new Date()}
      />

      {/* Manual Lesson View Modal */}
      {viewingManualLesson && (
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
            const dateStr = viewingManualLesson.lesson_date;
            handleDeleteManualLesson(lessonId, dateStr);
          }}
        />
      )}
      </div>
    );
  }