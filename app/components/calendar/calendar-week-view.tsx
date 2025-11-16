"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { createClient } from '@/lib/supabase/client';
import type { Database } from "@/src/types/database";
import type { LessonContent } from "@/lib/types/lesson";
import { AIContentModal } from "../ai-content-modal";
import { AIContentModalEnhanced } from "../ai-content-modal-enhanced";
import { SessionGenerator } from '@/lib/services/session-generator';
import { ManualLessonFormModal } from "../modals/manual-lesson-form-modal";
import { ManualLessonViewModal } from "../modals/manual-lesson-view-modal";
import { GroupDetailsModal } from "../modals/group-details-modal";
import { SessionDetailsModal } from "../modals/session-details-modal";
import { useToast } from "../../contexts/toast-context";
import { sessionUpdateService } from '@/lib/services/session-update-service';
import { cn } from '@/src/utils/cn';
import { toLocalDateKey, formatTimeSlot, calculateDurationFromTimeSlot } from '@/lib/utils/date-time';
import { parseGradeLevel } from '@/lib/utils/grade-parser';
import { useSchool } from '../providers/school-context';
import { fetchWithRetry } from '@/lib/utils/fetch-with-retry';
import { filterSessionsBySchool } from '@/lib/utils/session-filters';
import { isScheduledSession } from '@/lib/utils/session-helpers';
import { Printer } from "lucide-react";

type ScheduleSession = Database["public"]["Tables"]["schedule_sessions"]["Row"];
type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
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
  onExportPDF?: () => void;
}


export function CalendarWeekView({
  sessions,
  students,
  onSessionClick,
  weekOffset = 0,
  holidays = [], // Add holiday feature
  calendarEvents = [],
  onAddEvent,
  onEventClick,
  onExportPDF
  }: CalendarWeekViewProps) {
  // Get school context for filtering lessons
  const { currentSchool } = useSchool();
  const weekDates = useMemo(() => {
    const today = new Date();
    // Apply week offset
    today.setDate(today.getDate() + (weekOffset * 7));

    const currentDay = today.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay; // Adjust for Monday start
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);

    const weekDatesArray: Date[] = [];
    for (let i = 0; i < 5; i++) {
      // Monday to Friday only
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      weekDatesArray.push(date);
    }
    return weekDatesArray;
  }, [weekOffset]);

  // Check if a date is a holiday
  const isHoliday = useCallback((date: Date) => {
    const dateStr = toLocalDateKey(date);
    return holidays.some(h => h.date === dateStr);
  }, [holidays]);

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
  const loadingLessonsRef = React.useRef(false);
  const [viewingSavedLesson, setViewingSavedLesson] = useState(false);
  
  // Subject type selection popup state
  const [subjectTypePopupOpen, setSubjectTypePopupOpen] = useState(false);
  const [pendingLessonData, setPendingLessonData] = useState<{
    date: Date;
    daySessions: ScheduleSession[];
  } | null>(null);
  
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ScheduleSession | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [sessionsState, setSessionsState] = useState(sessions);
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionConflicts, setSessionConflicts] = useState<Record<string, boolean>>({});
  const [additionalStudents, setAdditionalStudents] = useState<Map<string, { initials: string; grade_level?: string }>>(new Map());
  
  // State for manual lesson creation
  const [selectedLessonDate, setSelectedLessonDate] = useState<Date | null>(null);
  const [showManualLessonForm, setShowManualLessonForm] = useState(false);
  const [manualLessons, setManualLessons] = useState<Map<string, Lesson[]>>(new Map());
  const [selectedManualLesson, setSelectedManualLesson] = useState<Lesson | null>(null);
  const [loadingManualLessons, setLoadingManualLessons] = useState(false);
  const [showManualLessonView, setShowManualLessonView] = useState(false);
  const [viewingManualLesson, setViewingManualLesson] = useState<Lesson | null>(null);
  
  // State for enhanced modal with multiple lessons
  const [enhancedModalOpen, setEnhancedModalOpen] = useState(false);
  const [enhancedModalLessons, setEnhancedModalLessons] = useState<any[]>([]);
  const [enhancedModalDate, setEnhancedModalDate] = useState<Date>(new Date());
  const [shouldShowModalAfterGeneration, setShouldShowModalAfterGeneration] = useState(false);

  // State for group details modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string>('');
  const [selectedGroupSessions, setSelectedGroupSessions] = useState<ScheduleSession[]>([]);

  // State for session details modal
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  // Note: selectedSession is already declared above for notes modal, reusing it here

  // State for assignment view mode
  type ViewMode = 'my-sessions' | 'all-sessions' | 'specialist' | 'sea' | 'assigned-to-me';
  const [viewMode, setViewMode] = useState<ViewMode>('my-sessions');

  const supabase = createClient<Database>();
  const { showToast } = useToast();

  // Auto-set view mode for SEA users
  useEffect(() => {
    if (userProfile?.role === 'sea' && viewMode !== 'sea') {
      setViewMode('sea');
    }
  }, [userProfile, viewMode, setViewMode]);

  // Helper function for time conversion
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Helper function to apply generated lessons to state
  const applyGeneratedLessonsToState = (
    prev: Map<string, any>,
    dateKey: string,
    lessons: Array<{ timeSlot: string; content: string; prompt: string; lessonId?: string; students?: Array<{ id: string; initials: string; grade_level: string; teacher_name: string }> }>
  ) => {
    const newMap = new Map(prev);
    const dayLessons = { ...(newMap.get(dateKey) || {}) };
    
    lessons.forEach(lesson => {
      dayLessons[lesson.timeSlot] = {
        content: lesson.content,
        prompt: lesson.prompt,
        lessonId: lesson.lessonId
      };
    });
    
    newMap.set(dateKey, dayLessons);
    return newMap;
  };

  // Effect to handle showing modal after generation
  useEffect(() => {
    if (shouldShowModalAfterGeneration && enhancedModalLessons.length > 0) {
      // Small delay to ensure state updates have propagated
      const timer = setTimeout(() => {
        setEnhancedModalOpen(true);
        setShouldShowModalAfterGeneration(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [enhancedModalLessons, shouldShowModalAfterGeneration]);

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
        .select('role, school_site, school_district, works_at_multiple_schools')
        .eq('id', user.id)
        .single();

      setUserProfile(profile);

      // If user works at multiple schools and no school is selected yet, wait
      if (profile?.works_at_multiple_schools && !currentSchool) {
        console.log('[CalendarWeekView] Waiting for school selection');
        setSessionsState([]);
        return;
      }

      // Get the Monday of the current week
      const weekStart = new Date();
      const currentDay = weekStart.getDay();
      const diff = currentDay === 0 ? -6 : 1 - currentDay;
      weekStart.setDate(weekStart.getDate() + diff + (weekOffset * 7));

      // Get the Sunday (end of week)
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const weekSessions = await sessionGenerator.getSessionsForDateRange(user.id, weekStart, weekEnd, profile?.role);

      // Filter by view mode
      let filteredSessions = weekSessions;

      if (viewMode === 'my-sessions') {
        // Show ONLY sessions I would actually fulfill
        // This includes:
        // 1. Sessions I own as provider that are NOT assigned to anyone else
        // 2. Sessions assigned TO me as a specialist (from another provider)
        // 3. Sessions assigned TO me as a SEA (from another provider)
        filteredSessions = weekSessions.filter(s =>
          // My own sessions that aren't assigned out
          (s.provider_id === user.id && !s.assigned_to_specialist_id && !s.assigned_to_sea_id) ||
          // Sessions assigned to me as specialist
          s.assigned_to_specialist_id === user.id ||
          // Sessions assigned to me as SEA
          s.assigned_to_sea_id === user.id
        );
      } else if (viewMode === 'all-sessions') {
        // Show ALL sessions I have visibility to
        // This includes:
        // 1. Sessions I own as provider (regardless of who delivers)
        // 2. Sessions assigned TO me as a specialist
        // 3. Sessions assigned TO me as a SEA
        filteredSessions = weekSessions.filter(s =>
          s.provider_id === user.id ||
          s.assigned_to_specialist_id === user.id ||
          s.assigned_to_sea_id === user.id
        );
      } else if (viewMode === 'specialist') {
        // Show ONLY MY students that I (as provider) delegated to other specialists
        filteredSessions = weekSessions.filter(s =>
          s.provider_id === user.id &&
          s.assigned_to_specialist_id !== null &&
          s.assigned_to_specialist_id !== user.id
        );
      } else if (viewMode === 'sea') {
        // Show ONLY MY students that I (as provider) delegated to other SEAs
        filteredSessions = weekSessions.filter(s =>
          s.provider_id === user.id &&
          s.assigned_to_sea_id !== null &&
          s.assigned_to_sea_id !== user.id
        );
      } else if (viewMode === 'assigned-to-me') {
        // Show ONLY sessions that were assigned TO me by another specialist
        filteredSessions = weekSessions.filter(s =>
          s.assigned_to_specialist_id === user.id &&
          s.provider_id !== user.id
        );
      }

      // Apply school filtering if current school is set
      filteredSessions = await filterSessionsBySchool(supabase, filteredSessions, currentSchool) as ScheduleSession[];

      setSessionsState(filteredSessions);
    };

    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, viewMode, currentSchool]);

  // Fetch student data for assigned sessions (students that aren't in the prop)
  React.useEffect(() => {
    const fetchMissingStudents = async () => {
      if (sessionsState.length === 0) return;

      // Find student IDs that are in sessions but not in the students Map
      // Filter out nulls and deduplicate
      const missingStudentIds = Array.from(
        new Set(
          sessionsState
            .map(s => s.student_id)
            .filter((id): id is string => !!id && !students.has(id))
        )
      );

      if (missingStudentIds.length === 0) return;

      // Fetch the missing students
      const { data: missingStudents, error: fetchError } = await supabase
        .from('students')
        .select('id, initials, grade_level')
        .in('id', missingStudentIds);

      if (fetchError) {
        console.error('[Calendar Week View] Error fetching student data for assigned sessions:', fetchError);
        return;
      }

      if (missingStudents && missingStudents.length > 0) {
        setAdditionalStudents(prev => {
          const newAdditionalStudents = new Map(prev);
          missingStudents.forEach(student => {
            newAdditionalStudents.set(student.id, {
              initials: student.initials,
              grade_level: student.grade_level || undefined
            });
          });
          return newAdditionalStudents;
        });
      }
    };

    fetchMissingStudents();
  }, [sessionsState, students, supabase]);

  // Merge students from prop with additionally fetched students
  const allStudents = useMemo(() => {
    const merged = new Map(students);
    additionalStudents.forEach((student, id) => {
      if (!merged.has(id)) {
        merged.set(id, student);
      }
    });
    return merged;
  }, [students, additionalStudents]);

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
        const startDate = toLocalDateKey(weekStart);
        const endDate = toLocalDateKey(weekEnd);

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
          
          setManualLessons(lessonsByDate);
        }
      } catch (error) {
        // Failed to load manual lessons
      } finally {
        setLoadingManualLessons(false);
      }
    };

    loadManualLessons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  // Legacy cleanup removed - now using lessons table

  // Load saved AI lessons
  React.useEffect(() => {
    // Skip if weekDates is not ready
    if (!weekDates || weekDates.length === 0) return;

    // Prevent rapid reloads
    let cancelled = false;
    
    const loadSavedLessons = async () => {
      if (cancelled) return;
      
      // Don't reload if already loading
      if (loadingLessonsRef.current) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      loadingLessonsRef.current = true;
      setLoadingSavedLessons(true);
      try {
        const weekStart = weekDates[0];
        const weekEnd = weekDates[weekDates.length - 1];

        const startDate = toLocalDateKey(weekStart);
        const endDate = toLocalDateKey(weekEnd);

        // Debug logging for school context
        console.log('[DEBUG] Loading AI lessons with school context:', {
          currentSchool,
          school_id: currentSchool?.school_id,
          startDate,
          endDate,
          user_id: user.id
        });

        // Filter by both provider and school
        let query = supabase
          .from('lessons')
          .select('id, lesson_date, time_slot, content, ai_prompt, student_details, school_id')
          .eq('provider_id', user.id)
          .eq('lesson_source', 'ai_generated')
          .gte('lesson_date', startDate)
          .lte('lesson_date', endDate);

        // Add school filter if available
        // For Mt Diablo Elementary, the school_id should be '062271002458'
        if (currentSchool?.school_id) {
          console.log('[DEBUG] Filtering by school_id:', currentSchool.school_id);
          query = query.eq('school_id', currentSchool.school_id);
        } else if (currentSchool?.school_site === 'Mt Diablo Elementary') {
          // Fallback for Mt Diablo Elementary if school_id is not set yet
          console.log('[DEBUG] Using fallback for Mt Diablo Elementary');
          query = query.eq('school_id', '062271002458');
        } else {
          // No school_id available - filter to NULL to avoid cross-school data leakage
          console.warn('[DEBUG] No school_id available; filtering to NULL school_id to avoid cross-school leakage');
          query = query.is('school_id', null);
        }
        
        const { data, error } = await query;

        if (error) {
          // Check if it's a "table doesn't exist" error
          if (error.code === '42P01') {
            // Don't log this repeatedly
            setSavedLessons(new Map());
          } else {
            console.error('Failed to load saved lessons:', {
              error,
              message: error?.message,
              code: error?.code,
              details: error?.details,
              hint: error?.hint
            });
          }
        } else {
          console.log('[DEBUG] Loaded lessons from database:', {
            count: data?.length || 0,
            lessons: data?.map(l => ({
              date: l.lesson_date,
              time: l.time_slot,
              school_id: l.school_id,
              id: l.id
            }))
          });

          const lessonsMap = new Map<string, any>();
          data?.forEach(lesson => {
            const dateKey = lesson.lesson_date;
            const timeSlot = lesson.time_slot || '08:00'; // Default for legacy data

            if (!lessonsMap.has(dateKey)) {
              lessonsMap.set(dateKey, {});
            }

            const dayLessons = lessonsMap.get(dateKey);
            // The content field is now JSONB, handle both old and new structures
            dayLessons[timeSlot] = {
              content: lesson.content ? JSON.stringify(lesson.content) : '',
              prompt: lesson.ai_prompt || '',
              lessonId: lesson.id,
              students: lesson.student_details || []
            };
          });

          console.log('[DEBUG] Processed lessons into state map:', {
            dates: Array.from(lessonsMap.keys()),
            totalDays: lessonsMap.size
          });

          setSavedLessons(lessonsMap);
        }
      } catch (error: any) {
        console.error('[DEBUG] Exception in loadSavedLessons:', {
          error,
          message: error?.message,
          stack: error?.stack,
          name: error?.name
        });
      } finally {
        setLoadingSavedLessons(false);
        loadingLessonsRef.current = false;
      }
    };

    // Add a small delay to prevent rapid reloads
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        loadSavedLessons();
      }
    }, 100);
    
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, weekDates, currentSchool?.school_id]);

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

  // Helper function to aggregate sessions into groups and individual blocks
  const aggregateSessionsForDisplay = (sessions: ScheduleSession[]) => {
    const groups = new Map<string, ScheduleSession[]>();
    const ungroupedSessions: ScheduleSession[] = [];

    sessions.forEach(session => {
      if (session.group_id) {
        if (!groups.has(session.group_id)) {
          groups.set(session.group_id, []);
        }
        groups.get(session.group_id)!.push(session);
      } else {
        ungroupedSessions.push(session);
      }
    });

    return { groups, ungroupedSessions };
  };

  // Helper function to determine session background color based on assignment
  const getSessionColor = (session: ScheduleSession): string => {
    if (!currentUser) return 'bg-white';

    // Priority order: Assigned to Me > Assigned to SEA > Assigned to Specialist > My Sessions

    // Assigned to Me - light blue
    if (session.assigned_to_specialist_id === currentUser.id && session.provider_id !== currentUser.id) {
      return 'bg-blue-50';
    }

    // Assigned to SEA - light green
    if (session.assigned_to_sea_id !== null) {
      return 'bg-green-50';
    }

    // Assigned to Specialist - light purple
    if (session.assigned_to_specialist_id !== null) {
      return 'bg-purple-50';
    }

    // My Sessions (provider, not assigned out) - white background
    return 'bg-white';
  };

  // Helper function to determine group session solid color based on sessions
  const getGroupColor = (sessions: ScheduleSession[]): string => {
    if (!currentUser || sessions.length === 0) return 'bg-gray-50';

    // Check if any session is assigned to me from another specialist
    const hasAssignedToMe = sessions.some(s =>
      s.assigned_to_specialist_id === currentUser.id && s.provider_id !== currentUser.id
    );
    if (hasAssignedToMe) {
      return 'bg-blue-100';
    }

    // Check if any session is assigned to SEA
    const hasAssignedToSEA = sessions.some(s => s.assigned_to_sea_id !== null);
    if (hasAssignedToSEA) {
      return 'bg-green-100';
    }

    // Check if any session is assigned to specialist
    const hasAssignedToSpecialist = sessions.some(s => s.assigned_to_specialist_id !== null);
    if (hasAssignedToSpecialist) {
      return 'bg-purple-100';
    }

    // Default: My Sessions (not assigned out)
    return 'bg-gray-50';
  };

  // Helper function to get individual session assignment indicator colors
  const getSessionIndicatorColor = (session: ScheduleSession): { bg: string; text: string } => {
    if (!currentUser) return { bg: 'bg-gray-200', text: 'text-gray-700' };

    // Assigned to Me (from another specialist) - Blue
    if (session.assigned_to_specialist_id === currentUser.id && session.provider_id !== currentUser.id) {
      return { bg: 'bg-blue-200', text: 'text-blue-900' };
    }

    // Assigned to SEA - Green
    if (session.assigned_to_sea_id !== null) {
      return { bg: 'bg-green-200', text: 'text-green-900' };
    }

    // Assigned to Specialist - Purple
    if (session.assigned_to_specialist_id !== null) {
      return { bg: 'bg-purple-200', text: 'text-purple-900' };
    }

    // Not assigned (provider's own session) - Gray
    return { bg: 'bg-gray-200', text: 'text-gray-700' };
  };

  // Handler for opening group details modal
  const handleOpenGroupModal = (groupId: string, groupName: string, sessions: ScheduleSession[]) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
    setSelectedGroupSessions(sessions);
    setGroupModalOpen(true);
  };

  // Handler for opening session details modal
  const handleOpenSessionModal = (session: ScheduleSession) => {
    // Close notes modal if it's open
    setNotesModalOpen(false);
    setSelectedSession(session);
    setSessionModalOpen(true);
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
    const generatedLessons: any[] = [];
    
    // Generate AI lessons for each time slot
    for (const [timeSlot, slotSessions] of timeSlotGroups) {
      const lessonData = await generateAIContentForTimeSlot(date, slotSessions, timeSlot);
      if (lessonData) {
        generatedLessons.push(lessonData);
      }
    }
    
    // Update the savedLessons state with all generated lessons
    if (generatedLessons.length > 0) {
      const dateStr = toLocalDateKey(date);
      setSavedLessons(prev => applyGeneratedLessonsToState(prev, dateStr, generatedLessons));
    }
    
    const total = timeSlotGroups.size;
    const succeeded = generatedLessons.length;
    const failed = total - succeeded;
    
    if (failed === 0) {
      showToast(`Successfully generated ${succeeded} AI lesson(s)`, 'success');
    } else if (succeeded === 0) {
      showToast('Failed to generate any lessons', 'error');
    } else {
      showToast(`Generated ${succeeded} lesson(s), ${failed} failed`, 'warning');
    }
  };

  // Generate AI content for a specific time slot
  const generateAIContentForTimeSlot = async (date: Date, slotSessions: ScheduleSession[], timeSlot: string) => {
    if (!currentUser) {
      return null;
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
      const student = allStudents.get(studentId);

      return {
        id: studentId,
        grade: parseGradeLevel(student?.grade_level)
      };
    });
    
    if (studentList.length === 0) {
      return null; // Skip empty time slots
    }
    
    // Remove verbose logging in production
    
    try {
      // Determine subject based on time of day or use default
      const subject = 'English Language Arts'; // Default subject, can be made configurable
      const duration = calculateDurationFromTimeSlot(timeSlot);
      
      // Use the new JSON lesson API with retry logic
      // Generate idempotency key to prevent duplicate lessons on retry
      const idempotencyKey = `cw:slot:${toLocalDateKey(date)}:${timeSlot}:${studentList.map(s => s.id).sort().join('-')}`;
      const response = await fetchWithRetry('/api/lessons/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({
          students: studentList,
          subject,
          subjectType: subject.toLowerCase().includes('math') ? 'math' : 'ela',
          duration,
          topic: `Session for ${formatTimeSlot(timeSlot)}`,
          teacherRole: userProfile?.role || 'resource',
          schoolId: currentSchool?.school_id || null,
          lessonDate: toLocalDateKey(date),
          timeSlot: timeSlot
        }),
        onRetry: (attempt, maxRetries) => {
          showToast(`Connection issues. Retrying (${attempt}/${maxRetries})...`, 'info');
        }
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

      // Lesson is already saved to ai_generated_lessons by the API with all metadata
      const lessonId = data.lessonId || null;
      
      // Store the JSON lesson reference
      const lessonContent = JSON.stringify(data.lesson);

      // Extract student info for this time slot
      const slotStudents = slotSessions.map(s => {
        const student = allStudents.get(s.student_id!);
        return {
          id: s.student_id || '',
          initials: student?.initials || 'Unknown',
          grade_level: student?.grade_level || '',
          teacher_name: '' // Required by type but not used
        };
      });

      // Return the generated lesson data for display
      return {
        timeSlot,
        content: lessonContent,
        prompt: '',
        lessonId,
        students: slotStudents
      };
    } catch (error) {
      console.error(`Error generating content for time slot ${timeSlot}:`, error);
      showToast(`Failed to generate AI content for ${formatTimeSlot(timeSlot)}`, 'error');
      
      // Return null to indicate failure
      return null;
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
    const generatedLessons: any[] = [];
    
    setGeneratingContent(true);
    try {
      for (const [timeSlot, slotSessions] of timeSlotGroups) {
        const lessonData = await generateAIContentForTimeSlot(date, slotSessions, timeSlot);
        if (lessonData) {
          generatedLessons.push(lessonData);
        }
      }
      
      // Update the savedLessons state with all generated lessons
      if (generatedLessons.length > 0) {
        const dateStr = toLocalDateKey(date);
        setSavedLessons(prev => applyGeneratedLessonsToState(prev, dateStr, generatedLessons));
      }
      
      const total = timeSlotGroups.size;
      const succeeded = generatedLessons.length;
      const failed = total - succeeded;
      
      if (failed === 0) {
        showToast(`Successfully generated ${succeeded} AI lesson(s)`, 'success');
      } else if (succeeded === 0) {
        showToast('Failed to generate any lessons', 'error');
      } else {
        showToast(`Generated ${succeeded} lesson(s), ${failed} failed`, 'warning');
      }
    } finally {
      setGeneratingContent(false);
    }
  };

  const generateAIContent = async (prompt: string) => {
    if (!selectedDate || !currentUser) return;

    setGeneratingContent(true);
    try {
      // Use structured API for custom prompt generation
      const studentList = selectedDaySessions
        .map(session => session.student_id)
        .filter((id): id is string => id !== null)
        .map(id => ({
          id,
          grade: parseGradeLevel(allStudents.get(id)?.grade_level)
        }));
      
      // Generate deterministic idempotency key for on-demand lessons
      // Use prompt and student IDs to make the key stable for identical requests
      const idempotencyKey = `od:${toLocalDateKey(selectedDate)}:${prompt}:${studentList.map(s => s.id).sort().join('-')}`;
      const response = await fetchWithRetry('/api/lessons/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({
          students: studentList,
          subject: 'Custom',
          subjectType: 'ela',
          topic: prompt,
          duration: 30,
          teacherRole: userProfile?.role || 'resource',
          schoolId: currentSchool?.school_id || null,
          lessonDate: toLocalDateKey(selectedDate),
          timeSlot: 'on-demand'
        }),
        onRetry: (attempt, maxRetries) => {
          showToast(`Connection issues. Retrying (${attempt}/${maxRetries})...`, 'info');
        }
      });

      if (!response.ok) throw new Error('Failed to generate content');

      const data = await response.json();
      // Convert structured lesson to HTML content
      const htmlContent = data.lesson ? JSON.stringify(data.lesson, null, 2) : data.content;
      setAiContent(htmlContent);

      // Lesson is already saved by the API
      // Update local saved lessons state with proper time slot structure
      // Use a stable identifier for on-demand lessons
      const syntheticTimeSlot = 'on-demand';
      setSavedLessons(prev => {
        const newMap = new Map(prev);
        const dateKey = toLocalDateKey(selectedDate);
        const dayLessons = newMap.get(dateKey) || {};

        // Add the lesson under the synthetic time slot
        dayLessons[syntheticTimeSlot] = {
          content: htmlContent,
          prompt: prompt,
          lessonId: data.lessonId || null,
          students: selectedDaySessions
            .map(session => session.student_id)
            .filter((id): id is string => id !== null)
            .map(id => ({
              id,
              initials: allStudents.get(id)?.initials || '',
              grade_level: allStudents.get(id)?.grade_level || '',
              teacher_name: ''
            }))
        };

        newMap.set(dateKey, dayLessons);
        return newMap;
      });

      showToast('AI lesson generated successfully', 'success');
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
        if (!s.day_of_week) return false;
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
        if (!s.day_of_week) return false;
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
      const lessonData = await generateAIContentForTimeSlot(date, slotSessions, timeSlot);
      if (lessonData) {
        // Update the savedLessons state
        const dateStr = toLocalDateKey(date);
        setSavedLessons(prev => applyGeneratedLessonsToState(prev, dateStr, [lessonData]));
        
        // Pretty-print JSON content for display
        try {
          const parsed = JSON.parse(lessonData.content);
          setAiContent(JSON.stringify(parsed, null, 2));
        } catch {
          setAiContent(lessonData.content);
        }
        showToast('AI lesson generated successfully', 'success');
      }
    } finally {
      setGeneratingContent(false);
    }
  };

  // New unified lesson creation handler
  const handleCreateDailyLesson = (date: Date, daySessions: ScheduleSession[]) => {
    setSelectedLessonDate(date);
    setSelectedDaySessions(daySessions);
    setShowManualLessonForm(true);
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
          if (!s.day_of_week) return false;
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
            initials: allStudents.get(session.student_id || '')?.initials || '',
            grade_level: allStudents.get(session.student_id || '')?.grade_level || '',
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
      // Delete all AI lessons for this date at the current school
      let deleteQuery = supabase
        .from('lessons')
        .delete()
        .eq('provider_id', currentUser!.id)
        .eq('lesson_source', 'ai_generated')
        .eq('lesson_date', dateStr);
      
      // Add school filter for deletion to avoid cross-school deletions
      if (currentSchool?.school_id) {
        deleteQuery = deleteQuery.eq('school_id', currentSchool.school_id);
      } else {
        // No school_id - only delete records with NULL school_id
        deleteQuery = deleteQuery.is('school_id', null);
      }
      
      const { error } = await deleteQuery;

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
      if (!session.day_of_week) return false;
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

  // Handler for Create Lesson button - goes directly to manual lesson form
  const handleCreateLesson = (date: Date) => {
    setSelectedLessonDate(date);
    setShowManualLessonForm(true);
  };


  // Function to handle AI lesson generation with subject type
  const generateAILessons = async (date: Date, daySessions: ScheduleSession[], subjectType: 'ela' | 'math') => {
    // Group sessions by time slot for AI generation
    const timeSlotGroups = groupSessionsByTimeSlot(daySessions);

    // Generate AI lessons for each time slot using batch API
    setGeneratingContent(true);
    setModalOpen(true);
    
    // Show progress notification
    showToast(`Generating ${timeSlotGroups.size} lesson${timeSlotGroups.size > 1 ? 's' : ''}...`, 'info');
    
    // Declare variables outside try block
    let generatedLessons: any[] = [];
    let batchResponseData: any = null;
    
    try {
      // Prepare batch request
      const batchRequests: any[] = [];
      const timeSlotMapping = new Map<number, { timeSlot: string; slotSessions: ScheduleSession[] }>();
      let index = 0;
      
      // Debug logging: List all time slots found
      console.log(`[DEBUG Frontend] Found ${timeSlotGroups.size} time slot groups:`, 
        Array.from(timeSlotGroups.keys())
      );
      
      for (const [timeSlot, slotSessions] of timeSlotGroups.entries()) {
        console.log(`[DEBUG Frontend] Processing time slot: "${timeSlot}" with ${slotSessions.length} sessions`);
        
        // Extract unique students from the sessions
        const sessionStudents = new Set<string>();
        slotSessions.forEach(session => {
          if (session.student_id) {
            sessionStudents.add(session.student_id);
          }
        });
        
        // Get student details for the new API format
        const studentList = Array.from(sessionStudents).map(studentId => {
          const student = allStudents.get(studentId);
          return {
            id: studentId,
            grade: parseGradeLevel(student?.grade_level)
          };
        });
        
        if (studentList.length > 0) {
          const subject = subjectType === 'ela' ? 'English Language Arts' : 'Math';
          const duration = calculateDurationFromTimeSlot(timeSlot);
          const lessonDate = toLocalDateKey(date);
          
          const batchRequest = {
            students: studentList,
            subject,
            subjectType,
            duration,
            topic: `Session for ${formatTimeSlot(timeSlot)}`,
            teacherRole: userProfile?.role || 'resource',
            lessonDate: lessonDate,
            timeSlot: timeSlot, // Pass the actual time slot
            schoolId: currentSchool?.school_id || null
          };
          
          // Debug logging for each batch request
          console.log(`[DEBUG Frontend] Adding batch request ${index}:`, {
            timeSlot: timeSlot,
            lessonDate: lessonDate,
            studentCount: studentList.length,
            duration: duration,
            subject: subject,
            subjectType: subjectType
          });
          
          batchRequests.push(batchRequest);
          
          // Store mapping for later use
          timeSlotMapping.set(index, { timeSlot, slotSessions });
          index++;
        } else {
          console.log(`[DEBUG Frontend] Skipping time slot "${timeSlot}" - no students found`);
        }
      }
      
      console.log(`[DEBUG Frontend] Final batch requests summary:`, {
        totalRequests: batchRequests.length,
        timeSlots: batchRequests.map((req, i) => `${i}: ${req.timeSlot}`),
        lessonDate: toLocalDateKey(date),
        subjectType
      });
      
      if (batchRequests.length === 0) {
        showToast('No valid time slots to generate lessons for', 'warning');
        setGeneratingContent(false);
        setModalOpen(false);
        return;
      }
      
      // Make batch API call with timeout
      console.log(`Sending batch request for ${batchRequests.length} lesson groups`);
      
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
      
      try {
        // Generate idempotency key for batch request
        const batchIdKey = `cw:batch:${toLocalDateKey(date)}:${batchRequests.length}:${batchRequests.map(b => b.timeSlot).join(',')}`;
        const response = await fetchWithRetry('/api/lessons/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': batchIdKey
          },
          body: JSON.stringify({
            batch: batchRequests
          }),
          signal: controller.signal,
          onRetry: (attempt, maxRetries) => {
            showToast(`Connection issues. Retrying (${attempt}/${maxRetries})...`, 'info');
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to generate lessons');
        }
        
        const data = await response.json();
        batchResponseData = data;
        
        // Process the results
        generatedLessons = [];
        
        if (data.batch && data.lessons) {
          data.lessons.forEach((result: any, idx: number) => {
            if (result.success && result.lesson) {
              const mapping = timeSlotMapping.get(idx);
              if (mapping) {
                const lessonData = {
                  timeSlot: mapping.timeSlot,
                  content: JSON.stringify(result.lesson),
                  prompt: result.group?.topic || '',
                  lessonId: result.lessonId,
                  students: mapping.slotSessions.map(session => ({
                    id: session.student_id || '',
                    initials: allStudents.get(session.student_id || '')?.initials || '',
                    grade_level: allStudents.get(session.student_id || '')?.grade_level || '',
                    teacher_name: ''
                  }))
                };
                generatedLessons.push(lessonData);
              }
            }
          });
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timeout: Lesson generation took too long. Please try with fewer students.');
        }
        throw fetchError;
      }
      
      // Close the generating modal
      setGeneratingContent(false);
      setModalOpen(false);

      if (generatedLessons.length > 0) {
        // Lessons are already saved to lessons table by the API
        const dateStr = toLocalDateKey(date);

        // Force immediate state updates using flushSync
        flushSync(() => {
          // Update the savedLessons state with all generated lessons
          setSavedLessons(prev => applyGeneratedLessonsToState(prev, dateStr, generatedLessons));

          // Set the lessons and date for the modal
          setEnhancedModalLessons(generatedLessons);
          setEnhancedModalDate(date);
        });

        // Log for debugging
        console.log('Lessons saved to state:', dateStr, generatedLessons.length, 'lessons');

        // Force refresh from database to ensure consistency
        setTimeout(async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const weekStart = weekDates[0];
          const weekEnd = weekDates[weekDates.length - 1];
          const startDate = toLocalDateKey(weekStart);
          const endDate = toLocalDateKey(weekEnd);

          let query = supabase
            .from('lessons')
            .select('id, lesson_date, time_slot, content, ai_prompt, student_details')
            .eq('provider_id', user.id)
            .eq('lesson_source', 'ai_generated')
            .gte('lesson_date', startDate)
            .lte('lesson_date', endDate);

          if (currentSchool?.school_id) {
            query = query.eq('school_id', currentSchool.school_id);
          } else if (currentSchool?.school_site === 'Mt Diablo Elementary') {
            // Fallback for Mt Diablo Elementary if school_id is not set yet
            query = query.eq('school_id', '062271002458');
          } else {
            query = query.is('school_id', null);
          }

          const { data, error } = await query;

          if (!error && data) {
            const lessonsMap = new Map<string, any>();
            data.forEach(lesson => {
              const dateKey = lesson.lesson_date;
              const timeSlot = lesson.time_slot || '08:00';

              if (!lessonsMap.has(dateKey)) {
                lessonsMap.set(dateKey, {});
              }

              const dayLessons = lessonsMap.get(dateKey);
              // The content field is now JSONB, handle both old and new structures
              dayLessons[timeSlot] = {
                content: lesson.content ? JSON.stringify(lesson.content) : '',
                prompt: lesson.ai_prompt || '',
                lessonId: lesson.id,
                students: lesson.student_details || []
              };
            });
            setSavedLessons(lessonsMap);
          }
        }, 500);
        
        // Trigger the modal to open via the useEffect after state is updated
        setShouldShowModalAfterGeneration(true);
        
        const total = batchRequests.length;
        const failed = total - generatedLessons.length;
        
        if (failed === 0) {
          const timeMs = batchResponseData?.summary?.timeMs;
          showToast(
            `Successfully generated ${generatedLessons.length} AI lesson(s)` + 
            (typeof timeMs === 'number' ? ` in ${timeMs}ms` : '') +
            '. Click the purple "Saved AI Lesson" button to view.',
            'success'
          );
        } else {
          showToast(
            `Generated ${generatedLessons.length} lesson(s), ${failed} failed. ` +
            'Click the purple "Saved AI Lesson" button to view.',
            'warning'
          );
        }
      } else {
        showToast('Failed to generate any lessons', 'error');
      }
    } catch (error) {
      console.error('Error generating AI lessons:', error);
      showToast(error instanceof Error ? error.message : 'An unexpected error occurred', 'error');
      setGeneratingContent(false);
      setModalOpen(false);
    }
  };

  // Handle subject type selection from popup
  const handleSubjectTypeSelect = (subjectType: 'ela' | 'math') => {
    setSubjectTypePopupOpen(false);
    
    if (pendingLessonData) {
      generateAILessons(pendingLessonData.date, pendingLessonData.daySessions, subjectType);
      setPendingLessonData(null);
    }
  };

  // Helper function to safely parse activities field
  const parseActivities = (activities?: string): any[] => {
    if (!activities) return [];
    if (typeof activities !== 'string') return activities;

    // Trim whitespace
    const trimmed = activities.trim();

    // Check if it looks like JSON (starts with '[' or '{')
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (error) {
        console.warn('Failed to parse activities as JSON, using as plain text:', error);
        // Fall back to treating it as plain text
        return [{ description: trimmed }];
      }
    }

    // Plain text - wrap in object
    return [{ description: trimmed }];
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

      // Structure content as JSON object for lessons table
      const content = {
        objectives: lessonData.learningObjectives || '',
        materials: lessonData.materialsNeeded || '',
        activities: parseActivities(lessonData.activities),
        assessment: lessonData.assessmentMethods || ''
      };

      const { data, error } = await supabase
        .from('lessons')
        .insert({
          provider_id: currentUser.id,
          lesson_date: lessonDate,
          lesson_source: 'manual',
          title: lessonData.title,
          subject: lessonData.subject,
          grade_levels: lessonData.gradeLevels ? lessonData.gradeLevels.split(',').map(g => g.trim()) : null,
          duration_minutes: lessonData.duration,
          content: content,
          notes: lessonData.notes,
          school_id: currentSchool?.school_id || null,
          district_id: currentSchool?.district_id || null,
          state_id: currentSchool?.state_id || null,
          lesson_status: 'draft'
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

  const handleEditManualLesson = (lesson: Lesson) => {
    setSelectedManualLesson(lesson);
    setShowManualLessonForm(true);
  };

  const handleDeleteManualLesson = async (lessonId: string) => {
    if (!window.confirm('Are you sure you want to delete this lesson?')) return;

    try {
      const { error } = await supabase
        .from('lessons')
        .delete()
        .eq('id', lessonId)
        .eq('lesson_source', 'manual');

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
      // Structure content as JSON object for lessons table
      const content = {
        objectives: lessonData.learningObjectives || '',
        materials: lessonData.materialsNeeded || '',
        activities: parseActivities(lessonData.activities),
        assessment: lessonData.assessmentMethods || ''
      };

      const { data, error } = await supabase
        .from('lessons')
        .update({
          title: lessonData.title,
          subject: lessonData.subject,
          grade_levels: lessonData.gradeLevels ? lessonData.gradeLevels.split(',').map(g => g.trim()) : null,
          duration_minutes: lessonData.duration,
          content: content,
          notes: lessonData.notes,
          school_id: currentSchool?.school_id || null,
          district_id: currentSchool?.district_id || null,
          state_id: currentSchool?.state_id || null
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
      {/* View Mode Toggle - Hidden for SEA users */}
      {userProfile?.role !== 'sea' && (
        <div className="mb-4 flex gap-2 items-center justify-between">
          <div className="flex gap-2 items-center">
            <span className="text-sm font-medium text-gray-700 mr-2">View:</span>
            <button
              onClick={() => setViewMode('all-sessions')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                viewMode === 'all-sessions'
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              All Sessions
            </button>
            <button
              onClick={() => setViewMode('my-sessions')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                viewMode === 'my-sessions'
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              My Sessions
            </button>
            <button
              onClick={() => setViewMode('specialist')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                viewMode === 'specialist'
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              Assigned to Specialist
            </button>
            <button
              onClick={() => setViewMode('sea')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                viewMode === 'sea'
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              Assigned to SEA
            </button>
            <button
              onClick={() => setViewMode('assigned-to-me')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                viewMode === 'assigned-to-me'
                  ? "bg-sky-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              Assigned to Me
            </button>
          </div>
          {onExportPDF && (
            <button
              onClick={onExportPDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              title="Export Week to PDF"
            >
              <Printer className="w-4 h-4" />
              <span className="text-sm font-medium">Export PDF</span>
            </button>
          )}
        </div>
      )}
      {/* For SEA users, show the export button on its own row */}
      {userProfile?.role === 'sea' && onExportPDF && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={onExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            title="Export Week to PDF"
          >
            <Printer className="w-4 h-4" />
            <span className="text-sm font-medium">Export PDF</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-5 gap-3 mb-4">
        {daysInWeek.map(({ date, sessions: daySessions, dayOfWeek, isHoliday: isHolidayDay, holidayName }) => {
          const dateStr = toLocalDateKey(date);
          const dayAILessons = savedLessons.get(dateStr) || {};
          const hasAIContent = Object.keys(dayAILessons).length > 0;
          const dayManualLessons = manualLessons.get(dateStr) || [];
          const isPast = isDateInPast(date);

          // Sort sessions by start time for chronological order
          const sortedDaySessions = [...daySessions]
            .filter(s => isScheduledSession(s))
            .sort((a, b) => a.start_time!.localeCompare(b.start_time!));

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

                {/* Sessions and Groups */}
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
                    (() => {
                      const { groups, ungroupedSessions } = aggregateSessionsForDisplay(sortedDaySessions);
                      const allBlocks: Array<{ type: 'group' | 'session', data: any }> = [];

                      // Add groups
                      groups.forEach((groupSessions, groupId) => {
                        // Filter out unscheduled sessions
                        const scheduledSessions = groupSessions.filter(s => isScheduledSession(s));
                        const firstSession = scheduledSessions[0];
                        if (firstSession && firstSession.start_time && firstSession.end_time) {
                          allBlocks.push({
                            type: 'group',
                            data: {
                              groupId,
                              groupName: firstSession.group_name || 'Unnamed Group',
                              sessions: scheduledSessions,
                              earliestStart: scheduledSessions.reduce((min, s) =>
                                s.start_time! < min ? s.start_time! : min, firstSession.start_time),
                              latestEnd: scheduledSessions.reduce((max, s) =>
                                s.end_time! > max ? s.end_time! : max, firstSession.end_time)
                            }
                          });
                        }
                      });

                      // Add ungrouped sessions
                      ungroupedSessions.forEach(session => {
                        allBlocks.push({ type: 'session', data: session });
                      });

                      // Sort all blocks by start time
                      allBlocks.sort((a, b) => {
                        const aTime = a.type === 'group' ? a.data.earliestStart : a.data.start_time;
                        const bTime = b.type === 'group' ? b.data.earliestStart : b.data.start_time;
                        return aTime.localeCompare(bTime);
                      });

                      return allBlocks.map((block, idx) => {
                        if (block.type === 'group') {
                          const { groupId, groupName, sessions: groupSessions, earliestStart, latestEnd } = block.data;

                          // Get unique students with their session assignment info
                          const uniqueStudentSessions = groupSessions.reduce((acc, session) => {
                            const studentId = session.student_id;
                            if (!acc.some(s => s.student_id === studentId)) {
                              acc.push(session);
                            }
                            return acc;
                          }, [] as ScheduleSession[]);

                          return (
                            <div key={`group-${groupId}`} className="mb-2">
                              <button
                                type="button"
                                onClick={() => handleOpenGroupModal(groupId, groupName, groupSessions)}
                                className={cn(
                                  "w-full text-left border-2 border-blue-300 rounded-lg p-3 text-xs hover:border-blue-400 transition-colors",
                                  getGroupColor(groupSessions)
                                )}
                                aria-label={`Open group ${groupName} details`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <div className="font-semibold text-blue-900">📚 {groupName}</div>
                                  <div className="text-xs text-blue-700">{groupSessions.length} sessions</div>
                                </div>
                                <div className="font-medium text-gray-900">
                                  {formatTime(earliestStart)} - {formatTime(latestEnd)}
                                </div>
                                <div className="mt-1 flex items-center gap-1 flex-wrap">
                                  <span className="text-gray-700 text-xs">Students:</span>
                                  {uniqueStudentSessions.map((session, sidx) => {
                                    const student = allStudents.get(session.student_id);
                                    const colors = getSessionIndicatorColor(session);
                                    return (
                                      <span
                                        key={`${groupId}-student-${sidx}`}
                                        className={cn(
                                          "inline-flex items-center justify-center rounded-full w-6 h-6 text-xs font-medium",
                                          colors.bg,
                                          colors.text
                                        )}
                                        title={`Student: ${student?.initials || '?'}`}
                                      >
                                        {student?.initials || '?'}
                                      </span>
                                    );
                                  })}
                                </div>
                              </button>
                            </div>
                          );
                        } else {
                          const session = block.data;
                          const student = allStudents.get(session.student_id);
                          return (
                            <div key={session.id} className="mb-2">
                              <button
                                type="button"
                                onClick={() => handleOpenSessionModal(session)}
                                className={cn(
                                  "w-full text-left border-2 border-blue-300 rounded-lg p-2 text-xs hover:border-blue-400 transition-colors",
                                  getSessionColor(session)
                                )}
                                aria-label={`Open session for ${student?.initials || 'student'} at ${formatTime(session.start_time)}`}
                              >
                                <div className="font-medium text-gray-900">
                                  {formatTime(session.start_time)}
                                </div>
                                <div className="text-gray-700">
                                  {student?.initials || '?'}
                                </div>
                              </button>
                            </div>
                          );
                        }
                      });
                    })()
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

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
          initials: allStudents.get(session.student_id || '')?.initials || '',
          grade_level: allStudents.get(session.student_id || '')?.grade_level || '',
          teacher_name: ''
        }))}
        content={aiContent}
        isLoading={generatingContent}
        isViewingSaved={viewingSavedLesson}
      />


      {/* Subject Type Selection Popup */}
      {subjectTypePopupOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Choose Subject Type</h3>
            <p className="text-gray-600 mb-6">What type of lesson would you like to generate?</p>
            <div className="flex gap-4">
              <button
                onClick={() => handleSubjectTypeSelect('ela')}
                className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                📚 ELA
                <div className="text-xs opacity-90 mt-1">Reading, Writing, Grammar</div>
              </button>
              <button
                onClick={() => handleSubjectTypeSelect('math')}
                className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                🔢 Math
                <div className="text-xs opacity-90 mt-1">Numbers, Problem Solving</div>
              </button>
            </div>
            <button
              onClick={() => {
                setSubjectTypePopupOpen(false);
                setPendingLessonData(null);
              }}
              className="w-full mt-4 text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
          title: selectedManualLesson.title || '',
          subject: selectedManualLesson.subject || '',
          gradeLevels: selectedManualLesson.grade_levels?.join(', ') || '',
          duration: selectedManualLesson.duration_minutes || undefined,
          learningObjectives: (selectedManualLesson.content as LessonContent)?.objectives || '',
          materialsNeeded: (selectedManualLesson.content as LessonContent)?.materials || '',
          activities: (selectedManualLesson.content as LessonContent)?.activities ? JSON.stringify((selectedManualLesson.content as LessonContent).activities) : '',
          assessmentMethods: (selectedManualLesson.content as LessonContent)?.assessment || '',
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
          onEdit={(lesson: Lesson) => {
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

      {/* Group Details Modal */}
      {selectedGroupId && (
        <GroupDetailsModal
          isOpen={groupModalOpen}
          onClose={() => {
            setGroupModalOpen(false);
            setSelectedGroupId(null);
            setSelectedGroupName('');
            setSelectedGroupSessions([]);
          }}
          groupId={selectedGroupId}
          groupName={selectedGroupName}
          sessions={selectedGroupSessions}
          students={allStudents}
        />
      )}

      {/* Session Details Modal */}
      {selectedSession && sessionModalOpen && (
        <SessionDetailsModal
          isOpen={sessionModalOpen}
          onClose={() => {
            setSessionModalOpen(false);
            // Don't clear selectedSession here in case notes modal needs it
          }}
          session={selectedSession}
          student={selectedSession.student_id ? allStudents.get(selectedSession.student_id) : undefined}
        />
      )}
    </div>
  );
}