"use client";

import React from "react";
import { format, startOfWeek, addDays, isWeekend, parse } from "date-fns";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
// Compact time slots - only 30-minute intervals from 8 AM to 3 PM
const TIME_SLOTS = [
  "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM",
  "2:00 PM", "2:30 PM", "3:00 PM"
];

export function WeeklyView() {
  const today = new Date();
  const weekStart = isWeekend(today)
    ? startOfWeek(addDays(today, 7), { weekStartsOn: 1 })
    : startOfWeek(today, { weekStartsOn: 1 });

  const [sessions, setSessions] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    const supabase = createClientComponentClient();

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

        // Fetch schedule sessions
        const { data: sessionData, error: sessionError } = await supabase
          .from("schedule_sessions")
          .select("id, day_of_week, start_time, end_time, student_id")
          .eq("provider_id", user.id)
          .gte("day_of_week", 1)
          .lte("day_of_week", 5)
          .order("day_of_week")
          .order("start_time");

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
            .select("id, initials")
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
  }, []); // Empty dependency array - only run once on mount

  // Helper functions
  const getDayIndex = (session: any): number => {
    // The session already has day_of_week from database (1 = Monday, 5 = Friday)
    // Return it adjusted for 0-based array indexing
    return session.day_of_week - 1; // Returns 0-4 for Monday-Friday
  };

  const getTimeSlotIndex = (timeString: string) => {
    const time = parse(timeString, "HH:mm:ss", new Date());
    const hours = time.getHours();
    const minutes = time.getMinutes();

    // Round to nearest 30-minute slot
    let roundedHours = hours;
    let roundedMinutes;

    if (minutes < 15) {
      roundedMinutes = 0;
    } else if (minutes < 45) {
      roundedMinutes = 30;
    } else {
      roundedMinutes = 0;
      roundedHours = hours + 1;
    }

    // Create a new date with rounded time
    const roundedTime = new Date();
    roundedTime.setHours(roundedHours, roundedMinutes, 0);
    const formattedTime = format(roundedTime, "h:mm a");

    return TIME_SLOTS.findIndex((slot) => slot === formattedTime);
  };

  const getSessionSpan = (startTime: string, endTime: string) => {
    const start = parse(startTime, "HH:mm:ss", new Date());
    const end = parse(endTime, "HH:mm:ss", new Date());
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    return Math.ceil(durationMinutes / 30);
  };

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
      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          2-Day Schedule
        </h2>
      </div>

      <div className="space-y-4">
        {[0, 1].map(dayOffset => {
          const currentDate = addDays(startDay, dayOffset);
          const dayIndex = currentDate.getDay() - 1; // 0 = Monday
          const isToday = format(currentDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

          // Skip weekends
          if (dayIndex < 0 || dayIndex > 4) return null;

          return (
            <div key={dayOffset} className={`border rounded-lg ${isToday ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
              <div className={`px-3 py-2 font-medium text-sm ${isToday ? 'bg-blue-100' : 'bg-gray-50'}`}>
                {format(currentDate, 'EEEE, MMM d')}
                {isToday && <span className="ml-2 text-xs text-blue-600">(Today)</span>}
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
                      <div key={time} className="text-xs mb-1">
                        <span className="text-gray-500">{time}:</span>
                        <span className="ml-1 text-blue-700">
                          {sessionsInSlot.length > 0 
                            ? sessionsInSlot.map((session, i) => (
                                <span key={session.id}>
                                  {students[session.student_id]?.initials || 'S'}
                                  {i < sessionsInSlot.length - 1 && ', '}
                                </span>
                              ))
                            : <span className="text-gray-400">-</span>
                          }
                        </span>
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
                      <div key={time} className="text-xs mb-1">
                        <span className="text-gray-500">{time}:</span>
                        <span className="ml-1 text-blue-700">
                          {sessionsInSlot.length > 0 
                            ? sessionsInSlot.map((session, i) => (
                                <span key={session.id}>
                                  {students[session.student_id]?.initials || 'S'}
                                  {i < sessionsInSlot.length - 1 && ', '}
                                </span>
                              ))
                            : <span className="text-gray-400">-</span>
                          }
                        </span>
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