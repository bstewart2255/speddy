"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from '@/lib/supabase/client';
import type { Database } from "@/src/types";
import { SessionGenerator } from '@/lib/services/session-generator';
import { SessionDetailsModal } from "../modals/session-details-modal";
import { useToast } from "../../contexts/toast-context";
import { sessionUpdateService } from '@/lib/services/session-update-service';
import { cn } from '@/src/utils/cn';
import { toLocalDateKey } from '@/lib/utils/date-time';
import { useSchool } from '../providers/school-context';
import { isScheduledSession } from '@/lib/utils/session-helpers';
import { Printer, FileText, Paperclip } from "lucide-react";
import { LongHoverTooltip } from '../ui/long-hover-tooltip';
import { exportWeekToPDF } from '@/lib/utils/export-week-to-pdf';
import { SessionWithCurriculum } from '@/lib/services/session-generator';
import { formatCurriculumBadge, getFirstCurriculum } from '@/lib/utils/curriculum-helpers';
import { groupColorHex } from '@/lib/groups/colors';

type ScheduleSession = Database["public"]["Tables"]["schedule_sessions"]["Row"];
type CalendarEvent = Database["public"]["Tables"]["calendar_events"]["Row"];

/**
 * Durable grouping key for a session: prefer the Groups v2 `group_ref` (the
 * session_groups record id), falling back to the legacy `group_id` during the
 * dual-write bake. For backfilled data the two are identical; keying on
 * `group_ref` is what lets the Week view survive the Phase 5 legacy-column drop.
 * A split slot yields multiple distinct keys, so it renders one card per group.
 */
function groupKeyOf(session: Pick<ScheduleSession, "group_ref" | "group_id">): string | null {
  return session.group_ref ?? session.group_id ?? null;
}

interface CalendarWeekViewProps {
  sessions: SessionWithCurriculum[];
  students: Map<string, {
    initials: string;
    grade_level?: string;
  }>;
  onSessionClick?: (session: SessionWithCurriculum) => void;
  weekOffset?: number;
  holidays?: Array<{ date: string; name?: string }>;
  calendarEvents?: CalendarEvent[];
  onAddEvent?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  /** Callback when session data is updated (to refresh parent data) */
  onUpdate?: () => void;
}


export function CalendarWeekView({
  sessions,
  students,
  onSessionClick,
  weekOffset = 0,
  holidays = [],
  calendarEvents = [],
  onAddEvent,
  onEventClick,
  onUpdate,
}: CalendarWeekViewProps) {
  // Get school context for filtering lessons
  const { currentSchool, worksAtMultipleSchools } = useSchool();
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

  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionWithCurriculum | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  // Starts empty (like the day view): seeding from the `sessions` prop would
  // paint it before the load effect applies school/view-mode filtering (SPE-270)
  const [sessionsState, setSessionsState] = useState<SessionWithCurriculum[]>([]);
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionConflicts, setSessionConflicts] = useState<Record<string, boolean>>({});
  // Track previous session states to only validate changed sessions (prevents excessive API calls)
  const prevSessionsRef = useRef<Map<string, string>>(new Map());
  // Monotonic id per loadSessions run + last loaded school: a school switch
  // mid-flight must not let an older load overwrite the newer school's grid,
  // and the old school's grid should clear as soon as the school changes (SPE-270)
  const loadSeqRef = useRef(0);
  const loadedSchoolKeyRef = useRef<string | null | undefined>(undefined);
  const [additionalStudents, setAdditionalStudents] = useState<Map<string, { initials: string; grade_level?: string }>>(new Map());
  
  // State for group details modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string>('');
  const [selectedGroupSessions, setSelectedGroupSessions] = useState<SessionWithCurriculum[]>([]);

  // State for assignment view mode (moved here so it's available in sync useEffect)
  type ViewMode = 'my-sessions' | 'all-sessions' | 'specialist' | 'sea' | 'assigned-to-me';
  const [viewMode, setViewMode] = useState<ViewMode>('my-sessions');

  // The internal loadSessions effect below is the single source of truth for
  // sessionsState. It pulls fresh data from SessionGenerator on every relevant
  // change. We previously had a second effect that synced from the `sessions`
  // prop in parallel, which raced with the internal fetch and could revert to
  // stale parent data right after a local mutation. Now we only listen to the
  // prop as a signal that the parent refetched, and re-run the internal fetch
  // (see the deps array on the loadSessions useEffect below).

  // Keep selectedGroupSessions in sync when sessions refresh
  useEffect(() => {
    if (selectedGroupId && groupModalOpen && weekDates.length > 0) {
      // Get current week's date range
      const weekStartStr = toLocalDateKey(weekDates[0]);
      const weekEndStr = toLocalDateKey(weekDates[weekDates.length - 1]);

      // Filter by BOTH group_id AND current week's date range
      const updatedGroupSessions = sessionsState.filter(s =>
        groupKeyOf(s) === selectedGroupId &&
        s.session_date &&
        s.session_date >= weekStartStr &&
        s.session_date <= weekEndStr
      );
      // Deduplicate by session ID to prevent accumulation bugs
      const uniqueSessions = Array.from(
        new Map(updatedGroupSessions.map(s => [s.id, s])).values()
      );
      // Always update state to clear stale data when no sessions match
      setSelectedGroupSessions(uniqueSessions);
    }
  }, [sessionsState, selectedGroupId, groupModalOpen, weekDates]);

  // State for session details modal
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  // Note: selectedSession is already declared above for notes modal, reusing it here

  const supabase = createClient<Database>();
  const { showToast } = useToast();

  // Session indicators state (has notes, has documents)
  interface IndicatorResult {
    hasNotes: boolean;
    hasDocuments: boolean;
  }
  const [sessionIndicators, setSessionIndicators] = useState<Record<string, IndicatorResult>>({});
  const [groupIndicators, setGroupIndicators] = useState<Record<string, IndicatorResult>>({});

  // Fetch session/group indicators when sessions change
  useEffect(() => {
    const fetchIndicators = async () => {
      if (!currentUser || sessionsState.length === 0 || weekDates.length === 0) return;

      // Collect sessions with time slots, dates, and group IDs
      const sessions: { id: string; timeSlot: string; sessionDate: string }[] = [];
      const groupIds = new Set<string>();

      for (const session of sessionsState) {
        const groupKey = groupKeyOf(session);
        if (groupKey) {
          groupIds.add(groupKey);
        } else if (session.start_time && session.end_time && session.session_date) {
          sessions.push({
            id: session.id,
            timeSlot: `${session.start_time}-${session.end_time}`,
            sessionDate: session.session_date
          });
        }
      }

      // Get all week dates for filtering
      const weekDateStrings = weekDates.map(d => toLocalDateKey(d));

      try {
        const response = await fetch('/api/sessions/indicators', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessions,
            groupIds: Array.from(groupIds),
            weekDates: weekDateStrings
          })
        });

        if (response.ok) {
          const data = await response.json();
          setSessionIndicators(data.sessionIndicators || {});
          setGroupIndicators(data.groupIndicators || {});
        }
      } catch (error) {
        console.error('Error fetching session indicators:', error);
      }
    };

    fetchIndicators();
  }, [sessionsState, weekDates, currentUser]);

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

  // Replace the useEffect that loads sessions
  React.useEffect(() => {
    const seq = ++loadSeqRef.current;
    const schoolKey = currentSchool
      ? currentSchool.school_id ?? `${currentSchool.school_site}|${currentSchool.school_district}`
      : null;
    if (loadedSchoolKeyRef.current !== undefined && loadedSchoolKeyRef.current !== schoolKey) {
      setSessionsState([]);
    }
    loadedSchoolKeyRef.current = schoolKey;

    const sessionGenerator = new SessionGenerator(createClient());
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

      // School-scoped by the method (SPE-271) rather than by a filter call this
      // component has to remember further down.
      const weekSessions = await sessionGenerator.getSchoolScopedSessionsForDateRange(
        user.id,
        weekStart,
        weekEnd,
        profile?.role,
        currentSchool
      );

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

      // (School filtering already happened in the fetch above — SPE-271.)

      // A newer load (e.g. school switch) owns the state now — drop this one
      if (seq !== loadSeqRef.current) return;

      setSessionsState(filteredSessions);
    };

    loadSessions();
    // `sessions` is included so a parent refetch (e.g. after a Day-tab group
    // change calls Plan page's fetchData) causes the week view to pull fresh
    // data from the DB. The prop itself is not consumed, only used as a
    // refresh signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, viewMode, currentSchool, sessions]);

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

  // Check for conflicts after sessions are loaded - OPTIMIZED to only validate changed sessions
  const checkSessionConflicts = useCallback(async () => {
    // Create fingerprint for each session based on schedule-related fields
    const getSessionFingerprint = (s: SessionWithCurriculum) =>
      `${s.day_of_week}|${s.start_time}|${s.end_time}|${s.student_id}`;

    // Build current fingerprints map
    const currentFingerprints = new Map<string, string>();
    sessionsState.forEach(s => {
      currentFingerprints.set(s.id, getSessionFingerprint(s));
    });

    // Find sessions that changed (new, modified, or removed)
    const changedSessionIds = new Set<string>();

    // Check for new or modified sessions
    currentFingerprints.forEach((fingerprint, id) => {
      const prevFingerprint = prevSessionsRef.current.get(id);
      if (prevFingerprint !== fingerprint) {
        changedSessionIds.add(id);
      }
    });

    // Check for removed sessions
    prevSessionsRef.current.forEach((_, id) => {
      if (!currentFingerprints.has(id)) {
        changedSessionIds.add(id);
      }
    });

    // Update the ref for next comparison
    prevSessionsRef.current = currentFingerprints;

    // If nothing changed, skip validation
    if (changedSessionIds.size === 0) {
      return;
    }

    // Find sessions that might have interdependent conflicts with changed sessions
    // (same student + same day, since most conflicts are student-specific per day)
    const changedSessions = sessionsState.filter(s => changedSessionIds.has(s.id));
    const impactedKeys = new Set<string>();
    changedSessions.forEach(s => {
      if (s.student_id && s.day_of_week) {
        impactedKeys.add(`${s.student_id}|${s.day_of_week}`);
      }
    });

    // Expand validation to include potentially affected sessions (same student + day)
    const sessionsToValidate = sessionsState.filter(s => {
      if (changedSessionIds.has(s.id)) return true;
      if (s.student_id && s.day_of_week && impactedKeys.has(`${s.student_id}|${s.day_of_week}`)) return true;
      return false;
    });

    // Start fresh for all sessions being validated
    const conflicts: Record<string, boolean> = {};

    // Preserve conflicts for sessions NOT being validated
    sessionsState.forEach(s => {
      if (!sessionsToValidate.some(v => v.id === s.id)) {
        // Keep existing conflict state (read from ref to avoid dependency cycle)
        conflicts[s.id] = false; // Default to no conflict if not tracked
      }
    });

    // Process validations sequentially to avoid browser throttling
    for (const session of sessionsToValidate) {
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
  }, [sessionsState]); // Removed sessionConflicts to avoid dependency cycle

  // Check conflicts when sessions change
  useEffect(() => {
    const timer = setTimeout(() => {
      checkSessionConflicts();
    }, 500); // Small delay to batch updates

    return () => clearTimeout(timer);
  }, [sessionsState, checkSessionConflicts]);

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
  const groupSessionsByTimeSlot = (sessions: SessionWithCurriculum[]): Map<string, SessionWithCurriculum[]> => {
    const timeSlotGroups = new Map<string, SessionWithCurriculum[]>();

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
  const aggregateSessionsForDisplay = (sessions: SessionWithCurriculum[]) => {
    const groups = new Map<string, SessionWithCurriculum[]>();
    const ungroupedSessions: SessionWithCurriculum[] = [];

    sessions.forEach(session => {
      const key = groupKeyOf(session);
      if (key) {
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(session);
      } else {
        ungroupedSessions.push(session);
      }
    });

    return { groups, ungroupedSessions };
  };

  // Helper function to determine session background color based on assignment
  const getSessionColor = (session: SessionWithCurriculum): string => {
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
  const getGroupColor = (sessions: SessionWithCurriculum[]): string => {
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
  const getSessionIndicatorColor = (session: SessionWithCurriculum): { bg: string; text: string } => {
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
  const handleOpenGroupModal = (groupId: string, groupName: string, sessions: SessionWithCurriculum[]) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
    setSelectedGroupSessions(sessions);
    setGroupModalOpen(true);
  };

  // Handler for opening session details modal
  const handleOpenSessionModal = (session: SessionWithCurriculum) => {
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

  // Handle printing the week schedule
  const handlePrintWeek = () => {
    // Convert allStudents Map (merged prop + additional) to array for the export function
    // Using allStudents ensures we have initials for students fetched after initial load
    const studentsArray = Array.from(allStudents.entries()).map(([id, student]) => ({
      id,
      initials: student.initials,
    }));

    exportWeekToPDF({
      sessions: sessionsState, // Use filtered sessions from current view
      students: studentsArray,
      weekDates,
      viewMode, // Pass current view mode for header label and shape rendering
    });
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
          <LongHoverTooltip content="Print your weekly schedule as a one-page view. Opens a print dialog where you can save as PDF or send to printer.">
            <button
              onClick={handlePrintWeek}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span className="text-sm font-medium">Print Week</span>
            </button>
          </LongHoverTooltip>
        </div>
      )}
      {/* For SEA users, show the export button on its own row */}
      {userProfile?.role === 'sea' && (
        <div className="mb-4 flex justify-end">
          <LongHoverTooltip content="Print your weekly schedule as a one-page view. Opens a print dialog where you can save as PDF or send to printer.">
            <button
              onClick={handlePrintWeek}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span className="text-sm font-medium">Print Week</span>
            </button>
          </LongHoverTooltip>
        </div>
      )}

      <div className="grid grid-cols-5 gap-3 mb-4">
        {daysInWeek.map(({ date, sessions: daySessions, dayOfWeek, isHoliday: isHolidayDay, holidayName }) => {
          const dateStr = toLocalDateKey(date);
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

                          // The group's chosen color (a small accent — never the board fill).
                          const groupColorIdx = groupSessions.find((s: SessionWithCurriculum) => s.group_color != null)?.group_color ?? null;
                          const groupHex = groupColorHex(groupColorIdx);

                          // Get unique students with their session assignment info
                          const uniqueStudentSessions = groupSessions.reduce((acc: SessionWithCurriculum[], session: SessionWithCurriculum) => {
                            const studentId = session.student_id;
                            if (!acc.some((s: SessionWithCurriculum) => s.student_id === studentId)) {
                              acc.push(session);
                            }
                            return acc;
                          }, [] as SessionWithCurriculum[]);

                          // Check if any session in the group has curriculum tracking (get first from array)
                          const groupCurriculumSession = groupSessions.find((s: SessionWithCurriculum) => s.curriculum_tracking && s.curriculum_tracking.length > 0);
                          const groupCurriculum = groupCurriculumSession ? getFirstCurriculum(groupCurriculumSession.curriculum_tracking) : null;

                          return (
                            <div key={`group-${groupId}`} className="mb-2">
                              <button
                                type="button"
                                onClick={() => handleOpenGroupModal(groupId, groupName, groupSessions)}
                                className={cn(
                                  "w-full text-left border-2 border-blue-300 rounded-lg p-3 text-xs hover:border-blue-400 transition-colors relative",
                                  getGroupColor(groupSessions)
                                )}
                                aria-label={`Open group ${groupName} details`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                                    {groupHex && (
                                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: groupHex }} aria-hidden />
                                    )}
                                    <span>📚 {groupName}</span>
                                  </div>
                                  {/* Notes and documents indicators */}
                                  <div className="flex items-center gap-1">
                                    {groupIndicators[`${groupId}|${dateStr}`]?.hasNotes && (
                                      <span title="Has notes"><FileText className="w-3 h-3 text-blue-600" /></span>
                                    )}
                                    {groupIndicators[`${groupId}|${dateStr}`]?.hasDocuments && (
                                      <span title="Has documents"><Paperclip className="w-3 h-3 text-blue-600" /></span>
                                    )}
                                  </div>
                                </div>
                                <div className="font-medium text-gray-900">
                                  {formatTime(earliestStart)} - {formatTime(latestEnd)}
                                </div>
                                <div className="mt-1 flex items-center gap-1 flex-wrap">
                                  {uniqueStudentSessions.map((session: SessionWithCurriculum, sidx: number) => {
                                    const student = session.student_id ? allStudents.get(session.student_id) : undefined;
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
                                {/* Curriculum badge for group */}
                                {groupCurriculum && (
                                  <span className="absolute bottom-0.5 right-0.5 max-w-[calc(100%-4px)] truncate px-1 py-0.5 text-[10px] font-medium rounded bg-indigo-100 text-indigo-700">
                                    {formatCurriculumBadge(groupCurriculum)}
                                  </span>
                                )}
                              </button>
                            </div>
                          );
                        } else {
                          const session = block.data as SessionWithCurriculum;
                          const student = session.student_id ? allStudents.get(session.student_id) : null;
                          return (
                            <div key={session.id} className="mb-2">
                              <button
                                type="button"
                                onClick={() => handleOpenSessionModal(session)}
                                className={cn(
                                  "w-full text-left border-2 border-blue-300 rounded-lg p-2 text-xs hover:border-blue-400 transition-colors relative",
                                  getSessionColor(session)
                                )}
                                aria-label={`Open session for ${student?.initials || 'student'} at ${formatTime(session.start_time || '')}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="font-medium text-gray-900">
                                    {formatTime(session.start_time || '')}
                                  </div>
                                  {/* Notes and documents indicators */}
                                  <div className="flex items-center gap-1">
                                    {sessionIndicators[`${session.id}|${session.session_date}`]?.hasNotes && (
                                      <span title="Has notes"><FileText className="w-3 h-3 text-blue-600" /></span>
                                    )}
                                    {sessionIndicators[`${session.id}|${session.session_date}`]?.hasDocuments && (
                                      <span title="Has documents"><Paperclip className="w-3 h-3 text-blue-600" /></span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-gray-700">
                                  {student?.initials || '?'}
                                </div>
                                {/* Curriculum badge */}
                                {getFirstCurriculum(session.curriculum_tracking) && (
                                  <span className="absolute bottom-0.5 right-0.5 max-w-[calc(100%-4px)] truncate px-1 py-0.5 text-[10px] font-medium rounded bg-indigo-100 text-indigo-700">
                                    {formatCurriculumBadge(getFirstCurriculum(session.curriculum_tracking)!)}
                                  </span>
                                )}
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

      {/* Group Details Modal */}
      {selectedGroupId && (
        <SessionDetailsModal
          mode="group"
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
          initialCurriculum={(() => {
            const sessionWithCurriculum = selectedGroupSessions.find(s => s.curriculum_tracking && s.curriculum_tracking.length > 0);
            return sessionWithCurriculum ? getFirstCurriculum(sessionWithCurriculum.curriculum_tracking) : null;
          })()}
          onUpdate={onUpdate}
        />
      )}

      {/* Session Details Modal */}
      {selectedSession && sessionModalOpen && (
        <SessionDetailsModal
          mode="session"
          isOpen={sessionModalOpen}
          onClose={() => {
            setSessionModalOpen(false);
            // Don't clear selectedSession here in case notes modal needs it
          }}
          session={selectedSession}
          student={selectedSession.student_id ? allStudents.get(selectedSession.student_id) : undefined}
          initialCurriculum={getFirstCurriculum(selectedSession.curriculum_tracking)}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}