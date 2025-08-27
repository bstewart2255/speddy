"use client";

import React, { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, addDays, isWeekend, parse } from "date-fns";
import { createClient } from '@/lib/supabase/client';
import { DraggableSessionBox } from '@/app/components/session/draggable-session-box';
import { sessionUpdateService } from '@/lib/services/session-update-service';
import { useSessionSync } from '@/lib/hooks/use-session-sync';
import { useToast } from '../contexts/toast-context';
import { cn } from '@/src/utils/cn';
import { SchoolFilterToggle } from '@/app/components/school-filter-toggle';
import { useSchool } from '@/app/components/providers/school-context';

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

export function WeeklyView({ viewMode }: WeeklyViewProps) {
  const { showToast } = useToast();
  const { availableSchools, worksAtMultipleSchools } = useSchool();
  const today = new Date();
  const weekStart = isWeekend(today)
    ? startOfWeek(addDays(today, 7), { weekStartsOn: 1 })
    : startOfWeek(today, { weekStartsOn: 1 });

  const [sessions, setSessions] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState(true);
  const [showToggle, setShowToggle] = useState<boolean>(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('all');
  
  // Drag and drop state
  const [draggedSession, setDraggedSession] = useState<any>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sessionConflicts, setSessionConflicts] = useState<Record<string, boolean>>({});

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

        let hasSEAs = false;
        if (profile?.role === 'resource' && profile.school_site) {
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
        let sessionQuery = supabase
          .from("schedule_sessions")
          .select(`
            id, 
            day_of_week, 
            start_time, 
            end_time, 
            student_id, 
            delivered_by, 
            assigned_to_sea_id, 
            provider_id,
            students!inner(
              id,
              school_id
            )
          `)
          .gte("day_of_week", 1)
          .lte("day_of_week", 5)
          .order("day_of_week")
          .order("start_time");

        if (hasSEAs && viewMode === 'sea') {
          // Show sessions assigned to SEAs
          sessionQuery = sessionQuery
            .eq("provider_id", user.id)
            .eq("delivered_by", "sea");
        } else {
          // Show all provider sessions (default behavior)
          sessionQuery = sessionQuery
            .eq("provider_id", user.id);
        }
        
        // Apply school filter if a specific school is selected
        if (selectedSchoolFilter !== 'all' && worksAtMultipleSchools) {
          sessionQuery = sessionQuery.eq('students.school_id', selectedSchoolFilter);
        }

        const { data: sessionData, error: sessionError } = await sessionQuery;

        if (sessionError) {
          console.error("Session fetch error:", sessionError);
          setLoading(false);
          return;
        }

        if (sessionData && isMounted) {
          // Transform sessions to include calculated dates
          const transformedSessions = sessionData.map((session) => ({
            ...session,
            date: format(
              addDays(weekStart, session.day_of_week - 1),
              "yyyy-MM-dd",
            ),
          }));

          setSessions(transformedSessions);

          // Get unique student IDs
          const studentIds = [
            ...new Set(sessionData.map((s) => s.student_id).filter(Boolean)),
          ];

          if (studentIds.length > 0) {
            // Fetch all students in one query
            const { data: studentData, error: studentError } = await supabase
            .from("students")
            .select("id, initials, grade_level")
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
          const weekStartStr = format(weekStart, 'yyyy-MM-dd');
          const weekEndStr = format(addDays(weekStart, 4), 'yyyy-MM-dd');
          
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
  }, [viewMode, weekStart, selectedSchoolFilter, worksAtMultipleSchools]); // Re-run when viewMode, weekStart, or school filter changes

  // Use session sync hook for real-time updates
  const { isConnected, lastSync, optimisticUpdate, forceRefresh } = useSessionSync({
    sessions: sessions,
    setSessions: setSessions,
    providerId: currentUser?.id || undefined,
    showToast
  });

  // Helper functions
  const getDayIndex = (session: any): number => {
    // The session already has day_of_week from database (1 = Monday, 5 = Friday)
    // Return it adjusted for 0-based array indexing
    return session.day_of_week - 1; // Returns 0-4 for Monday-Friday
  };

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

  // Drag and drop handlers
  const canEditSession = useCallback((session: any) => {
    if (!currentUser) return false;
    
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
  }, [currentUser]);

  // Check for conflicts after a session is moved
  const checkSessionConflicts = useCallback(async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const validation = await sessionUpdateService.validateSessionMove({
      session,
      targetDay: session.day_of_week,
      targetStartTime: session.start_time,
      targetEndTime: session.end_time,
      studentMinutes: timeToMinutes(session.end_time) - timeToMinutes(session.start_time)
    });

    setSessionConflicts(prev => ({
      ...prev,
      [sessionId]: !validation.valid
    }));
  }, [sessions]);

  const handleDragStart = useCallback((session: any, event: DragEvent) => {
    setDraggedSession(session);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedSession(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent, slotKey: string) => {
    if (!draggedSession) return;
    
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(slotKey);
  }, [draggedSession]);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  // Helper function for time conversion
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

  const handleDrop = useCallback(async (event: React.DragEvent, slotKey: string, targetTime: string) => {
    event.preventDefault();

    if (!draggedSession) return;

    // Calculate new times
    const duration = timeToMinutes(draggedSession.end_time) - timeToMinutes(draggedSession.start_time);
    const hour = parseInt(targetTime.split(':')[0]);
    const isPM = targetTime.includes('PM');
    const adjustedHour = isPM && hour !== 12 ? hour + 12 : (hour === 12 && !isPM ? 0 : hour);
    const formattedStartTime = `${adjustedHour.toString().padStart(2, '0')}:${targetTime.split(':')[1].split(' ')[0]}:00`;
    const newEndTime = addMinutesToTime(formattedStartTime, duration);

    // Check if this is actually a move (not dropping on the same slot)
    if (draggedSession.start_time === formattedStartTime) {
      handleDragEnd();
      return;
    }

    // Apply optimistic update immediately for smooth UX
    optimisticUpdate(draggedSession.id, {
      start_time: formattedStartTime,
      end_time: newEndTime
    });

    try {
      // Perform the update without validation blocking
      const result = await sessionUpdateService.updateSessionTime(
        draggedSession.id,
        draggedSession.day_of_week,
        formattedStartTime,
        newEndTime
      );

      if (!result.success) {
        console.error('Failed to move session:', result.error);
        // Revert optimistic update on failure
        optimisticUpdate(draggedSession.id, {
          start_time: draggedSession.start_time,
          end_time: draggedSession.end_time
        });
      } else if (result.hasConflicts && result.conflicts) {
        // Show warning dialog for conflicts
        const conflictMessages = result.conflicts.map(c => `- ${c.description}`).join('\n');
        const confirmMessage = `Warning: This placement has conflicts:\n\n${conflictMessages}\n\nDo you want to proceed anyway?`;
        
        if (!confirm(confirmMessage)) {
          // User cancelled - revert the optimistic update and the database change
          optimisticUpdate(draggedSession.id, {
            start_time: draggedSession.start_time,
            end_time: draggedSession.end_time
          });
          
          // Revert the database change
          await sessionUpdateService.updateSessionTime(
            draggedSession.id,
            draggedSession.day_of_week,
            draggedSession.start_time,
            draggedSession.end_time
          );
        }
      }

      // Check conflicts ONLY for the moved session
      await checkSessionConflicts(draggedSession.id);

    } catch (error) {
      console.error('Error during session move:', error);
    } finally {
      handleDragEnd();
    }
  }, [draggedSession, handleDragEnd, optimisticUpdate, checkSessionConflicts, timeToMinutes, addMinutesToTime]);

  // Group sessions by day and time
  const sessionsByDayTime = React.useMemo(() => {
    const grouped: Record<string, any[]> = {}; // Note: now stores arrays of sessions

    sessions.forEach((session) => {
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
      .filter(([key, sessions]) => Array.isArray(sessions) && sessions.length > 2)
      .map(([key, sessions]) => ({
        key,
        count: (sessions as any[]).length,
        times: (sessions as any[]).map(s => s.start_time)
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
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">
          Today's Schedule
        </h2>
        <SchoolFilterToggle
          selectedSchool={selectedSchoolFilter}
          availableSchools={availableSchools}
          worksAtMultiple={worksAtMultipleSchools}
          onSchoolChange={setSelectedSchoolFilter}
        />
      </div>

      <div className="space-y-4">
        {[0].map(dayOffset => {
          const currentDate = addDays(startDay, dayOffset);
          const dayIndex = currentDate.getDay() - 1; // 0 = Monday
          const isToday = format(currentDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

          // Skip weekends
          if (dayIndex < 0 || dayIndex > 4) return null;

          return (
            <div key={dayOffset} className={`border rounded-lg ${isToday ? 'border-blue-400' : 'border-gray-200'}`}>
              <div className="px-3 py-2 font-medium text-sm bg-gray-50">
                {format(currentDate, 'EEEE, MMM d')}
              </div>

              <div className="grid grid-cols-2 divide-x divide-gray-200">
                {/* Morning */}
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-600 mb-1">Morning</div>
                  {MORNING_SLOTS.map((time, slotIndex) => {
                    const timeIndex = TIME_SLOTS.findIndex(slot => slot === time);
                    const sessionKey = `${dayIndex}-${timeIndex}`;
                    const sessionsInSlot = sessionsByDayTime[sessionKey] || [];

                    return (
                      <div
                        key={time}
                        className={cn(
                          "text-xs mb-1 p-1 rounded transition-colors",
                          dropTarget === sessionKey && "ring-2 ring-blue-400 bg-blue-50"
                        )}
                        onDragOver={(e) => handleDragOver(e, sessionKey)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, sessionKey, time)}
                      >
                        <div className="flex items-center min-h-[24px]">
                          <span className="text-gray-500 flex-shrink-0">{time}:</span>
                          <span className="ml-1 flex items-center flex-wrap">
                          {(() => {
                            const holidayCheck = isHoliday(currentDate);
                            if (holidayCheck.isHoliday) {
                              return <span className="text-red-600 font-medium">Holiday!</span>;
                            }
                            
                            // Check for calendar events at this time
                            const dateStr = format(currentDate, 'yyyy-MM-dd');
                            const timeEvents = calendarEvents.filter(event => {
                              if (event.date !== dateStr) return false;
                              if (event.all_day) return true;
                              if (!event.start_time) return false;
                              
                              const eventTimeIndex = getTimeSlotIndex(event.start_time);
                              return eventTimeIndex === timeIndex;
                            });
                            
                            if (sessionsInSlot.length === 0 && timeEvents.length === 0) {
                              // Show preview if this is the drop target
                              if (dropTarget === sessionKey && draggedSession) {
                                return (
                                  <span className="text-blue-600 text-xs italic">
                                    Moving {students[draggedSession.student_id]?.initials || 'session'} here
                                  </span>
                                );
                              }
                              return <span className="text-gray-400">-</span>;
                            }
                            // Display both sessions and calendar events
                            const allItems = [...sessionsInSlot];
                            
                            return (
                              <>
                                {timeEvents.map((event) => (
                                  <span key={`event-${event.id}`} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs mr-1 mb-1"
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
                                    title={event.description || event.title}
                                  >
                                    {event.title.length > 20 ? event.title.slice(0, 20) + '...' : event.title}
                                  </span>
                                ))}
                                {sessionsInSlot.map((session) => (
                              <DraggableSessionBox
                                key={session.id}
                                session={session}
                                student={{
                                  initials: students[session.student_id]?.initials || 'S',
                                  grade_level: students[session.student_id]?.grade_level || '',
                                  id: session.student_id
                                }}
                                isSeaSession={session.delivered_by === 'sea'}
                                canEdit={canEditSession(session)}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                size="small"
                                variant="pill"
                                hasConflict={sessionConflicts[session.id] || false}
                              />
                            ))}
                              </>
                            );
                          })()}
                        </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Afternoon */}
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-600 mb-1">Afternoon</div>
                  {AFTERNOON_SLOTS.map((time, slotIndex) => {
                    const timeIndex = TIME_SLOTS.findIndex(slot => slot === time);
                    const sessionKey = `${dayIndex}-${timeIndex}`;
                    const sessionsInSlot = sessionsByDayTime[sessionKey] || [];

                    return (
                      <div
                        key={time}
                        className={cn(
                          "text-xs mb-1 p-1 rounded transition-colors",
                          dropTarget === sessionKey && "ring-2 ring-blue-400 bg-blue-50"
                        )}
                        onDragOver={(e) => handleDragOver(e, sessionKey)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, sessionKey, time)}
                      >
                        <div className="flex items-center min-h-[24px]">
                          <span className="text-gray-500 flex-shrink-0">{time}:</span>
                          <span className="ml-1 flex items-center flex-wrap">
                          {(() => {
                            const holidayCheck = isHoliday(currentDate);
                            if (holidayCheck.isHoliday) {
                              return <span className="text-red-600 font-medium">Holiday!</span>;
                            }
                            
                            // Check for calendar events at this time
                            const dateStr = format(currentDate, 'yyyy-MM-dd');
                            const timeEvents = calendarEvents.filter(event => {
                              if (event.date !== dateStr) return false;
                              if (event.all_day) return true;
                              if (!event.start_time) return false;
                              
                              const eventTimeIndex = getTimeSlotIndex(event.start_time);
                              return eventTimeIndex === timeIndex;
                            });
                            
                            if (sessionsInSlot.length === 0 && timeEvents.length === 0) {
                              // Show preview if this is the drop target
                              if (dropTarget === sessionKey && draggedSession) {
                                return (
                                  <span className="text-blue-600 text-xs italic">
                                    Moving {students[draggedSession.student_id]?.initials || 'session'} here
                                  </span>
                                );
                              }
                              return <span className="text-gray-400">-</span>;
                            }
                            // Display both sessions and calendar events
                            const allItems = [...sessionsInSlot];
                            
                            return (
                              <>
                                {timeEvents.map((event) => (
                                  <span key={`event-${event.id}`} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs mr-1 mb-1"
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
                                    title={event.description || event.title}
                                  >
                                    {event.title.length > 20 ? event.title.slice(0, 20) + '...' : event.title}
                                  </span>
                                ))}
                                {sessionsInSlot.map((session) => (
                              <DraggableSessionBox
                                key={session.id}
                                session={session}
                                student={{
                                  initials: students[session.student_id]?.initials || 'S',
                                  grade_level: students[session.student_id]?.grade_level || '',
                                  id: session.student_id
                                }}
                                isSeaSession={session.delivered_by === 'sea'}
                                canEdit={canEditSession(session)}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                size="small"
                                variant="pill"
                                hasConflict={sessionConflicts[session.id] || false}
                              />
                            ))}
                              </>
                            );
                          })()}
                        </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}