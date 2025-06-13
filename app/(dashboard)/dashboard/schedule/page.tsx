"use client";

import React, { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardBody } from "../../../components/ui/card";
import { RescheduleAll } from "../../../components/schedule/reschedule-all";

interface Student {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
  sessions_per_week: number;
  minutes_per_session: number;
}

interface ScheduleSession {
  id: string;
  student_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  service_type: string;
}

interface BellSchedule {
  id: string;
  grade_level: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  period_name: string;
}

interface SpecialActivity {
  id: string;
  teacher_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  activity_name: string;
}

export default function SchedulePage() {
  const [providerRole, setProviderRole] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [bellSchedules, setBellSchedules] = useState<BellSchedule[]>([]);
  const [specialActivities, setSpecialActivities] = useState<SpecialActivity[]>(
    [],
  );
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClientComponentClient();

  // Helper function to format time for display
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Fetch all data
  const fetchData = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      console.log("Fetching data for user:", user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile) {
        setProviderRole(profile.role);
        console.log("Provider role:", profile.role);
      }

      const [studentsData, bellData, activitiesData, sessionsData] =
        await Promise.all([
          supabase.from("students").select("*").eq("provider_id", user.id),
          supabase
            .from("bell_schedules")
            .select("*")
            .eq("provider_id", user.id),
          supabase
            .from("special_activities")
            .select("*")
            .eq("provider_id", user.id),
          supabase
            .from("schedule_sessions")
            .select("*")
            .eq("provider_id", user.id),
        ]);

      console.log("Fetched data:", {
        students: studentsData.data?.length || 0,
        bellSchedules: bellData.data?.length || 0,
        specialActivities: activitiesData.data?.length || 0,
        sessions: sessionsData.data?.length || 0,
        sessionDetails: sessionsData.data,
      });

      if (studentsData.data) setStudents(studentsData.data);
      if (bellData.data) setBellSchedules(bellData.data);
      if (activitiesData.data) setSpecialActivities(activitiesData.data);
      if (sessionsData.data) setSessions(sessionsData.data);

      // Debug: Count sessions per student
      const sessionsByStudent = new Map<string, number>();
      sessionsData.data?.forEach((session) => {
        const count = sessionsByStudent.get(session.student_id) || 0;
        sessionsByStudent.set(session.student_id, count + 1);
      });

      console.log("Sessions per student:");
      sessionsByStudent.forEach((count, studentId) => {
        const student = studentsData.data?.find((s) => s.id === studentId);
        console.log(`${student?.initials || studentId}: ${count} sessions`);
      });
      console.log("All sessions with times:");
      sessionsData.data?.forEach((session) => {
        const student = studentsData.data?.find(
          (s) => s.id === session.student_id,
        );
        console.log(
          `${student?.initials}: Day ${session.day_of_week}, ${session.start_time} - ${session.end_time}`,
        );
      });
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Add this after the existing useEffect
  const [unscheduledCount, setUnscheduledCount] = useState(0);

  // Check for unscheduled sessions
  const checkUnscheduledSessions = async () => {
    try {
      const { getUnscheduledSessionsCount } = await import(
        "../../../../lib/supabase/queries/schedule-sessions"
      );
      const count = await getUnscheduledSessionsCount();
      setUnscheduledCount(count);
    } catch (error) {
      console.error("Error checking unscheduled sessions:", error);
    }
  };

  useEffect(() => {
    if (!loading) {
      checkUnscheduledSessions();
    }
  }, [loading, sessions]);

  // Handle session deletion
  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("Are you sure you want to remove this session?")) {
      return;
    }

    const { error } = await supabase
      .from("schedule_sessions")
      .delete()
      .eq("id", sessionId);

    if (error) {
      alert("Failed to delete session: " + error.message);
    } else {
      fetchData();
    }
  };

  // Define days and time slots
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const timeSlots = Array.from({ length: 16 }, (_, i) => {
    const hour = 8 + Math.floor(i / 2);
    const minute = (i % 2) * 30;
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Weekly Schedule
              </h1>
              <p className="text-gray-600">View and manage sessions</p>
            </div>
            <RescheduleAll
              onComplete={() => {
                fetchData();
                checkUnscheduledSessions();
              }}
            />
          </div>

          {/* Unscheduled Sessions Notification */}
          {unscheduledCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center">
                <svg
                  className="h-5 w-5 text-amber-400 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">
                    {unscheduledCount} session
                    {unscheduledCount !== 1 ? "s" : ""} need
                    {unscheduledCount === 1 ? "s" : ""} to be scheduled
                  </p>
                  <p className="text-sm text-amber-700">
                    Click "Re-schedule All Sessions" to update your schedule
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Color Key Legend */}
        <div className="mb-6 bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Grade Levels
          </h3>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-400 rounded"></div>
              <span className="text-sm text-gray-600">Kindergarten</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-sky-400 rounded"></div>
              <span className="text-sm text-gray-600">1st Grade</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-cyan-400 rounded"></div>
              <span className="text-sm text-gray-600">2nd Grade</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-emerald-400 rounded"></div>
              <span className="text-sm text-gray-600">3rd Grade</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-400 rounded"></div>
              <span className="text-sm text-gray-600">4th Grade</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-rose-400 rounded"></div>
              <span className="text-sm text-gray-600">5th Grade</span>
            </div>
          </div>
        </div>

        {/* Schedule Grid */}
        <Card>
          <CardBody className="p-0">
            {/* Grid Header */}
            <div className="grid grid-cols-6 bg-gray-50 border-b">
              <div className="p-3 font-semibold text-gray-700 text-center border-r">
                Time
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  className="p-3 font-semibold text-gray-700 text-center border-r last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Body */}
            <div className="grid grid-cols-6">
              {/* Time Column */}
              <div>
                {timeSlots.map((time) => (
                  <div
                    key={time}
                    className="p-2 text-xs text-gray-500 text-center bg-gray-50 border-r border-b font-medium h-[60px] flex items-center justify-center"
                  >
                    {formatTime(time)}
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {days.map((day, dayIndex) => {
                // Get all sessions for this day
                const daySessions = sessions.filter(s => s.day_of_week === dayIndex + 1);

                // Pre-calculate column positions for all sessions
                const sessionColumns = new Map<string, number>();

                // Sort sessions by start time
                const sortedSessions = [...daySessions].sort((a, b) => {
                  const aStart = a.start_time.substring(0, 5);
                  const bStart = b.start_time.substring(0, 5);
                  return aStart.localeCompare(bStart);
                });

                // For each session, find which column it should go in
                sortedSessions.forEach(session => {
                  const startTime = session.start_time.substring(0, 5);
                  const endTime = session.end_time.substring(0, 5);

                  // Check each column (0-3) to find the first available one
                  for (let col = 0; col < 4; col++) {
                    // Check if this column is free for this time slot
                    const columnOccupied = sortedSessions.some(otherSession => {
                      // Skip if it's the same session or hasn't been assigned yet
                      if (otherSession.id === session.id || !sessionColumns.has(otherSession.id)) {
                        return false;
                      }

                      // Skip if it's in a different column
                      if (sessionColumns.get(otherSession.id) !== col) {
                        return false;
                      }

                      // Check if times overlap
                      const otherStart = otherSession.start_time.substring(0, 5);
                      const otherEnd = otherSession.end_time.substring(0, 5);

                      // Convert to minutes for easier comparison
                      const sessionStartMin = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
                      const sessionEndMin = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
                      const otherStartMin = parseInt(otherStart.split(':')[0]) * 60 + parseInt(otherStart.split(':')[1]);
                      const otherEndMin = parseInt(otherEnd.split(':')[0]) * 60 + parseInt(otherEnd.split(':')[1]);

                      // Check if they overlap
                      return !(sessionEndMin <= otherStartMin || sessionStartMin >= otherEndMin);
                    });

                    if (!columnOccupied) {
                      sessionColumns.set(session.id, col);
                      break;
                    }
                  }
                });

                return (
                  <div key={day} className="border-r last:border-r-0 relative">
                    {/* Create a relative container for absolute positioning */}
                    <div className="relative" style={{ height: `${timeSlots.length * 60}px` }}>
                      {daySessions.map((session) => {
                        const student = students.find(s => s.id === session.student_id);
                        const startTime = session.start_time.substring(0, 5);
                        const endTime = session.end_time.substring(0, 5);

                        // Calculate position and height
                        const [startHour, startMin] = startTime.split(':').map(Number);
                        const [endHour, endMin] = endTime.split(':').map(Number);

                        const startMinutes = (startHour - 8) * 60 + startMin;
                        const endMinutes = (endHour - 8) * 60 + endMin;
                        const duration = endMinutes - startMinutes;

                        const top = (startMinutes / 30) * 60;
                        const height = (duration / 30) * 60;

                        const gradeColorMap: { [key: string]: string } = {
                          'K': 'bg-purple-400 hover:bg-purple-500',
                          '1': 'bg-sky-400 hover:bg-sky-500',
                          '2': 'bg-cyan-400 hover:bg-cyan-500',
                          '3': 'bg-emerald-400 hover:bg-emerald-500',
                          '4': 'bg-amber-400 hover:bg-amber-500',
                          '5': 'bg-rose-400 hover:bg-rose-500'
                        };

                        const gradeColor = student ? gradeColorMap[student.grade_level] || 'bg-gray-400' : 'bg-gray-400';

                        // Get pre-calculated column position
                        const columnIndex = sessionColumns.get(session.id) ?? 0;

                        const fixedWidth = 28;
                        const gap = 1;
                        const leftOffset = columnIndex * (fixedWidth + gap);

                        return (
                          <div
                            key={session.id}
                            className={`absolute ${gradeColor} text-white rounded shadow-sm transition-all hover:shadow-md hover:z-10 group`}
                            style={{
                              top: `${top}px`,
                              height: `${height - 2}px`,
                              left: `${leftOffset + 2}px`,
                              width: `${fixedWidth}px`,
                              padding: '2px'
                            }}
                          >
                            <div className="flex flex-col h-full">
                              <div className="font-medium text-[10px]">{student?.initials}</div>
                              {height > 40 && (
                                <div className="text-[9px] opacity-90">{duration}m</div>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteSession(session.id)}
                              className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white hover:bg-red-600"
                              title="Remove session"
                            >
                              <span className="text-xs leading-none">×</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Time slot borders */}
                    {timeSlots.map((_, idx) => (
                      <div key={idx} className="h-[60px] border-b last:border-b-0" />
                    ))}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
