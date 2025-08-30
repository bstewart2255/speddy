"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from '@/lib/supabase/client';
import type { Database } from "../../../src/types/database";
import { AIContentModal } from "../ai-content-modal";
import { AIContentModalEnhanced } from "../ai-content-modal-enhanced";
import { SessionGenerator } from '@/lib/services/session-generator';
import { LessonTypeModal } from "../modals/lesson-type-modal";
import { ManualLessonFormModal } from "../modals/manual-lesson-form-modal";
import { ManualLessonViewModal } from "../modals/manual-lesson-view-modal";
import { useToast } from "../../contexts/toast-context";
import { sessionUpdateService } from '@/lib/services/session-update-service';
import { cn } from '@/src/utils/cn';
import { toLocalDateKey, formatTimeSlot, calculateDurationFromTimeSlot } from '@/lib/utils/date-time';

type ScheduleSession = Database["public"]["Tables"]["schedule_sessions"]["Row"];
type ManualLesson = Database["public"]["Tables"]["manual_lesson_plans"]["Row"];
type CalendarEvent = Database["public"]["Tables"]["calendar_events"]["Row"];

interface CalendarWeekViewProps {
  sessions: ScheduleSession[];
  students: Map<string, {
    initials: string;
    grade_level?: string;
  }>;
  onSessionClick?: (session: ScheduleSession) => void;
  weekOffset?: number;
  holidays?: Array<{ date: string; name?: string }>;
  calendarEvents?: CalendarEvent[];
  onAddEvent?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}


export function CalendarWeekView({
  sessions,
  students,
  onSessionClick,
  weekOffset = 0,
  holidays = [], // Add holiday feature
  calendarEvents = [],
  onAddEvent,
  onEventClick
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
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [selectedDaySessions, setSelectedDaySessions] = useState<ScheduleSession[]>([]);
  const [aiContent, setAiContent] = useState<string | null>(null);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [savedLessons, setSavedLessons] = useState<Map<string, any>>(new Map());
  const [loadingSavedLessons, setLoadingSavedLessons] = useState(false);
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
  
  // State for enhanced modal with multiple lessons
  const [enhancedModalOpen, setEnhancedModalOpen] = useState(false);
  const [enhancedModalLessons, setEnhancedModalLessons] = useState<any[]>([]);
  const [enhancedModalDate, setEnhancedModalDate] = useState<Date>(new Date());

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
        const startDate = toLocalDateKey(weekStart);
        const endDate = toLocalDateKey(weekEnd);

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

  // Clean up legacy lessons without time_slot on mount
  React.useEffect(() => {
    const cleanupLegacyLessons = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      try {
        // Delete lessons without time_slot as they are no longer needed
        const { error } = await supabase
          .from('ai_generated_lessons')
          .delete()
          .eq('provider_id', user.id)
          .is('time_slot', null);

        if (error && error.code !== '42P01') {
          console.error('Failed to cleanup legacy lessons:', error);
        }
      } catch (error) {
        console.error('Error during legacy cleanup:', error);
      }
    };

    cleanupLegacyLessons();
  }, []); // Run once on mount

  // Load saved AI lessons
  React.useEffect(() => {
    // Skip if weekDates is not ready
    if (!weekDates || weekDates.length === 0) return;


    const loadSavedLessons = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setLoadingSavedLessons(true);
      try {
        const weekStart = weekDates[0];
        const weekEnd = weekDates[weekDates.length - 1];

        const startDate = toLocalDateKey(weekStart);
        const endDate = toLocalDateKey(weekEnd);

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
            const dateKey = lesson.lesson_date;
            const timeSlot = lesson.time_slot || '08:00'; // Default for legacy data
            
            if (!lessonsMap.has(dateKey)) {
              lessonsMap.set(dateKey, {});
            }
            
            const dayLessons = lessonsMap.get(dateKey);
            dayLessons[timeSlot] = {
              content: lesson.content,
              prompt: lesson.prompt
            };
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

  // Helper function to group sessions by time slots (using actual start-end times)
  const groupSessionsByTimeSlot = (sessions: ScheduleSession[]): Map<string, ScheduleSession[]> => {
    const timeSlotGroups = new Map<string, ScheduleSession[]>();
    
    sessions.forEach(session => {
      if (!session.start_time || !session.end_time) return;
      
      // Normalize time format by removing seconds if present
      const startTime = session.start_time.split(':').slice(0, 2).join(':');
      const endTime = session.end_time.split(':').slice(0, 2).join(':');
      const timeSlot = `${startTime}-${endTime}`;
      
      if (!timeSlotGroups.has(timeSlot)) {
        timeSlotGroups.set(timeSlot, []);
      }
      timeSlotGroups.get(timeSlot)!.push(session);
    });
    
    // Sort the map by time slot keys
    return new Map([...timeSlotGroups.entries()].sort());
  };

  // Simplified day color calculations - only holidays and past dates
  const getDayColorData = useMemo(() => {
    const colorMap = new Map<string, string>();
    const today = new Date();
    
    weekDates.forEach((date) => {
      const dateStr = toLocalDateKey(date);
      const isHolidayDay = isHoliday(date);
      
      // Past dates are gray
      if (isDateInPast(date)) {
        colorMap.set(dateStr, "bg-gray-50 border-gray-200");
        return;
      }
      
      // Holidays are red
      if (isHolidayDay) {
        colorMap.set(dateStr, "bg-red-50 border-red-200");
        return;
      }
      
      // Today's date gets a subtle ring
      if (date.toDateString() === today.toDateString()) {
        colorMap.set(dateStr, "bg-white border-blue-300 ring-2 ring-blue-300");
        return;
      }
      
      // Regular days are white
      colorMap.set(dateStr, "bg-white border-gray-200");
    });
    
    return colorMap;
  }, [weekDates, isHoliday]);
  
  const getDayColor = (date: Date) => {
    const dateStr = toLocalDateKey(date);
    return getDayColorData.get(dateStr) || "bg-white border-gray-200";
  };

  const handleGenerateDailyAILesson = async (
    date: Date,
    daySessions: ScheduleSession[],
  ) => {
    if (!currentUser) {
      showToast('Please log in to generate AI lessons', 'error');
      return;
    }
    
    if (daySessions.length === 0) {
      showToast('No sessions scheduled for this day', 'warning');
      return;
    }
    
    // Group sessions by time slots
    const timeSlotGroups = groupSessionsByTimeSlot(daySessions);
    
    // Generate AI lessons for each time slot
    for (const [timeSlot, slotSessions] of timeSlotGroups) {
      await generateAIContentForTimeSlot(date, slotSessions, timeSlot);
    }
    
    showToast(`Generated ${timeSlotGroups.size} AI lesson(s) for different time slots`, 'success');
  };

  // Generate AI content for a specific time slot
  const generateAIContentForTimeSlot = async (date: Date, slotSessions: ScheduleSession[], timeSlot: string) => {
    if (!currentUser) {
      return;
    }
    
    // Extract unique students from the sessions
    const sessionStudents = new Set<string>();
    slotSessions.forEach(session => {
      if (session.student_id) {
        sessionStudents.add(session.student_id);
      }
    });
    
    // Get student details for the new API format
    const studentList = Array.from(sessionStudents).map(studentId => {
      const student = students.get(studentId);
      
      // Parse grade level to number for new API
      let grade = 3; // Default grade
      if (student?.grade_level) {
        const gradeStr = String(student.grade_level).toLowerCase();
        if (/\bk(indergarten)?\b/.test(gradeStr)) {
          grade = 0;
        } else {
          const gradeMatch = gradeStr.match(/\d+/);
          if (gradeMatch) {
            grade = parseInt(gradeMatch[0], 10);
          }
        }
      }
      
      return {
        id: studentId,
        grade
      };
    });
    
    if (studentList.length === 0) {
      return; // Skip empty time slots
    }
    
    console.log(`Generating lesson for ${studentList.length} students in time slot ${timeSlot}`);
    
    try {
      // Determine subject based on time of day or use default
      const subject = 'English Language Arts'; // Default subject, can be made configurable
      const duration = calculateDurationFromTimeSlot(timeSlot);
      
      // Use the new JSON lesson API
      const response = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          students: studentList,
          subject,
          duration,
          topic: `Session for ${formatTimeSlot(timeSlot)}`,
          teacherRole: currentUser.role || 'resource'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate lesson');
      }

      const data = await response.json();
      
      // The new API returns a structured lesson object
      if (!data.lesson) {
        console.error(`No lesson received for time slot ${timeSlot}`);
        throw new Error('No lesson received from API');
      }

      console.log(`Saving lesson for ${timeSlot}, lessonId: ${data.lessonId}`);
      
      // Store the JSON lesson directly
      const lessonContent = JSON.stringify(data.lesson);

      // First try to delete any existing empty lesson
      await supabase
        .from('ai_generated_lessons')
        .delete()
        .eq('provider_id', currentUser.id)
        .eq('lesson_date', toLocalDateKey(date))
        .eq('time_slot', timeSlot)
        .eq('content', '');

      // Save the generated lesson with time slot
      const { error } = await supabase
        .from('ai_generated_lessons')
        .upsert({
          provider_id: currentUser.id,
          lesson_date: toLocalDateKey(date),
          time_slot: timeSlot,
          content: lessonContent,
          prompt: '',
          session_data: slotSessions,
          lesson_id: data.lessonId, // Store reference to new lesson
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'provider_id,lesson_date,time_slot' });

      if (error) {
        throw error;
      }

      // Only update state if save was successful
      setSavedLessons(prev => {
        const newMap = new Map(prev);
        const dateKey = toLocalDateKey(date);
        const dayLessons = newMap.get(dateKey) || {};
        
        // Store lessons by time slot
        newMap.set(dateKey, {
          ...dayLessons,
          [timeSlot]: {
            content: lessonContent,
            prompt: '',
            lessonId: data.lessonId
          }
        });
        return newMap;
      });

      // Return success
      return true;
    } catch (error) {
      console.error(`Error generating content for time slot ${timeSlot}:`, error);
      showToast(`Failed to generate AI content for ${formatTimeSlot(timeSlot)}`, 'error');
      
      // Remove any phantom lesson from state
      setSavedLessons(prev => {
        const newMap = new Map(prev);
        const dateKey = toLocalDateKey(date);
        const dayLessons = newMap.get(dateKey);
        
        if (dayLessons && dayLessons[timeSlot]) {
          delete dayLessons[timeSlot];
          if (Object.keys(dayLessons).length === 0) {
            newMap.delete(dateKey);
          } else {
            newMap.set(dateKey, dayLessons);
          }
        }
        
        return newMap;
      });
      
      // Return failure
      return false;
    }
  };
  
  // Format time slot for display - now using shared utility

  const generateAIContentForDate = async (date: Date, daySessions: ScheduleSession[]) => {
    if (!currentUser) {
      return;
    }
    
    setSelectedDate(date);
    setSelectedDaySessions(daySessions);
    setModalOpen(true);
    
    // Group sessions by time slots and generate for each
    const timeSlotGroups = groupSessionsByTimeSlot(daySessions);
    
    setGeneratingContent(true);
    try {
      for (const [timeSlot, slotSessions] of timeSlotGroups) {
        await generateAIContentForTimeSlot(date, slotSessions, timeSlot);
      }
      showToast(`Generated ${timeSlotGroups.size} AI lesson(s) for different time slots`, 'success');
    } finally {
      setGeneratingContent(false);
    }
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
          lesson_date: toLocalDateKey(selectedDate),
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
        newMap.set(toLocalDateKey(selectedDate), {
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

  const handleViewAILessonForSlot = (date: Date, timeSlot: string) => {
    const dateStr = toLocalDateKey(date);
    const dayLessons = savedLessons.get(dateStr);
    if (dayLessons && dayLessons[timeSlot]) {
      // Get the sessions for this time slot
      const daySessions = sessionsState.filter((s) => {
        const sessionDate = new Date(weekDates[0]);
        sessionDate.setDate(weekDates[0].getDate() + (s.day_of_week - 1));
        return sessionDate.toDateString() === date.toDateString();
      });
      
      // Filter to just this time slot's sessions
      const timeSlotGroups = groupSessionsByTimeSlot(daySessions);
      const slotSessions = timeSlotGroups.get(timeSlot) || [];
      
      setSelectedDate(date);
      setSelectedTimeSlot(timeSlot);
      setSelectedDaySessions(slotSessions);
      setAiContent(dayLessons[timeSlot].content);
      setViewingSavedLesson(true);
      setModalOpen(true);
    }
  };

  const handleEditAILessonForSlot = (date: Date, timeSlot: string) => {
    const dateStr = toLocalDateKey(date);
    const dayLessons = savedLessons.get(dateStr);
    if (dayLessons && dayLessons[timeSlot]) {
      setSelectedDate(date);
      setSelectedTimeSlot(timeSlot);
      const daySessions = sessionsState.filter((s) => {
        const sessionDate = new Date(weekDates[0]);
        sessionDate.setDate(
          weekDates[0].getDate() + (s.day_of_week - 1)
        );
        return sessionDate.toDateString() === date.toDateString();
      });
      // Filter sessions for this specific time slot
      const timeSlotGroups = groupSessionsByTimeSlot(daySessions);
      const slotSessions = timeSlotGroups.get(timeSlot) || [];
      setSelectedDaySessions(slotSessions);
      setAiContent(dayLessons[timeSlot].content);
      setViewingSavedLesson(false);
      setModalOpen(true);
    }
  };
  
  const handleCreateLessonForSlot = async (date: Date, slotSessions: ScheduleSession[], timeSlot: string) => {
    if (!currentUser) {
      showToast('Please log in to generate AI lessons', 'error');
      return;
    }
    
    setSelectedDate(date);
    setSelectedTimeSlot(timeSlot);
    setSelectedDaySessions(slotSessions);
    setModalOpen(true);
    setGeneratingContent(true);
    
    try {
      await generateAIContentForTimeSlot(date, slotSessions, timeSlot);
    } finally {
      setGeneratingContent(false);
    }
  };

  // New unified lesson creation handler
  const handleCreateDailyLesson = (date: Date, daySessions: ScheduleSession[]) => {
    setSelectedLessonDate(date);
    setSelectedDaySessions(daySessions);
    setShowLessonTypeModal(true);
  };

  // Handle viewing all AI lessons for a day
  const handleViewAllAILessons = (date: Date) => {
    const dateStr = toLocalDateKey(date);
    const dayLessons = savedLessons.get(dateStr);
    if (dayLessons) {
      // Get all time slots with lessons
      const timeSlots = Object.keys(dayLessons).sort();
      if (timeSlots.length > 0) {
        // Get all sessions for this day
        const daySessions = sessionsState.filter((s) => {
          const sessionDate = new Date(weekDates[0]);
          sessionDate.setDate(weekDates[0].getDate() + (s.day_of_week - 1));
          return sessionDate.toDateString() === date.toDateString();
        });
        
        // Group sessions by time slot
        const timeSlotGroups = groupSessionsByTimeSlot(daySessions);
        
        // Build lessons array for enhanced modal
        const lessons = timeSlots.map(timeSlot => {
          const slotSessions = timeSlotGroups.get(timeSlot) || [];
          const slotStudents = slotSessions.map(session => ({
            id: session.student_id || '',
            initials: students.get(session.student_id || '')?.initials || '',
            grade_level: students.get(session.student_id || '')?.grade_level || '',
            teacher_name: '' // Teacher name not available on session
          }));
          
          return {
            timeSlot,
            content: dayLessons[timeSlot].content,
            students: slotStudents
          };
        });
        
        // Open enhanced modal with all lessons
        setEnhancedModalLessons(lessons);
        setEnhancedModalDate(date);
        setEnhancedModalOpen(true);
      }
    }
  };

  // Handle editing all AI lessons for a day
  const handleEditAllAILessons = (date: Date) => {
    // For editing, just open view mode - the enhanced modal allows editing too
    handleViewAllAILessons(date);
  };

  // Handle deleting all lessons for a day (entire day only as per requirements)
  const handleDeleteDailyLessons = async (date: Date) => {
    if (!confirm('Are you sure you want to delete all lessons for this day?')) {
      return;
    }

    const dateStr = toLocalDateKey(date);
    const dayLessons = savedLessons.get(dateStr);
    
    if (!dayLessons) return;

    try {
      const supabase = createClient();
      
      // Delete all AI lessons for this date
      const { error } = await supabase
        .from('ai_generated_lessons')
        .delete()
        .eq('school_id', currentUser?.school_id)
        .eq('session_date', dateStr);

      if (error) throw error;

      // Update local state
      setSavedLessons(prev => {
        const newMap = new Map(prev);
        newMap.delete(dateStr);
        return newMap;
      });

      showToast('All lessons deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting lessons:', error);
      showToast('Failed to delete lessons', 'error');
    }
  };

  // Legacy functions for backward compatibility
  const handleViewAILesson = (date: Date) => {
    const dateStr = toLocalDateKey(date);
    const dayLessons = savedLessons.get(dateStr);
    if (dayLessons) {
      // View the first lesson if multiple exist
      const firstTimeSlot = Object.keys(dayLessons).sort()[0];
      if (firstTimeSlot) {
        handleViewAILessonForSlot(date, firstTimeSlot);
      }
    }
  };

  const handleEditAILesson = (date: Date) => {
    const dateStr = toLocalDateKey(date);
    const dayLessons = savedLessons.get(dateStr);
    if (dayLessons) {
      // Edit the first lesson if multiple exist
      const firstTimeSlot = Object.keys(dayLessons).sort()[0];
      if (firstTimeSlot) {
        handleEditAILessonForSlot(date, firstTimeSlot);
      }
    }
  };

  const getDaysInWeek = () => {
    const startDate = weekDates[0];
    const weekSessions = sessionsState.filter((session) => {
      const sessionDate = new Date(startDate);
      sessionDate.setDate(
        startDate.getDate() + (session.day_of_week - 1)
      );
      const sessionDateStr = toLocalDateKey(sessionDate);
      return weekDates.some(
        (d) => toLocalDateKey(d) === sessionDateStr
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

  const handleLessonTypeSelect = async (type: 'ai' | 'manual') => {
    setShowLessonTypeModal(false);
    
    if (type === 'ai' && selectedLessonDate) {
      // Use the sessions that were set when Create Lesson button was clicked
      const daySessions = selectedDaySessions;
      
      if (!daySessions || daySessions.length === 0) {
        showToast('No sessions scheduled for this day', 'warning');
        return;
      }

      // Group sessions by time slot for AI generation
      const timeSlotGroups = groupSessionsByTimeSlot(daySessions);

      // Generate AI lessons for each time slot
      setGeneratingContent(true);
      setModalOpen(true);
      
      let successCount = 0;
      let failCount = 0;
      
      try {
        for (const [timeSlot, slotSessions] of timeSlotGroups.entries()) {
          const success = await generateAIContentForTimeSlot(selectedLessonDate, slotSessions, timeSlot);
          if (success) {
            successCount++;
          } else {
            failCount++;
          }
        }
        
        if (successCount > 0) {
          // After successful generation, show the enhanced modal with all lessons
          const dateStr = toLocalDateKey(selectedLessonDate);
          const dayLessons = savedLessons.get(dateStr);
          
          if (dayLessons) {
            // Convert the lessons object to array format for the enhanced modal
            const lessonsArray = Object.entries(dayLessons).map(([timeSlot, lesson]: [string, any]) => ({
              timeSlot,
              content: lesson.content,
              prompt: lesson.prompt
            }));
            
            // Set up the enhanced modal to show all generated lessons
            setEnhancedModalLessons(lessonsArray);
            setEnhancedModalDate(selectedLessonDate);
            setEnhancedModalOpen(true);
          }
          
          if (failCount === 0) {
            showToast(`Successfully generated ${successCount} AI lesson(s)`, 'success');
          } else {
            showToast(`Generated ${successCount} lesson(s), ${failCount} failed`, 'warning');
          }
        } else {
          showToast('Failed to generate any lessons', 'error');
        }
      } catch (error) {
        console.error('Error generating AI lessons:', error);
        showToast('An unexpected error occurred', 'error');
      } finally {
        setGeneratingContent(false);
        setModalOpen(false);
      }
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
      const lessonDate = toLocalDateKey(selectedLessonDate);
      
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
          const dateStr = toLocalDateKey(date);
          const dayAILessons = savedLessons.get(dateStr) || {};
          const hasAIContent = Object.keys(dayAILessons).length > 0;
          const dayManualLessons = manualLessons.get(dateStr) || [];
          const isPast = isDateInPast(date);
          
          // Sort sessions by start time for chronological order
          const sortedDaySessions = [...daySessions].sort((a, b) => a.start_time.localeCompare(b.start_time));
          
          // Group sessions by time slot for display
          const timeSlotGroups = groupSessionsByTimeSlot(sortedDaySessions);

          return (
            <div
              key={dayOfWeek}
              className={cn(
                "relative border rounded-lg transition-colors",
                getDayColor(date)
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
                {/* Single Create Lesson Button Per Day */}
                {!isHolidayDay && !isPast && sortedDaySessions.length > 0 && !hasAIContent && (
                  <div className="mb-3">
                    <button
                      onClick={() => handleCreateDailyLesson(date, sortedDaySessions)}
                      className="w-full text-sm bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md font-medium transition-colors"
                      title="Create lessons for this day"
                    >
                      + Create Lesson
                    </button>
                  </div>
                )}

                {/* AI Lessons Summary Button */}
                {!isHolidayDay && timeSlotGroups.size > 0 && hasAIContent && (
                  <div className="mb-2">
                    <button
                      onClick={() => handleViewAllAILessons(date)}
                      className="w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium py-2 px-3 rounded-md border border-purple-300 text-sm"
                    >
                      Saved AI Lesson
                    </button>
                  </div>
                )}

                {/* Manual Lessons Summary Button */}
                {dayManualLessons.length > 0 && (
                  <div className="mb-2">
                    <button
                      onClick={() => {
                        if (dayManualLessons.length === 1) {
                          setViewingManualLesson(dayManualLessons[0]);
                          setShowManualLessonView(true);
                        } else {
                          // If multiple manual lessons, show first one or implement a list view modal
                          setViewingManualLesson(dayManualLessons[0]);
                          setShowManualLessonView(true);
                        }
                      }}
                      className="w-full bg-green-100 hover:bg-green-200 text-green-800 font-medium py-2 px-3 rounded-md border border-green-300 text-sm"
                    >
                      Saved Manual Lesson
                    </button>
                  </div>
                )}

                {/* Calendar Events */}
                {(() => {
                  const dayEvents = calendarEvents.filter(e => e.date === dateStr);
                  if (dayEvents.length > 0) {
                    return (
                      <div className="mb-2">
                        <div className="text-xs font-medium text-gray-600 mb-1">Events</div>
                        {dayEvents.map((event) => (
                          <div
                            key={event.id}
                            onClick={() => onEventClick?.(event)}
                            className="mb-1 p-2 rounded text-xs cursor-pointer hover:opacity-80"
                            style={{
                              backgroundColor: 
                                event.event_type === 'meeting' ? '#DBEAFE' : 
                                event.event_type === 'assessment' ? '#FEF3C7' :
                                event.event_type === 'activity' ? '#D1FAE5' :
                                '#F3F4F6',
                              color:
                                event.event_type === 'meeting' ? '#1E40AF' : 
                                event.event_type === 'assessment' ? '#92400E' :
                                event.event_type === 'activity' ? '#065F46' :
                                '#374151'
                            }}
                          >
                            <div className="font-medium">
                              {event.all_day ? 'All Day' : formatTime(event.start_time || '')}
                              {event.title && ` - ${event.title}`}
                            </div>
                            {event.location && (
                              <div className="text-xs opacity-75">📍 {event.location}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Sessions */}
                {isHolidayDay ? (
                  <p className="text-xs text-red-600 text-center mt-4">
                    Holiday - No sessions
                  </p>
                ) : (
                  sortedDaySessions.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center mt-4">
                      No sessions
                    </p>
                  ) : (
                    sortedDaySessions.map((session) => {
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
          setSelectedTimeSlot(null);
          setViewingSavedLesson(false);
        }}
        timeSlot={selectedTimeSlot ? formatTimeSlot(selectedTimeSlot) : ''}
        students={selectedDaySessions.map(session => ({
          id: session.student_id || '',
          student_number: '',
          first_name: '',
          last_name: '',
          initials: students.get(session.student_id || '')?.initials || '',
          grade_level: students.get(session.student_id || '')?.grade_level || '',
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

      {/* Enhanced AI Content Modal for multiple time slots */}
      <AIContentModalEnhanced
        isOpen={enhancedModalOpen}
        onClose={() => {
          setEnhancedModalOpen(false);
          setEnhancedModalLessons([]);
        }}
        lessons={enhancedModalLessons}
        isLoading={false}
        lessonDate={enhancedModalDate}
        isViewingSaved={true}
        hideControls={false}
      />
    </div>
  );
}