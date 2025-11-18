"use client";

import React, { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, addDays, isWeekend, parse } from "date-fns";
import { createClient } from '@/lib/supabase/client';
import { useToast } from '../contexts/toast-context';
import { cn } from '@/src/utils/cn';
import { useSchool } from '@/app/components/providers/school-context';
import { ScheduleSession } from '@/src/types/database';
import { isScheduledSession } from '@/lib/utils/session-helpers';
import { GroupDetailsModal } from '@/app/components/modals/group-details-modal';
import { SessionDetailsModal } from '@/app/components/modals/session-details-modal';

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
  sessions: ScheduleSession[];
  earliestStart: string;
  latestEnd: string;
}

interface SessionBlockData {
  session: ScheduleSession;
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

  const [sessions, setSessions] = React.useState<ScheduleSession[]>([]);
  const [students, setStudents] = React.useState<Record<string, {
    id: string;
    initials: string;
    grade_level: string;
    teacher_name?: string;
  }>>({});
  const [loading, setLoading] = React.useState(true);
  const [showToggle, setShowToggle] = useState<boolean>(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null);

  // Modal state for groups and sessions
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string>('');
  const [selectedGroupSessions, setSelectedGroupSessions] = useState<ScheduleSession[]>([]);

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ScheduleSession | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    initials: string;
    grade_level: string;
    teacher_name?: string;
  } | null>(null);

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

        // Fetch schedule sessions based on view mode
        // Only join students table if we need to filter by school
        const needsStudentJoin = currentSchool &&
                                worksAtMultipleSchools &&
                                currentSchool.school_id;

        let sessionQuery;
        if (needsStudentJoin) {
          sessionQuery = supabase
            .from("schedule_sessions")
            .select(`
              id,
              day_of_week,
              start_time,
              end_time,
              student_id,
              delivered_by,
              assigned_to_sea_id,
              assigned_to_specialist_id,
              provider_id,
              service_type,
              session_date,
              session_notes,
              is_completed,
              student_absent,
              outside_schedule_conflict,
              completed_at,
              completed_by,
              group_id,
              group_name,
              students!inner(
                id,
                school_id
              )
            `)
            .gte("day_of_week", 1)
            .lte("day_of_week", 5)
            .order("day_of_week")
            .order("start_time");
        } else {
          sessionQuery = supabase
            .from("schedule_sessions")
            .select("id, day_of_week, start_time, end_time, student_id, delivered_by, assigned_to_sea_id, assigned_to_specialist_id, provider_id, service_type, session_date, session_notes, is_completed, student_absent, outside_schedule_conflict, completed_at, completed_by, group_id, group_name")
            .gte("day_of_week", 1)
            .lte("day_of_week", 5)
            .order("day_of_week")
            .order("start_time");
        }

        // Determine session filtering based on user role and view mode
        if (userRole === 'sea') {
          // SEA users: Show sessions assigned to them
          sessionQuery = sessionQuery
            .not("assigned_to_sea_id", "is", null)
            .eq("assigned_to_sea_id", user.id);
        } else if (hasSEAs && viewMode === 'sea') {
          // Provider viewing SEA sessions: Show sessions assigned to SEAs
          sessionQuery = sessionQuery
            .eq("provider_id", user.id)
            .eq("delivered_by", "sea");
        } else {
          // Provider viewing their own sessions
          sessionQuery = sessionQuery
            .eq("provider_id", user.id);
        }

        // Apply school filter if a specific school is selected
        if (needsStudentJoin && currentSchool?.school_id) {
          sessionQuery = sessionQuery.eq('students.school_id', currentSchool.school_id);
        }

        // Calculate week date range for filtering instances
        const weekStartStr = format(weekStart, 'yyyy-MM-dd');
        const weekEndStr = format(addDays(weekStart, 4), 'yyyy-MM-dd');

        // Filter to show only instances (not templates) within the current week
        sessionQuery = sessionQuery
          .not('session_date', 'is', null)
          .gte('session_date', weekStartStr)
          .lte('session_date', weekEndStr);

        const { data: sessionData, error: sessionError } = await sessionQuery;

        if (sessionError) {
          console.error("Session fetch error:", sessionError);
          setLoading(false);
          return;
        }

        if (sessionData && isMounted) {
          // Transform sessions to include date field
          // Handle both with and without student joins
          const transformedSessions = sessionData.map((session: any) => {
            // Extract the core session data (removing nested students object if present)
            const { students, ...sessionCore } = session;
            return {
              ...sessionCore,
              // Use session_date directly since we're only fetching instances
              date: sessionCore.session_date,
            };
          });

          setSessions(transformedSessions);

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
  }, [viewMode, weekStart, currentSchool, worksAtMultipleSchools]); // Re-run when viewMode, weekStart, or school changes

  // Helper functions
  const getDayIndex = (session: any): number => {
    // The session already has day_of_week from database (1 = Monday, 5 = Friday)
    // Return it adjusted for 0-based array indexing
    return session.day_of_week - 1; // Returns 0-4 for Monday-Friday
  };

  // Helper function to aggregate sessions into groups and individual blocks
  const aggregateSessionsForDisplay = useCallback((sessions: ScheduleSession[]) => {
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
  const handleOpenGroupModal = useCallback((groupId: string, groupName: string, sessions: ScheduleSession[]) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
    setSelectedGroupSessions(sessions);
    setGroupModalOpen(true);
  }, []);

  const handleOpenSessionModal = useCallback((session: ScheduleSession, student: { id: string; initials: string; grade_level: string; teacher_name?: string }) => {
    setSelectedSession(session);
    setSelectedStudent(student);
    setSessionModalOpen(true);
  }, []);

  // Helper function to calculate time range with null safety
  const getGroupTimeRange = useCallback((groupSessions: ScheduleSession[]) => {
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
  const getUniqueStudentInitials = useCallback((groupSessions: ScheduleSession[]) => {
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

    scheduledSessions.forEach((session) => {
      const dayIndex = getDayIndex(session); // Pass session, not session.date
      const timeIndex = getTimeSlotIndex(session.start_time);
      const span = getSessionSpan(session.start_time, session.end_time);

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
  }, [sessions]);

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
        <h2 className="text-lg font-semibold">
          Today's Schedule
        </h2>
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
                    const morningSessions: ScheduleSession[] = [];
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

                        return (
                          <button
                            key={`group-${groupId}-${idx}`}
                            type="button"
                            onClick={() => handleOpenGroupModal(groupId, groupName, groupSessions)}
                            className={`w-full text-left border-2 border-blue-300 rounded-lg p-2 text-xs hover:border-blue-400 transition-colors ${getGroupColor(groupSessions)}`}
                            aria-label={`Open group ${groupName} details`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-semibold text-blue-900">📚 {groupName}</div>
                              <div className="text-xs text-blue-700">{groupSessions.length} sessions</div>
                            </div>
                            <div className="font-medium text-gray-900">
                              {formatTime(earliestStart)} - {formatTime(latestEnd)}
                            </div>
                            <div className="text-gray-700 mt-1">
                              Students: {studentInitials}
                            </div>
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

                        return (
                          <button
                            key={`session-${session.id}`}
                            type="button"
                            onClick={() => handleOpenSessionModal(session, studentData)}
                            className={`w-full text-left border-2 border-blue-300 rounded-lg p-2 text-xs hover:border-blue-400 transition-colors ${getSessionColor(session)}`}
                            aria-label={`Open session for ${studentData.initials} at ${formatTime(session.start_time)}`}
                          >
                            <div className="font-medium text-gray-900">
                              {formatTime(session.start_time)} - {formatTime(session.end_time)}
                            </div>
                            <div className={session.delivered_by === 'sea' ? 'text-green-600 font-medium' : 'text-gray-700'}>
                              {studentData.initials}
                              {session.delivered_by === 'sea' && (
                                <span className="ml-1 text-xs">(SEA)</span>
                              )}
                            </div>
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
                    const afternoonSessions: ScheduleSession[] = [];
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

                        return (
                          <button
                            key={`group-${groupId}-${idx}`}
                            type="button"
                            onClick={() => handleOpenGroupModal(groupId, groupName, groupSessions)}
                            className={`w-full text-left border-2 border-blue-300 rounded-lg p-2 text-xs hover:border-blue-400 transition-colors ${getGroupColor(groupSessions)}`}
                            aria-label={`Open group ${groupName} details`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-semibold text-blue-900">📚 {groupName}</div>
                              <div className="text-xs text-blue-700">{groupSessions.length} sessions</div>
                            </div>
                            <div className="font-medium text-gray-900">
                              {formatTime(earliestStart)} - {formatTime(latestEnd)}
                            </div>
                            <div className="text-gray-700 mt-1">
                              Students: {studentInitials}
                            </div>
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

                        return (
                          <button
                            key={`session-${session.id}`}
                            type="button"
                            onClick={() => handleOpenSessionModal(session, studentData)}
                            className={`w-full text-left border-2 border-blue-300 rounded-lg p-2 text-xs hover:border-blue-400 transition-colors ${getSessionColor(session)}`}
                            aria-label={`Open session for ${studentData.initials} at ${formatTime(session.start_time)}`}
                          >
                            <div className="font-medium text-gray-900">
                              {formatTime(session.start_time)} - {formatTime(session.end_time)}
                            </div>
                            <div className={session.delivered_by === 'sea' ? 'text-green-600 font-medium' : 'text-gray-700'}>
                              {studentData.initials}
                              {session.delivered_by === 'sea' && (
                                <span className="ml-1 text-xs">(SEA)</span>
                              )}
                            </div>
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
          students={new Map(Object.entries(students))}
        />
      )}

      {/* Session Details Modal */}
      {selectedSession && sessionModalOpen && selectedStudent && (
        <SessionDetailsModal
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
        />
      )}
    </div>
  );
}