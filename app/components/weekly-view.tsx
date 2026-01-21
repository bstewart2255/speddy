"use client";

import React, { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, addDays, isWeekend, parse } from "date-fns";
import { createClient } from '@/lib/supabase/client';
import { useToast } from '../contexts/toast-context';
import { cn } from '@/src/utils/cn';
import { useSchool } from '@/app/components/providers/school-context';
import { ScheduleSession } from '@/src/types/database';
import { isScheduledSession } from '@/lib/utils/session-helpers';
import { SessionDetailsModal } from '@/app/components/modals/session-details-modal';
import { SessionGenerator, SessionWithCurriculum } from '@/lib/services/session-generator';
import { filterSessionsBySchool } from '@/lib/utils/session-filters';
import { formatCurriculumBadge, getFirstCurriculum } from '@/lib/utils/curriculum-helpers';
import { FileText, Paperclip } from 'lucide-react';

interface Holiday {
  date: string;
  name?: string;
}

interface CalendarEvent {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  event_type: 'meeting' | 'assessment' | 'activity' | 'other' | null;
  location: string | null;
  attendees: string[] | null;
  school_id: string | null;
  district_id: string | null;
  created_at: string;
  updated_at: string;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
// Compact time slots - only 30-minute intervals from 8 AM to 3 PM
const TIME_SLOTS = [
  "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM",
  "2:00 PM", "2:30 PM", "3:00 PM"
];

interface WeeklyViewProps {
  viewMode: 'provider' | 'sea';
}

// Type definitions for session blocks
interface GroupBlockData {
  groupId: string;
  groupName: string;
  sessions: SessionWithCurriculum[];
  earliestStart: string;
  latestEnd: string;
}

interface SessionBlockData {
  session: SessionWithCurriculum;
}

type SessionBlock =
  | { type: 'group'; data: GroupBlockData }
  | { type: 'session'; data: SessionBlockData };

export function WeeklyView({ viewMode }: WeeklyViewProps) {
  const { showToast } = useToast();
  const schoolContext = useSchool();
  const currentSchool = schoolContext.currentSchool;
  const worksAtMultipleSchools = schoolContext.worksAtMultipleSchools;
  
  // Memoize weekStart to prevent infinite re-renders
  const weekStart = React.useMemo(() => {
    const today = new Date();
    return isWeekend(today)
      ? startOfWeek(addDays(today, 7), { weekStartsOn: 1 })
      : startOfWeek(today, { weekStartsOn: 1 });
  }, []); // Calculate once on mount

  const sessionGenerator = React.useMemo(() => new SessionGenerator(), []);

  const [sessions, setSessions] = React.useState<SessionWithCurriculum[]>([]);
  const [students, setStudents] = React.useState<Record<string, {
    id: string;
    initials: string;
    grade_level: string;
    teacher_name?: string;
  }>>({});
  const [loading, setLoading] = React.useState(true);
  const [showToggle, setShowToggle] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null);

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
      if (!currentUser || sessions.length === 0) return;

      // Collect sessions with time slots, dates, and group IDs
      const sessionInfos: { id: string; timeSlot: string; sessionDate: string }[] = [];
      const groupIds = new Set<string>();

      for (const session of sessions) {
        if (session.group_id) {
          groupIds.add(session.group_id);
        } else if (session.start_time && session.end_time && session.session_date) {
          sessionInfos.push({
            id: session.id,
            timeSlot: `${session.start_time}-${session.end_time}`,
            sessionDate: session.session_date
          });
        }
      }

      // Get all week dates for filtering (Mon-Fri)
      const weekDateStrings: string[] = [];
      for (let i = 0; i < 5; i++) {
        weekDateStrings.push(format(addDays(weekStart, i), 'yyyy-MM-dd'));
      }

      try {
        const response = await fetch('/api/sessions/indicators', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessions: sessionInfos,
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
  }, [sessions, weekStart, currentUser]);

  // Modal state for groups and sessions
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string>('');
  const [selectedGroupSessions, setSelectedGroupSessions] = useState<SessionWithCurriculum[]>([]);

  // Keep selectedGroupSessions in sync with main sessions when data refreshes
  useEffect(() => {
    if (selectedGroupId && groupModalOpen) {
      const updatedGroupSessions = sessions.filter(s => s.group_id === selectedGroupId);
      // Deduplicate by session ID to prevent accumulation bugs
      const uniqueSessions = Array.from(
        new Map(updatedGroupSessions.map(s => [s.id, s])).values()
      );
      // Always update state to clear stale data when no sessions match
      setSelectedGroupSessions(uniqueSessions);
    }
  }, [sessions, selectedGroupId, groupModalOpen]);

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionWithCurriculum | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    initials: string;
    grade_level: string;
    teacher_name?: string;
  } | null>(null);

  // Filter view state for "Me" vs "Others"
  const [filterView, setFilterView] = useState<'me' | 'others'>('me');

  // Current time state for highlighting active sessions
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Helper function to check if a session is currently active (current time is within session start/end)
  const isSessionActive = useCallback((startTime: string | null, endTime: string | null, sessionDate: Date): boolean => {
    if (!startTime || !endTime) return false;

    // Only highlight if viewing today's schedule
    const today = new Date();
    const isToday = format(sessionDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
    if (!isToday) return false;

    // Parse session start and end times
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);

    // Create Date objects for comparison using today's date
    const sessionStart = new Date(today);
    sessionStart.setHours(startHours, startMinutes, 0, 0);

    const sessionEnd = new Date(today);
    sessionEnd.setHours(endHours, endMinutes, 0, 0);

    // Check if current time is within session time range
    return currentTime >= sessionStart && currentTime < sessionEnd;
  }, [currentTime]);

  // Helper function to check if any session in a group is currently active
  const isGroupActive = useCallback((groupSessions: SessionWithCurriculum[], sessionDate: Date): boolean => {
    return groupSessions.some(session =>
      isSessionActive(session.start_time, session.end_time, sessionDate)
    );
  }, [isSessionActive]);

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

  // Filter sessions based on "Me" vs "Others" view
  const filterSessionsByView = useCallback((sessions: SessionWithCurriculum[], view: 'me' | 'others'): SessionWithCurriculum[] => {
    if (!currentUser) return sessions;

    if (view === 'me') {
      // "Me" view: Sessions I'm responsible for delivering
      // - Sessions I own AND deliver myself (not assigned to anyone else)
      // - Sessions assigned to me by another specialist
      return sessions.filter(session => {
        // Sessions assigned to me by another specialist
        if (session.assigned_to_specialist_id === currentUser.id && session.provider_id !== currentUser.id) {
          return true;
        }
        // My sessions that I deliver myself (not assigned out)
        if (session.provider_id === currentUser.id) {
          const assignedOut = session.assigned_to_sea_id !== null || session.assigned_to_specialist_id !== null;
          return !assignedOut;
        }
        return false;
      });
    } else {
      // "Others" view: My sessions that I've assigned to SEA or Specialist
      return sessions.filter(session => {
        // Must be my session (I own it)
        if (session.provider_id !== currentUser.id) return false;
        // And assigned to someone else
        return session.assigned_to_sea_id !== null || session.assigned_to_specialist_id !== null;
      });
    }
  }, [currentUser]);

  React.useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    // Inside React.useEffect
    const fetchData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !isMounted) {
          setLoading(false);
          return;
        }

        setCurrentUser(user);

        // Check if user is a Resource Specialist and has SEAs
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, school_site, school_district')
          .eq('id', user.id)
          .single();

        const userRole = profile?.role;
        let hasSEAs = false;
        if (userRole === 'resource' && profile?.school_site) {
          // Check if there are any SEAs at the same school
          const { data: seas, count: seaCount } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'sea')
            .eq('school_site', profile.school_site);

          hasSEAs = (seaCount || 0) > 0;
          setShowToggle(hasSEAs);
        } else {
          setShowToggle(false);
        }

        // Calculate week date range
        const weekStartDate = new Date(weekStart);
        weekStartDate.setHours(0, 0, 0, 0);
        const weekEndDate = new Date(addDays(weekStart, 4));
        weekEndDate.setHours(23, 59, 59, 999);
        const weekStartStr = format(weekStart, 'yyyy-MM-dd');
        const weekEndStr = format(addDays(weekStart, 4), 'yyyy-MM-dd');

        // Use SessionGenerator to get sessions for this week
        // This includes role-based filtering for assigned sessions (specialist/SEA)
        let allSessions = await sessionGenerator.getSessionsForDateRange(
          user.id,
          weekStartDate,
          weekEndDate,
          profile?.role
        );

        // Apply view mode filtering
        let sessionData: SessionWithCurriculum[];
        if (userRole === 'sea') {
          // SEA users: Only show sessions assigned to them (already filtered by SessionGenerator)
          sessionData = allSessions.filter(s => s.assigned_to_sea_id === user.id);
        } else if (hasSEAs && viewMode === 'sea') {
          // Provider viewing SEA sessions: Show only sessions they own that are assigned to SEAs
          sessionData = allSessions.filter(s =>
            s.provider_id === user.id && s.delivered_by === 'sea'
          );
        } else {
          // Provider viewing their own sessions: Show owned + assigned sessions
          sessionData = allSessions;
        }

        // Apply school filtering
        if (currentSchool && worksAtMultipleSchools && currentSchool.school_id) {
          sessionData = await filterSessionsBySchool(
            supabase,
            sessionData,
            currentSchool
          );
        }

        if (sessionData && isMounted) {
          setSessions(sessionData);

          // Get unique student IDs
          const studentIds = [
            ...new Set(sessionData.map((s) => s.student_id).filter(Boolean)),
          ];

          if (studentIds.length > 0) {
            // Fetch all students in one query
            const { data: studentData, error: studentError } = await supabase
            .from("students")
            .select("id, initials, grade_level, teacher_name")
            .in("id", studentIds);

            if (studentData && !studentError && isMounted) {
              const studentMap: Record<string, any> = {};
              studentData.forEach((student) => {
                studentMap[student.id] = student;
              });
              setStudents(studentMap);
            } else if (studentError) {
              console.error("Failed to fetch students:", studentError);
            }
          }

          // Fetch holidays for the current school
          if (profile?.school_site && profile?.school_district) {
            const { data: holidayData } = await supabase
              .from('holidays')
              .select('date, name')
              .eq('school_site', profile.school_site)
              .eq('school_district', profile.school_district);

            if (holidayData) {
              setHolidays(holidayData);
            }
          }

          // Fetch calendar events for the week
          const { data: eventsData } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('provider_id', user.id)
            .gte('date', weekStartStr)
            .lte('date', weekEndStr)
            .order('date')
            .order('start_time');
          
          if (eventsData && isMounted) {
            setCalendarEvents(eventsData);
          }
        }
      } catch (error) {
        console.error("Fetch error:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [viewMode, weekStart, currentSchool, worksAtMultipleSchools, sessionGenerator, refreshKey]); // Re-run when viewMode, weekStart, school, or refreshKey changes

  // Helper functions
  const getDayIndex = (session: any): number => {
    // The session already has day_of_week from database (1 = Monday, 5 = Friday)
    // Return it adjusted for 0-based array indexing
    return session.day_of_week - 1; // Returns 0-4 for Monday-Friday
  };

  // Helper function to aggregate sessions into groups and individual blocks
  const aggregateSessionsForDisplay = useCallback((sessions: SessionWithCurriculum[]) => {
    const groups = new Map<string, SessionWithCurriculum[]>();
    const ungroupedSessions: SessionWithCurriculum[] = [];

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
  }, []);

  const getTimeSlotIndex = (timeString: string) => {
    if (!timeString) return -1;
    
    // Handle both HH:mm and HH:mm:ss formats
    const parts = timeString.split(':');
    if (parts.length < 2) return -1;
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    
    if (isNaN(hours) || isNaN(minutes)) return -1;

    // Find the 30-minute slot this time falls into
    const slotMinutes = minutes < 30 ? 0 : 30;

    // Create a new date with the slot time
    const slotTime = new Date();
    slotTime.setHours(hours, slotMinutes, 0, 0);
    const formattedTime = format(slotTime, "h:mm a");

    return TIME_SLOTS.indexOf(formattedTime);
  };

  const getSessionSpan = (startTime: string, endTime: string) => {
    const start = parse(startTime, "HH:mm:ss", new Date());
    const end = parse(endTime, "HH:mm:ss", new Date());
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    return Math.ceil(durationMinutes / 30);
  };

  const isHoliday = (date: Date): { isHoliday: boolean; name?: string } => {
    const dateStr = date.toISOString().split('T')[0];
    const holiday = holidays.find(h => h.date === dateStr);
    return { isHoliday: !!holiday, name: holiday?.name };
  };

  // Modal handlers for groups and sessions
  const handleOpenGroupModal = useCallback((groupId: string, groupName: string, sessions: SessionWithCurriculum[]) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
    setSelectedGroupSessions(sessions);
    setGroupModalOpen(true);
  }, []);

  const handleOpenSessionModal = useCallback((session: SessionWithCurriculum, student: { id: string; initials: string; grade_level: string; teacher_name?: string }) => {
    setSelectedSession(session);
    setSelectedStudent(student);
    setSessionModalOpen(true);
  }, []);

  // Helper function to calculate time range with null safety
  const getGroupTimeRange = useCallback((groupSessions: SessionWithCurriculum[]) => {
    const validSessions = groupSessions.filter(s => s.start_time && s.end_time);
    if (validSessions.length === 0) {
      return { earliestStart: '', latestEnd: '' };
    }

    const earliestStart = validSessions.reduce((min, s) =>
      s.start_time && s.start_time < min ? s.start_time : min,
      validSessions[0].start_time!
    );

    const latestEnd = validSessions.reduce((max, s) =>
      s.end_time && s.end_time > max ? s.end_time : max,
      validSessions[0].end_time!
    );

    return { earliestStart, latestEnd };
  }, []);

  // Helper function to get unique student initials with Set for better performance
  const getUniqueStudentInitials = useCallback((groupSessions: SessionWithCurriculum[]) => {
    const initialsSet = new Set(
      groupSessions.map((s: ScheduleSession) => s.student_id ? students[s.student_id]?.initials || '?' : '?')
    );
    return Array.from(initialsSet).join(', ');
  }, [students]);

  const formatTime = (time: string | null | undefined) => {
    if (!time || typeof time !== 'string') {
      return '--:-- --';
    }
    const parts = time.split(':');
    if (parts.length < 2) {
      return '--:-- --';
    }
    const [hours, minutes] = parts.map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      return '--:-- --';
    }
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Group sessions by day and time
  const sessionsByDayTime = React.useMemo(() => {
    const grouped: Record<string, any[]> = {}; // Note: now stores arrays of sessions

    // Filter to only scheduled sessions (with non-null day/time fields)
    const scheduledSessions = sessions.filter(isScheduledSession);

    // Apply the "Me" vs "Others" filter (skip for SEA users - they see all their assigned sessions)
    const filteredSessions = viewMode === 'sea'
      ? scheduledSessions
      : filterSessionsByView(scheduledSessions, filterView);

    filteredSessions.forEach((session) => {
      const dayIndex = getDayIndex(session); // Pass session, not session.date
      // After isScheduledSession filter, start_time and end_time are guaranteed non-null
      const timeIndex = getTimeSlotIndex(session.start_time!);
      const span = getSessionSpan(session.start_time!, session.end_time!);

      if (dayIndex >= 0 && dayIndex < 5 && timeIndex >= 0) {
        const key = `${dayIndex}-${timeIndex}`;

        // Initialize array if it doesn't exist
        if (!grouped[key]) {
          grouped[key] = [];
        }

        // Add session to the array
        grouped[key].push({ ...session, span });
      }
    });

    return grouped;
  }, [sessions, filterView, filterSessionsByView, viewMode]);

  React.useEffect(() => {
    let visibleCount = 0;
    Object.values(sessionsByDayTime).forEach(slotSessions => {
      if (Array.isArray(slotSessions)) {
        visibleCount += slotSessions.length;
      }
    });

    // Find slots with many sessions
    const crowdedSlots = Object.entries(sessionsByDayTime)
      .filter((entry): entry is [string, any[]] =>
        Array.isArray(entry[1]) && entry[1].length > 2
      )
      .map(([key, slotSessions]) => ({
        key,
        count: slotSessions.length,
        times: slotSessions.map(s => s.start_time)
      }));
  }, [sessions, sessionsByDayTime]);

  // Calculate the starting day (today or next Monday if weekend)
  const startDay = React.useMemo(() => {
    const today = new Date();
    if (isWeekend(today)) {
      return startOfWeek(addDays(today, 7), { weekStartsOn: 1 });
    }
    return today;
  }, []); // Empty dependency array since we only calculate this once

  // Morning and afternoon time slots
  const MORNING_SLOTS = ["8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM"];
  const AFTERNOON_SLOTS = ["12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM"];

  React.useEffect(() => {
    let displayedCount = 0;

    for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
      const currentDate = addDays(startDay, dayOffset);
      const dayIndex = currentDate.getDay() - 1;

      if (dayIndex >= 0 && dayIndex <= 4) {
        TIME_SLOTS.forEach((time, timeIndex) => {
          const sessionKey = `${dayIndex}-${timeIndex}`;
          const sessionsInSlot = sessionsByDayTime[sessionKey] || [];
          displayedCount += sessionsInSlot.length;
        });
      }
    }

  }, [sessions, sessionsByDayTime, startDay]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-[400px] flex items-center justify-center">
        <div className="text-gray-500">Loading schedule...</div>
      </div>
    );
  }

return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Today's Schedule
          </h2>
          {/* Filter toggle for Me vs Others - only show for providers, not SEAs */}
          {viewMode !== 'sea' && (
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setFilterView('me')}
                aria-label="Show sessions I deliver"
                aria-pressed={filterView === 'me'}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  filterView === 'me'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                Me
              </button>
              <button
                type="button"
                onClick={() => setFilterView('others')}
                aria-label="Show sessions assigned to others"
                aria-pressed={filterView === 'others'}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  filterView === 'others'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                Others
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {[0].map(dayOffset => {
          const currentDate = addDays(startDay, dayOffset);
          // Get the day of week for the current date (0 = Sunday, 1 = Monday, etc.)
          const actualDayOfWeek = currentDate.getDay();
          // Convert to our index system (0 = Monday, 1 = Tuesday, ..., 4 = Friday)
          // Sunday (0) becomes 6, but we skip weekends anyway
          const dayIndex = actualDayOfWeek === 0 ? -1 : actualDayOfWeek - 1;
          const isToday = format(currentDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

          // Skip weekends
          if (dayIndex < 0 || dayIndex > 4) return null;

          return (
            <div key={dayOffset} className={`border rounded-lg ${isToday ? 'border-blue-400' : 'border-gray-200'}`}>
              <div className="px-3 py-2 font-medium text-sm bg-gray-50 rounded-t-lg">
                {format(currentDate, 'EEEE, MMM d')}
              </div>

              <div className="grid grid-cols-2 divide-x divide-gray-200">
                {/* Morning */}
                <div className="p-2 space-y-2">
                  <div className="text-xs font-medium text-gray-600 mb-2">Morning</div>
                  {(() => {
                    const holidayCheck = isHoliday(currentDate);
                    if (holidayCheck.isHoliday) {
                      return <div className="text-center text-red-600 font-medium text-sm py-4">Holiday - {holidayCheck.name}</div>;
                    }

                    // Get all morning sessions for this day
                    const morningSessions: SessionWithCurriculum[] = [];
                    MORNING_SLOTS.forEach((time) => {
                      const timeIndex = TIME_SLOTS.findIndex(slot => slot === time);
                      const sessionKey = `${dayIndex}-${timeIndex}`;
                      const sessionsInSlot = sessionsByDayTime[sessionKey] || [];
                      morningSessions.push(...sessionsInSlot);
                    });

                    // Filter to only scheduled sessions
                    const scheduledMorningSessions = morningSessions.filter(isScheduledSession);

                    if (scheduledMorningSessions.length === 0) {
                      return <div className="text-center text-gray-400 text-sm py-4">No sessions</div>;
                    }

                    // Aggregate into groups and individual sessions
                    const { groups, ungroupedSessions } = aggregateSessionsForDisplay(scheduledMorningSessions);
                    const allBlocks: SessionBlock[] = [];

                    // Add groups
                    groups.forEach((groupSessions, groupId) => {
                      const firstSession = groupSessions[0];
                      if (firstSession && firstSession.start_time && firstSession.end_time) {
                        const { earliestStart, latestEnd } = getGroupTimeRange(groupSessions);
                        allBlocks.push({
                          type: 'group',
                          data: {
                            groupId,
                            groupName: firstSession.group_name || 'Unnamed Group',
                            sessions: groupSessions,
                            earliestStart,
                            latestEnd
                          }
                        });
                      }
                    });

                    // Add ungrouped sessions
                    ungroupedSessions.forEach(session => {
                      allBlocks.push({ type: 'session', data: { session } });
                    });

                    // Sort by start time
                    allBlocks.sort((a, b) => {
                      const aTime = a.type === 'group' ? a.data.earliestStart : a.data.session.start_time;
                      const bTime = b.type === 'group' ? b.data.earliestStart : b.data.session.start_time;
                      return (aTime || '').localeCompare(bTime || '');
                    });

                    return allBlocks.map((block, idx) => {
                      if (block.type === 'group') {
                        const { groupId, groupName, sessions: groupSessions, earliestStart, latestEnd } = block.data;
                        const studentInitials = getUniqueStudentInitials(groupSessions);
                        // Check if any session in the group has curriculum tracking
                        const groupCurriculumSession = groupSessions.find(s => s.curriculum_tracking && s.curriculum_tracking.length > 0);
                        const groupCurriculum = groupCurriculumSession ? getFirstCurriculum(groupCurriculumSession.curriculum_tracking) : null;
                        // Check if group is currently active
                        const groupIsActive = isGroupActive(groupSessions, currentDate);

                        return (
                          <button
                            key={`group-${groupId}-${idx}`}
                            type="button"
                            onClick={() => handleOpenGroupModal(groupId, groupName, groupSessions)}
                            className={cn(
                              'w-full text-left border-2 rounded-lg p-2 text-xs transition-colors relative',
                              groupIsActive
                                ? 'border-red-500 ring-2 ring-red-200'
                                : 'border-blue-300 hover:border-blue-400',
                              getGroupColor(groupSessions)
                            )}
                            aria-label={`Open group ${groupName} details`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-semibold text-blue-900">📚 {groupName}</div>
                              {/* Notes and documents indicators */}
                              <div className="flex items-center gap-1">
                                {groupIndicators[groupId]?.hasNotes && (
                                  <span title="Has notes"><FileText className="w-3 h-3 text-blue-600" /></span>
                                )}
                                {groupIndicators[groupId]?.hasDocuments && (
                                  <span title="Has documents"><Paperclip className="w-3 h-3 text-blue-600" /></span>
                                )}
                              </div>
                            </div>
                            <div className="font-medium text-gray-900">
                              {formatTime(earliestStart)} - {formatTime(latestEnd)}
                            </div>
                            <div className="text-gray-700 mt-1">
                              {studentInitials}
                            </div>
                            {/* Curriculum badge for group */}
                            {groupCurriculum && (
                              <span className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[10px] font-medium rounded bg-indigo-100 text-indigo-700">
                                {formatCurriculumBadge(groupCurriculum)}
                              </span>
                            )}
                          </button>
                        );
                      } else {
                        const session = block.data.session;
                        const studentData = {
                          id: session.student_id || '',
                          initials: session.student_id ? students[session.student_id]?.initials || '?' : '?',
                          grade_level: session.student_id ? students[session.student_id]?.grade_level || '' : '',
                          teacher_name: session.student_id ? students[session.student_id]?.teacher_name : undefined
                        };

                        const sessionCurriculum = getFirstCurriculum(session.curriculum_tracking);
                        // Check if session is currently active
                        const sessionIsActive = isSessionActive(session.start_time, session.end_time, currentDate);

                        return (
                          <button
                            key={`session-${session.id}`}
                            type="button"
                            onClick={() => handleOpenSessionModal(session, studentData)}
                            className={cn(
                              'w-full text-left border-2 rounded-lg p-2 text-xs transition-colors relative',
                              sessionIsActive
                                ? 'border-red-500 ring-2 ring-red-200'
                                : 'border-blue-300 hover:border-blue-400',
                              getSessionColor(session)
                            )}
                            aria-label={`Open session for ${studentData.initials} at ${formatTime(session.start_time)}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-gray-900">
                                {formatTime(session.start_time)} - {formatTime(session.end_time)}
                              </div>
                              {/* Notes and documents indicators */}
                              <div className="flex items-center gap-1">
                                {sessionIndicators[session.id]?.hasNotes && (
                                  <span title="Has notes"><FileText className="w-3 h-3 text-blue-600" /></span>
                                )}
                                {sessionIndicators[session.id]?.hasDocuments && (
                                  <span title="Has documents"><Paperclip className="w-3 h-3 text-blue-600" /></span>
                                )}
                              </div>
                            </div>
                            <div className={session.delivered_by === 'sea' ? 'text-green-600 font-medium' : 'text-gray-700'}>
                              {studentData.initials}
                              {session.delivered_by === 'sea' && (
                                <span className="ml-1 text-xs">(SEA)</span>
                              )}
                            </div>
                            {/* Curriculum badge */}
                            {sessionCurriculum && (
                              <span className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[10px] font-medium rounded bg-indigo-100 text-indigo-700">
                                {formatCurriculumBadge(sessionCurriculum)}
                              </span>
                            )}
                          </button>
                        );
                      }
                    });
                  })()}
                </div>

                {/* Afternoon */}
                <div className="p-2 space-y-2">
                  <div className="text-xs font-medium text-gray-600 mb-2">Afternoon</div>
                  {(() => {
                    const holidayCheck = isHoliday(currentDate);
                    if (holidayCheck.isHoliday) {
                      return <div className="text-center text-red-600 font-medium text-sm py-4">Holiday - {holidayCheck.name}</div>;
                    }

                    // Get all afternoon sessions for this day
                    const afternoonSessions: SessionWithCurriculum[] = [];
                    AFTERNOON_SLOTS.forEach((time) => {
                      const timeIndex = TIME_SLOTS.findIndex(slot => slot === time);
                      const sessionKey = `${dayIndex}-${timeIndex}`;
                      const sessionsInSlot = sessionsByDayTime[sessionKey] || [];
                      afternoonSessions.push(...sessionsInSlot);
                    });

                    // Filter to only scheduled sessions
                    const scheduledAfternoonSessions = afternoonSessions.filter(isScheduledSession);

                    if (scheduledAfternoonSessions.length === 0) {
                      return <div className="text-center text-gray-400 text-sm py-4">No sessions</div>;
                    }

                    // Aggregate into groups and individual sessions
                    const { groups, ungroupedSessions } = aggregateSessionsForDisplay(scheduledAfternoonSessions);
                    const allBlocks: SessionBlock[] = [];

                    // Add groups
                    groups.forEach((groupSessions, groupId) => {
                      const firstSession = groupSessions[0];
                      if (firstSession && firstSession.start_time && firstSession.end_time) {
                        const { earliestStart, latestEnd } = getGroupTimeRange(groupSessions);
                        allBlocks.push({
                          type: 'group',
                          data: {
                            groupId,
                            groupName: firstSession.group_name || 'Unnamed Group',
                            sessions: groupSessions,
                            earliestStart,
                            latestEnd
                          }
                        });
                      }
                    });

                    // Add ungrouped sessions
                    ungroupedSessions.forEach(session => {
                      allBlocks.push({ type: 'session', data: { session } });
                    });

                    // Sort by start time
                    allBlocks.sort((a, b) => {
                      const aTime = a.type === 'group' ? a.data.earliestStart : a.data.session.start_time;
                      const bTime = b.type === 'group' ? b.data.earliestStart : b.data.session.start_time;
                      return (aTime || '').localeCompare(bTime || '');
                    });

                    return allBlocks.map((block, idx) => {
                      if (block.type === 'group') {
                        const { groupId, groupName, sessions: groupSessions, earliestStart, latestEnd } = block.data;
                        const studentInitials = getUniqueStudentInitials(groupSessions);
                        // Check if any session in the group has curriculum tracking
                        const groupCurriculumSession = groupSessions.find(s => s.curriculum_tracking && s.curriculum_tracking.length > 0);
                        const groupCurriculum = groupCurriculumSession ? getFirstCurriculum(groupCurriculumSession.curriculum_tracking) : null;
                        // Check if group is currently active
                        const groupIsActive = isGroupActive(groupSessions, currentDate);

                        return (
                          <button
                            key={`group-${groupId}-${idx}`}
                            type="button"
                            onClick={() => handleOpenGroupModal(groupId, groupName, groupSessions)}
                            className={cn(
                              'w-full text-left border-2 rounded-lg p-2 text-xs transition-colors relative',
                              groupIsActive
                                ? 'border-red-500 ring-2 ring-red-200'
                                : 'border-blue-300 hover:border-blue-400',
                              getGroupColor(groupSessions)
                            )}
                            aria-label={`Open group ${groupName} details`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-semibold text-blue-900">📚 {groupName}</div>
                              {/* Notes and documents indicators */}
                              <div className="flex items-center gap-1">
                                {groupIndicators[groupId]?.hasNotes && (
                                  <span title="Has notes"><FileText className="w-3 h-3 text-blue-600" /></span>
                                )}
                                {groupIndicators[groupId]?.hasDocuments && (
                                  <span title="Has documents"><Paperclip className="w-3 h-3 text-blue-600" /></span>
                                )}
                              </div>
                            </div>
                            <div className="font-medium text-gray-900">
                              {formatTime(earliestStart)} - {formatTime(latestEnd)}
                            </div>
                            <div className="text-gray-700 mt-1">
                              {studentInitials}
                            </div>
                            {/* Curriculum badge for group */}
                            {groupCurriculum && (
                              <span className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[10px] font-medium rounded bg-indigo-100 text-indigo-700">
                                {formatCurriculumBadge(groupCurriculum)}
                              </span>
                            )}
                          </button>
                        );
                      } else {
                        const session = block.data.session;
                        const studentData = {
                          id: session.student_id || '',
                          initials: session.student_id ? students[session.student_id]?.initials || '?' : '?',
                          grade_level: session.student_id ? students[session.student_id]?.grade_level || '' : '',
                          teacher_name: session.student_id ? students[session.student_id]?.teacher_name : undefined
                        };
                        const sessionCurriculum = getFirstCurriculum(session.curriculum_tracking);
                        // Check if session is currently active
                        const sessionIsActive = isSessionActive(session.start_time, session.end_time, currentDate);

                        return (
                          <button
                            key={`session-${session.id}`}
                            type="button"
                            onClick={() => handleOpenSessionModal(session, studentData)}
                            className={cn(
                              'w-full text-left border-2 rounded-lg p-2 text-xs transition-colors relative',
                              sessionIsActive
                                ? 'border-red-500 ring-2 ring-red-200'
                                : 'border-blue-300 hover:border-blue-400',
                              getSessionColor(session)
                            )}
                            aria-label={`Open session for ${studentData.initials} at ${formatTime(session.start_time)}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-gray-900">
                                {formatTime(session.start_time)} - {formatTime(session.end_time)}
                              </div>
                              {/* Notes and documents indicators */}
                              <div className="flex items-center gap-1">
                                {sessionIndicators[session.id]?.hasNotes && (
                                  <span title="Has notes"><FileText className="w-3 h-3 text-blue-600" /></span>
                                )}
                                {sessionIndicators[session.id]?.hasDocuments && (
                                  <span title="Has documents"><Paperclip className="w-3 h-3 text-blue-600" /></span>
                                )}
                              </div>
                            </div>
                            <div className={session.delivered_by === 'sea' ? 'text-green-600 font-medium' : 'text-gray-700'}>
                              {studentData.initials}
                              {session.delivered_by === 'sea' && (
                                <span className="ml-1 text-xs">(SEA)</span>
                              )}
                            </div>
                            {/* Curriculum badge */}
                            {sessionCurriculum && (
                              <span className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[10px] font-medium rounded bg-indigo-100 text-indigo-700">
                                {formatCurriculumBadge(sessionCurriculum)}
                              </span>
                            )}
                          </button>
                        );
                      }
                    });
                  })()}
                </div>
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
          students={new Map(Object.entries(students))}
          initialCurriculum={(() => {
            const sessionWithCurriculum = selectedGroupSessions.find(s => s.curriculum_tracking && s.curriculum_tracking.length > 0);
            return sessionWithCurriculum ? getFirstCurriculum(sessionWithCurriculum.curriculum_tracking) : null;
          })()}
          onUpdate={triggerRefresh}
        />
      )}

      {/* Session Details Modal */}
      {selectedSession && sessionModalOpen && selectedStudent && (
        <SessionDetailsModal
          mode="session"
          isOpen={sessionModalOpen}
          onClose={() => {
            setSessionModalOpen(false);
            setSelectedSession(null);
            setSelectedStudent(null);
          }}
          session={selectedSession}
          student={{
            initials: selectedStudent.initials,
            grade_level: selectedStudent.grade_level || '',
          }}
          initialCurriculum={getFirstCurriculum(selectedSession.curriculum_tracking)}
          onUpdate={triggerRefresh}
        />
      )}
    </div>
  );
}