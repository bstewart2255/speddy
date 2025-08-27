"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMemo } from "react";
import { createClient } from '@/lib/supabase/client';
import { Card, CardBody } from "../../../components/ui/card";
import { UndoSchedule } from "../../../components/schedule/undo-schedule";
import { DEFAULT_SCHEDULING_CONFIG } from "../../../../lib/scheduling/scheduling-config";
import { SessionAssignmentPopup } from "./session-assignment-popup";
// import { ConflictResolver } from '../../../../lib/scheduling/conflict-resolver';
import { useSchool } from '../../../components/providers/school-context';
import { ScheduleSessions } from "../../../components/schedule/schedule-sessions";
import { getSchoolHours } from '../../../../lib/supabase/queries/school-hours';
import { sessionUpdateService } from '../../../../lib/services/session-update-service';
import { useSchedulingData } from '../../../../lib/supabase/hooks/use-scheduling-data';

interface Student {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
  sessions_per_week: number;
  minutes_per_session: number;
  school_site: string | null;
  school_district: string | null;
  // Future structured IDs
  school_id?: string | null;
  district_id?: string | null;
  state_id?: string | null;
  provider_id: string;
}

interface ScheduleSession {
  id: string;
  student_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  service_type: string;
  assigned_to_sea_id: string | null;
  assigned_to_specialist_id?: string | null;
  delivered_by: 'provider' | 'sea' | 'specialist';
  completed_at: string | null;
  completed_by: string | null;
  session_notes: string | null;
}

interface BellSchedule {
  id: string;
  grade_level: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  period_name: string;
  school_site: string;
  school_district?: string;
  // Future structured IDs
  school_id?: string | null;
  district_id?: string | null;
}

interface SpecialActivity {
  id: string;
  teacher_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  activity_name: string;
  school_site: string;
  school_district?: string;
  // Future structured IDs
  school_id?: string | null;
  district_id?: string | null;
}

// Helper function to convert time to minutes
const timeToMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export default function SchedulePage() {
  const [providerRole, setProviderRole] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [bellSchedules, setBellSchedules] = useState<BellSchedule[]>([]);
  const [specialActivities, setSpecialActivities] = useState<SpecialActivity[]>(
    [],
  );
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Use the new scheduling data hook
  const {
    getExistingSessions,
    getBellScheduleConflicts,
    getSpecialActivityConflicts,
    isSlotAvailable,
    getSlotCapacity,
    refresh: refreshSchedulingData,
    isInitialized: isDataManagerInitialized,
    isLoading: isDataManagerLoading,
    error: dataManagerError,
    isCacheStale,
    metrics
  } = useSchedulingData();
  const [highlightedStudentId, setHighlightedStudentId] = useState<
    string | null
  >(null);
  const [draggedSession, setDraggedSession] = useState<ScheduleSession | null>(
    null,
  );
  const [dragOffset, setDragOffset] = useState<number>(0); // Store the offset from the top of the session block
  const [conflictSlots, setConflictSlots] = useState<Set<string>>(new Set());
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(
    new Set(["K", "1", "2", "3", "4", "5"]),
  );
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSession, setSelectedSession] =
    useState<ScheduleSession | null>(null);
  const [popupPosition, setPopupPosition] = useState<DOMRect | null>(null);
  const [sessionFilter, setSessionFilter] = useState<"all" | "mine" | "sea">(
    "all",
  );
  const [seaProfiles, setSeaProfiles] = useState<
    Array<{ id: string; full_name: string }>
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [schoolHours, setSchoolHours] = useState<any[]>([]);
  const [showSchoolHours, setShowSchoolHours] = useState(true);
  const [sessionTags, setSessionTags] = useState<Record<string, string>>({});
  
  
  const latestDragPositionRef = useRef<string | null>(null);
  const conflictCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { currentSchool } = useSchool();
  const supabase = createClient();
  const studentMap = useMemo(
    () => new Map(Array.isArray(students) ? students.map((s) => [s.id, s]) : []),
    [students],
  );
  

  const GRID_START_HOUR = DEFAULT_SCHEDULING_CONFIG.gridStartHour;
  const GRID_END_HOUR = DEFAULT_SCHEDULING_CONFIG.gridEndHour;
  const PIXELS_PER_HOUR = DEFAULT_SCHEDULING_CONFIG.pixelsPerHour;
  const SNAP_INTERVAL = DEFAULT_SCHEDULING_CONFIG.snapInterval;
  const TOTAL_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * PIXELS_PER_HOUR;
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  const weekDays = useMemo(() => [
    { name: "Monday", number: 1 },
    { name: "Tuesday", number: 2 },
    { name: "Wednesday", number: 3 },
    { name: "Thursday", number: 4 },
    { name: "Friday", number: 5 },
  ], []);

  //... Inside your useMemo hook
  const daySessionColumns = useMemo(() => {
    const memoStartTime = performance.now();
    console.log('[daySessionColumns] Recalculating at:', new Date().toISOString());

    const columns: Record<number, Array<Array<ScheduleSession>>> = {};
    weekDays.forEach((day) => {
      const daySessions = sessions.filter((s) => s.day_of_week === day.number);
      if (daySessions.length === 0) {
        columns[day.number] = [];
        return;
      }

      // Sort sessions by start time
      daySessions.sort((a, b) => {
        const timeA = parseInt(a.start_time.replace(":", ""));
        const timeB = parseInt(b.start_time.replace(":", ""));
        return timeA - timeB;
      });

      // Group overlapping sessions into columns
      const sessionColumns: Array<Array<ScheduleSession>> = [];

      daySessions.forEach((session) => {
        const sessionStart = parseInt(session.start_time.replace(":", ""));
        const sessionEnd = parseInt(session.end_time.replace(":", ""));

        // Find a column where this session doesn't overlap
        let placed = false;
        for (let col = 0; col < sessionColumns.length; col++) {
          const canPlace = sessionColumns[col].every((existingSession) => {
            const existingStart = parseInt(
              existingSession.start_time.replace(":", ""),
            );
            const existingEnd = parseInt(
              existingSession.end_time.replace(":", ""),
            );
            return sessionEnd <= existingStart || sessionStart >= existingEnd;
          });

          if (canPlace) {
            sessionColumns[col].push(session);
            placed = true;
            break;
          }
        }

        // If no column found, create a new one
        if (!placed) {
          sessionColumns.push([session]);
        }
      });

      columns[day.number] = sessionColumns;
    });

    const memoEndTime = performance.now();
    console.log('[daySessionColumns] Calculation completed at:', new Date().toISOString());
    console.log('[daySessionColumns] Calculation time:', memoEndTime - memoStartTime, 'ms');

    return columns;
  }, [sessions]);

  // Helper function to format time for display
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Filter sessions based on current filter
  const getFilteredSessions = (allSessions: ScheduleSession[]) => {
    switch (sessionFilter) {
      case "mine":
        return allSessions.filter((session) => session.delivered_by !== "sea");
      case "sea":
        return allSessions.filter((session) => session.delivered_by === "sea");
      case "all":
      default:
        return allSessions;
    }
  };

  // Removed checkSlotConflicts function - now using comprehensive validation from sessionUpdateService

  // Helper function to check time overlap
  const hasTimeOverlap = (
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean => {
    const start1Min = timeToMinutes(start1);
    const end1Min = timeToMinutes(end1);
    const start2Min = timeToMinutes(start2);
    const end2Min = timeToMinutes(end2);

    return !(end1Min <= start2Min || start1Min >= end2Min);
  };

  // Helper to get school hours for a specific day and grade
  const getSchoolHoursForDay = (day: number, grade: string, sessionTime?: string) => {
    // For K and TK, check if there are AM/PM specific schedules
    if ((grade === 'K' || grade === 'TK') && sessionTime) {
      const sessionHour = parseInt(sessionTime.split(':')[0]);
      const isAM = sessionHour < 12;

      // Try to find AM/PM specific schedule first
      const amPmGrade = `${grade}-${isAM ? 'AM' : 'PM'}`;
      const amPmHours = schoolHours.find(h => 
        h.day_of_week === day && h.grade_level === amPmGrade
      );

      if (amPmHours) {
        return {
          start: amPmHours.start_time.substring(0, 5),
          end: amPmHours.end_time.substring(0, 5)
        };
      }
    }

    // Fall back to regular grade hours
    const hours = schoolHours.find(h => 
      h.day_of_week === day && 
      (h.grade_level === grade || (h.grade_level === 'default' && !['TK', 'K'].includes(grade)))
    );

    if (!hours) {
      return { start: '08:00', end: '15:00' }; // Default fallback
    }

    return {
      start: hours.start_time.substring(0, 5),
      end: hours.end_time.substring(0, 5)
    };
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, session: ScheduleSession) => {
    setDraggedSession(session);
    e.dataTransfer.effectAllowed = "move";
    
    // Calculate the offset from the top of the session block to where the user clicked
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    setDragOffset(offsetY);
  };

  // Handle drag end
  const handleDragEnd = () => {
    // Clear any pending conflict checks
    if (conflictCheckTimeoutRef.current) {
      clearTimeout(conflictCheckTimeoutRef.current);
      conflictCheckTimeoutRef.current = null;
    }

    setDraggedSession(null);
    setConflictSlots(new Set());
    setDragPosition(null);
    latestDragPositionRef.current = null;
    setDragOffset(0);
  };

  // Track the current drag position
  const [dragPosition, setDragPosition] = useState<{
    day: number;
    time: string;
    pixelY: number;
  } | null>(null);

  const handleDragOver = (e: React.DragEvent, day: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (!draggedSession) return;

    // Update position immediately for visual feedback
    const rect = e.currentTarget.getBoundingClientRect();
    // Adjust for the drag offset to align with the ghost preview
    const relativeY = e.clientY - rect.top - dragOffset;
    const snapInterval = SNAP_INTERVAL;
    const minutesFromStart = Math.round(((relativeY / PIXELS_PER_HOUR) * 60) / snapInterval) * snapInterval;
    const time = pixelsToTime((minutesFromStart * PIXELS_PER_HOUR) / 60);

    setDragPosition({
      day,
      time,
      pixelY: (minutesFromStart * PIXELS_PER_HOUR) / 60,
    });

    // Get student info
    const student = students.find(s => s.id === draggedSession.student_id);
    if (!student) return;

    const [hours, minutes] = time.split(":");
    const startTimeStr = `${hours}:${minutes}:00`;
    const endTime = new Date();
    endTime.setHours(parseInt(hours), parseInt(minutes) + student.minutes_per_session, 0);
    const endTimeStr = `${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}:00`;

    // Use comprehensive validation for visual feedback
    const conflictKey = `${day}-${time}`;
    
    // Cancel any pending validation checks
    if (conflictCheckTimeoutRef.current) {
      clearTimeout(conflictCheckTimeoutRef.current);
    }
    
    // Debounce the comprehensive validation to avoid excessive API calls
    conflictCheckTimeoutRef.current = setTimeout(async () => {
      try {
        // Find the full session data from sessions array
        const fullSession = sessions.find(s => s.id === draggedSession.id);
        if (!fullSession) {
          console.error('Could not find full session data for validation');
          return;
        }
        
        const validation = await sessionUpdateService.validateSessionMove({
          session: fullSession as any, // Cast to any to handle type mismatch
          targetDay: day,
          targetStartTime: startTimeStr,
          targetEndTime: endTimeStr,
          studentMinutes: student.minutes_per_session
        });
        
        // Update visual feedback based on comprehensive validation
        if (!validation.valid) {
          setConflictSlots(new Set([conflictKey]));
        } else {
          setConflictSlots(new Set());
        }
      } catch (error) {
        console.error('Error during drag-over validation:', error);
        // On error, don't show conflict indicator
        setConflictSlots(new Set());
      }
    }, 150); // 150ms debounce to balance responsiveness with performance
  };

  // Handle drop
  const handleDrop = async (e: React.DragEvent, day: number) => {
    e.preventDefault();

    if (!draggedSession || !dragPosition || dragPosition.day !== day) return;

    const student = studentMap.get(draggedSession.student_id);
    if (!student) return;

    // Clear drag state immediately
    const sessionToMove = draggedSession;
    setDraggedSession(null);
    setConflictSlots(new Set());
    setDragPosition(null);

    // Cancel any pending conflict checks
    if (conflictCheckTimeoutRef.current) {
      clearTimeout(conflictCheckTimeoutRef.current);
    }

    // Calculate new times
    const newStartTime = dragPosition.time;
    const [hours, minutes] = newStartTime.split(":").map(Number);
    const endDate = new Date();
    endDate.setHours(hours, minutes + student.minutes_per_session, 0);
    const newEndTime = `${endDate.getHours().toString().padStart(2, "0")}:${endDate.getMinutes().toString().padStart(2, "0")}:00`;
    const newStartTimeWithSeconds = `${newStartTime}:00`;

    // Apply optimistic update immediately for smooth UX
    setSessions(prev => prev.map(s => 
      s.id === sessionToMove.id 
        ? { ...s, day_of_week: day, start_time: newStartTimeWithSeconds, end_time: newEndTime }
        : s
    ));

    // Call updateSessionTime which now includes comprehensive validation
    const result = await sessionUpdateService.updateSessionTime(
      sessionToMove.id,
      day,
      newStartTimeWithSeconds,
      newEndTime
    );

    // Check for conflicts using the comprehensive validation results
    if (result.hasConflicts && result.conflicts) {
      const conflictMessages = result.conflicts.map(c => `- ${c.description}`).join('\n');
      const confirmMessage = `Warning: This placement has conflicts:\n\n${conflictMessages}\n\nDo you want to proceed anyway?`;
      
      if (!confirm(confirmMessage)) {
        // User cancelled - revert the optimistic update
        setSessions(prev => prev.map(s => 
          s.id === sessionToMove.id 
            ? { ...s, day_of_week: sessionToMove.day_of_week, start_time: sessionToMove.start_time, end_time: sessionToMove.end_time }
            : s
        ));
        
        // Also revert in the database
        await sessionUpdateService.updateSessionTime(
          sessionToMove.id,
          sessionToMove.day_of_week,
          sessionToMove.start_time,
          sessionToMove.end_time
        );
        return;
      }
      // User confirmed, keep the change
    }

    if (!result.success) {
      console.error('Failed to update session:', result.error);
      // Revert optimistic update on failure
      setSessions(prev => prev.map(s => 
        s.id === sessionToMove.id 
          ? { ...s, day_of_week: sessionToMove.day_of_week, start_time: sessionToMove.start_time, end_time: sessionToMove.end_time }
          : s
      ));
      alert('Failed to update session position');
    }
  };

  // Update session time in database
  const updateSessionTime = async (
    sessionId: string,
    day: number,
    startTime: string,
    duration: number,
  ) => {
    const [hours, minutes] = startTime.split(":");
    const startTimeFormatted = `${hours}:${minutes}:00`;

    const endTime = new Date();
    endTime.setHours(parseInt(hours), parseInt(minutes) + duration, 0);
    const endTimeFormatted = `${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}:00`;

    const { error } = await supabase
      .from("schedule_sessions")
      .update({
        day_of_week: day,
        start_time: startTimeFormatted,
        end_time: endTimeFormatted,
      })
      .eq("id", sessionId);

    if (error) {
      alert("Failed to move session: " + error.message);
    } else {
      // Refresh the schedule
      fetchData();
    }
  };

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Wait for currentSchool to be available
      if (!currentSchool) {
        console.log("No current school selected yet");
        setLoading(false);
        return;
      }
      
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");
      setCurrentUserId(user.id);

      // Check if current school is set
      if (!currentSchool) {
        setLoading(false);
        return;
      }

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

      // Fetch SEA profiles if user is Resource Specialist
      if (profile?.role === "resource") {
        // Get SEAs supervised by this Resource Specialist (matches team page logic)
        const { data: seasData, error } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("supervising_provider_id", user.id)
          .eq("role", "sea")
          .order("full_name", { ascending: true });

        if (error) {
          console.error("Error fetching SEA profiles:", error);
        } else if (seasData) {
          console.log(`[Schedule] Found ${seasData.length} SEAs supervised by this provider`);
          setSeaProfiles(seasData);
        }
      }

      // Log query strategy for monitoring
      const queryStrategy = currentSchool?.is_migrated ? 'optimized' : 'legacy';
      console.log(`[Schedule] Using ${queryStrategy} query strategy for school:`, currentSchool?.display_name);
      
      // Build queries with intelligent filtering
      let studentsQuery = supabase
        .from("students")
        .select("*")
        .eq("provider_id", user.id);
      
      let bellQuery = supabase
        .from("bell_schedules")
        .select("*")
        .eq("provider_id", user.id);
        
      let activitiesQuery = supabase
        .from("special_activities")
        .select("*")
        .eq("provider_id", user.id);
      
      // Apply school filters based on available data
      if (currentSchool) {
        // Use school_id for bell_schedules and special_activities (migrated tables)
        const schoolId = currentSchool.school_id;
        
        // Students table still uses school_site/school_district
        if (currentSchool.school_site) {
          studentsQuery = studentsQuery.eq("school_site", currentSchool.school_site);
        }
        if (currentSchool.school_district) {
          studentsQuery = studentsQuery.eq("school_district", currentSchool.school_district);
        }
        
        // Bell schedules and special activities now use school_id
        if (schoolId) {
          bellQuery = bellQuery.eq("school_id", schoolId);
          activitiesQuery = activitiesQuery.eq("school_id", schoolId);
        }
      }
      
      const [studentsData, bellData, activitiesData] = await Promise.all([
        studentsQuery,
        bellQuery,
        activitiesQuery
      ]);

      // Now fetch sessions separately after we have students data
      const studentIds = studentsData.data?.map(s => s.id) || [];
      const sessionsData = await supabase
        .from("schedule_sessions")
        .select("*")
        .eq("provider_id", user.id)
        .in("student_id", studentIds)
        .is("session_date", null);

      console.log("Fetched data:", {
        students: studentsData.data?.length || 0,
        bellSchedules: bellData.data?.length || 0,
        specialActivities: activitiesData.data?.length || 0,
        sessions: sessionsData.data?.length || 0,
        sessionDetails: sessionsData.data,
      });


      setStudents(studentsData.data || []);
      setBellSchedules(bellData.data || []);
      if (activitiesData.data) setSpecialActivities(activitiesData.data);
      

      // Fetch school hours with optimized query
      const hoursData = await getSchoolHours(currentSchool || undefined);
      setSchoolHours(hoursData);

      if (sessionsData.data) {
        setSessions(sessionsData.data);
        console.log("First session object:", sessionsData.data[0]);
      }

      // Debug: Count sessions per student
      const sessionsByStudent = new Map<string, number>();
      sessionsData.data?.forEach((session) => {
        const count = sessionsByStudent.get(session.student_id) || 0;
        sessionsByStudent.set(session.student_id, count + 1);
      });

      sessionsByStudent.forEach((count, studentId) => {
        const student = studentsData.data?.find((s) => s.id === studentId);
      });
      sessionsData.data?.forEach((session) => {
        const student = studentsData.data?.find(
          (s) => s.id === session.student_id,
        );
        console.log(
          `${student?.initials}: Day ${session.day_of_week}, ${session.start_time} - ${session.end_time}`,
        );
      });
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }, [currentSchool, selectedWeek, supabase]);

  // Check for unscheduled sessions
  const checkUnscheduledSessions = useCallback(async () => {
    try {
      const { getUnscheduledSessionsCount } = await import(
        "../../../../lib/supabase/queries/schedule-sessions"
      );
      const count = await getUnscheduledSessionsCount(currentSchool?.school_site);
      setUnscheduledCount(count);
    } catch (error) {
      console.error("Error checking unscheduled sessions:", error);
    }
  }, [currentSchool, currentUserId, selectedWeek, supabase]);

  useEffect(() => {
    if (currentSchool) {
      fetchData();
    }
  }, [currentSchool, fetchData]);
  
  // Sync data from data manager when it's initialized
  useEffect(() => {
    if (isDataManagerInitialized && !isDataManagerLoading) {
      // Update sessions from data manager
      const cachedSessions = getExistingSessions();
      if (cachedSessions.length > 0) {
        setSessions(cachedSessions);
        console.log('[DataManager] Loaded', cachedSessions.length, 'sessions from cache');
        console.log('[DataManager] Metrics:', metrics);
      }
      
      // Refresh if cache is stale
      if (isCacheStale) {
        refreshSchedulingData().catch(console.error);
      }
    }
  }, [isDataManagerInitialized, isDataManagerLoading, getExistingSessions, isCacheStale, metrics, refreshSchedulingData]);

  // Add this after the existing useEffect
  const [unscheduledCount, setUnscheduledCount] = useState(0);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectedSession && popupPosition) {
        // Check if the click is inside the popup
        const popupElement = document.getElementById(
          "session-assignment-popup",
        );
        if (popupElement && popupElement.contains(event.target as Node)) {
          return; // Don't close if clicking inside popup
        }

        setSelectedSession(null);
        setPopupPosition(null);
      }
    };

    if (selectedSession) {
      // Use a slight delay to avoid immediate closure
      setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);

      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [selectedSession, popupPosition]);

  useEffect(() => {
    if (!loading) {
      // Only check unscheduled sessions on initial load, not on every session change
      // This was causing performance issues during drag and drop
      // checkUnscheduledSessions();
    }
  }, [loading]); // Remove 'sessions' from the dependency array

  // Add this new useEffect after the modified one
  useEffect(() => {
    // Check unscheduled sessions only once after initial data load
    if (!loading && currentSchool) {
      checkUnscheduledSessions();
    }
  }, [loading, currentSchool, checkUnscheduledSessions]);

  // Cleanup effect for conflictCheckTimeoutRef
  useEffect(() => {
    return () => {
      if (conflictCheckTimeoutRef.current) {
        clearTimeout(conflictCheckTimeoutRef.current);
      }
    };
  }, []);

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

  // Generate 15-minute interval time markers for the left column
  const timeMarkers = Array.from(
    { length: (GRID_END_HOUR - GRID_START_HOUR) * 4 },
    (_, i) => {
      const totalMinutes = i * 15;
      const hour = GRID_START_HOUR + Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    },
  );

  // Helper function to convert time to pixels
  const timeToPixels = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const totalMinutes = (hours - GRID_START_HOUR) * 60 + minutes;
    return (totalMinutes * PIXELS_PER_HOUR) / 60;
  };

  // Helper function to convert pixels to time
  const pixelsToTime = (pixels: number): string => {
    const totalMinutes = Math.round((pixels * 60) / PIXELS_PER_HOUR);
    const hours = Math.floor(totalMinutes / 60) + GRID_START_HOUR;
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };
  

  // Helper function to check if a session overlaps with a 15-minute time slot
  const sessionOverlapsTimeSlot = (
    session: ScheduleSession,
    timeSlot: string,
  ): boolean => {
    const [slotHour, slotMinute] = timeSlot.split(":").map(Number);
    const slotStartMinutes = slotHour * 60 + slotMinute;
    const slotEndMinutes = slotStartMinutes + 15;

    const [sessionStartHour, sessionStartMinute] = session.start_time
      .split(":")
      .map(Number);
    const [sessionEndHour, sessionEndMinute] = session.end_time
      .split(":")
      .map(Number);
    const sessionStartMinutes = sessionStartHour * 60 + sessionStartMinute;
    const sessionEndMinutes = sessionEndHour * 60 + sessionEndMinute;

    return (
      sessionStartMinutes < slotEndMinutes &&
      sessionEndMinutes > slotStartMinutes
    );
  };

  if (loading) {
    return (
      <div className="bg-gray-50 flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Main Schedule
              </h1>
              <p className="text-gray-600">This schedule is the base schedule for the platform.</p>
            </div>
            <div className="flex gap-3">
              <ScheduleSessions
                onComplete={() => {
                  fetchData();
                  checkUnscheduledSessions();
                }}
                currentSchool={currentSchool}
                unscheduledCount={unscheduledCount}
              />
              <UndoSchedule
                onComplete={() => {
                  fetchData();
                  checkUnscheduledSessions();
                }}
              />
            </div>
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
                    Click &quot;Schedule Sessions&quot; above to add these sessions to your calendar
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Session Filter Controls */}
        <div className="mb-4 bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            View Sessions
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSessionFilter("all")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sessionFilter === "all"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All Sessions
            </button>
            <button
              onClick={() => setSessionFilter("mine")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sessionFilter === "mine"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              My Sessions
            </button>
            <button
              onClick={() => setSessionFilter("sea")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sessionFilter === "sea"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              SEA Sessions
            </button>
          </div>
        </div>

        {/* Color Key Legend - Interactive Filter */}
        <div className="mb-6 bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Grade Levels
          </h3>
          <div className="flex flex-wrap gap-3">
            {[
              { grade: "K", colorClass: "bg-purple-400", displayName: "K" },
              { grade: "1", colorClass: "bg-sky-400", displayName: "1st" },
              { grade: "2", colorClass: "bg-cyan-400", displayName: "2nd" },
              { grade: "3", colorClass: "bg-emerald-400", displayName: "3rd" },
              { grade: "4", colorClass: "bg-amber-400", displayName: "4th" },
              { grade: "5", colorClass: "bg-rose-400", displayName: "5th" },
            ].map(({ grade, colorClass, displayName }) => {
              const isActive = selectedGrades.has(grade);
              return (
                <button
                  key={grade}
                  onClick={() => {
                    const newSelectedGrades = new Set(selectedGrades);
                    if (newSelectedGrades.has(grade)) {
                      newSelectedGrades.delete(grade);
                    } else {
                      newSelectedGrades.add(grade);
                    }
                    setSelectedGrades(newSelectedGrades);
                  }}
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <div
                    className={`w-4 h-4 rounded ${
                      isActive ? colorClass : "bg-gray-300"
                    }`}
                  ></div>
                  <span
                    className={`text-sm ${
                      isActive ? "text-gray-600" : "text-gray-400"
                    }`}
                  >
                    {displayName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Filter Indicators for Time and Day only */}
        {(selectedTimeSlot || selectedDay) && (
          <div className="mb-4 flex gap-2 items-center flex-wrap">
            <span className="text-sm text-gray-600">Active filters:</span>

            {selectedTimeSlot && (
              <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                <span>Time: {formatTime(selectedTimeSlot)}</span>
                <button
                  onClick={() => setSelectedTimeSlot(null)}
                  className="hover:text-blue-900"
                >
                  ×
                </button>
              </div>
            )}

            {selectedDay && (
              <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                <span>Day: {days[selectedDay - 1]}</span>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="hover:text-blue-900"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}

        {/* Highlighted Student Indicator */}
        {highlightedStudentId && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg
                  className="h-5 w-5 text-blue-400 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm font-medium text-blue-800">
                  Highlighting all sessions for{" "}
                  <span className="font-bold">
                    {
                      students.find((s) => s.id === highlightedStudentId)
                        ?.initials
                    }
                  </span>
                </p>
              </div>
              <button
                onClick={() => setHighlightedStudentId(null)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Clear highlight
              </button>
            </div>
          </div>
        )}

        {/* Schedule Grid */}
        <Card>
          <CardBody className="p-0">
            {/* Grid Header */}
            <div className="grid grid-cols-6 bg-gray-50 border-b">
              <div className="p-3 font-semibold text-gray-700 text-center border-r">
                Time
              </div>
              {days.map((day, index) => (
                <div
                  key={day}
                  className={`p-3 font-semibold text-center border-r last:border-r-0 cursor-pointer transition-colors ${
                    selectedDay === index + 1
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-700 bg-gray-50 hover:bg-gray-100"
                  }`}
                  onClick={() => {
                    if (selectedDay === index + 1) {
                      setSelectedDay(null);
                    } else {
                      setSelectedDay(index + 1);
                      setSelectedTimeSlot(null); // Clear time selection when selecting day
                    }
                  }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Body */}
            <div className="grid grid-cols-6 overflow-hidden">
              {/* Time Column */}
              <div>
                {timeMarkers.map((time, index) => (
                  <div
                    key={time}
                    className="relative cursor-pointer hover:bg-gray-100 transition-colors"
                    style={{ height: `${PIXELS_PER_HOUR / 4}px` }}
                    onClick={() => {
                      if (selectedTimeSlot === time) {
                        setSelectedTimeSlot(null);
                      } else {
                        setSelectedTimeSlot(time);
                        setSelectedDay(null); // Clear day selection when selecting time
                      }
                    }}
                  >
                    <div
                      className={`absolute top-0 left-0 right-0 p-2 text-xs text-center border-r border-b font-medium ${
                        selectedTimeSlot === time
                          ? "bg-blue-100 text-blue-700 border-blue-300"
                          : "text-gray-500 bg-gray-50"
                      }`}
                    >
                      {formatTime(time)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {days.map((day, dayIndex) => {
                // Get sessions for this day based on user role and filters
                const daySessions = (() => {
                  const allDaySessions = sessions.filter(
                    (s) => s.day_of_week === dayIndex + 1,
                  );

                  // If user is SEA, only show sessions assigned to them
                  if (providerRole === "sea" && currentUserId) {
                    return allDaySessions.filter(
                      (s) => s.assigned_to_sea_id === currentUserId,
                    );
                  }

                  // For Resource Specialists and other roles, apply the existing filter
                  return getFilteredSessions(allDaySessions);
                })();

                // Pre-calculate column positions for all sessions
                const columnData = daySessionColumns[dayIndex + 1] || [];
                const sessionColumns = new Map<string, number>();

                // Flatten the column data to create the map
                columnData.forEach((column, colIndex) => {
                  column.forEach((session) => {
                    sessionColumns.set(session.id, colIndex);
                  });
                });

                return (
                  <div key={day} className="border-r last:border-r-0 relative">
                    {/* Create a relative container for absolute positioning */}
                    <div
                      className="relative"
                      style={{ height: `${timeMarkers.length * (PIXELS_PER_HOUR / 4)}px` }}
                      onDragOver={(e) => handleDragOver(e, dayIndex + 1)}
                      onDrop={(e) => handleDrop(e, dayIndex + 1)}
                    >
                      {/* School hours boundary indicators */}
                      {showSchoolHours && (() => {
                        const uniqueHours = new Map();

                        // Get unique school hours across selected grades
                        Array.from(selectedGrades).forEach(grade => {
                          const hours = getSchoolHoursForDay(dayIndex + 1, grade);
                          const key = `${hours.start}-${hours.end}`;
                          if (!uniqueHours.has(key)) {
                            uniqueHours.set(key, { ...hours, grades: [grade] });
                          } else {
                            uniqueHours.get(key).grades.push(grade);
                          }
                        });

                        return Array.from(uniqueHours.values()).map((hours, idx) => {
                          const startPixels = timeToPixels(hours.start);
                          const endPixels = timeToPixels(hours.end);
                          const height = endPixels - startPixels;

                          return (
                            <div
                              key={`boundary-${dayIndex}-${idx}`}
                              className="absolute left-0 right-0 pointer-events-none"
                              style={{
                                top: `${startPixels}px`,
                                height: `${height}px`,
                                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                                borderTop: '2px dashed rgba(59, 130, 246, 0.3)',
                                borderBottom: '2px dashed rgba(59, 130, 246, 0.3)',
                                zIndex: 0
                              }}
                            />
                          );
                        });
                      })()}
                      {/* Hour grid lines */}
                      {timeMarkers.map((_, index) => (
                        <div
                          key={index}
                          className="absolute w-full border-b border-gray-100"
                          style={{ top: `${index * PIXELS_PER_HOUR}px` }}
                        />
                      ))}

                      {/* Half-hour grid lines */}
                      {timeMarkers.slice(0, -1).map((_, index) => (
                        <div
                          key={`half-${index}`}
                          className="absolute w-full border-b border-gray-50"
                          style={{
                            top: `${index * PIXELS_PER_HOUR + PIXELS_PER_HOUR / 2}px`,
                          }}
                        />
                      ))}

                      {/* Drop preview indicator */}
                      {draggedSession && dragPosition?.day === dayIndex + 1 && (
                        <div
                          className={`absolute w-full rounded opacity-75 pointer-events-none z-10 ${
                            conflictSlots.has(
                              `${dragPosition.day}-${dragPosition.time}`,
                            )
                              ? "bg-red-100 border-2 border-red-400"
                              : "bg-blue-100 border-2 border-blue-400"
                          }`}
                          style={{
                            top: `${dragPosition.pixelY}px`,
                            height: `${((students.find((s) => s.id === draggedSession.student_id)?.minutes_per_session || 30) * PIXELS_PER_HOUR) / 60}px`,
                            left: "2px",
                            right: "2px",
                          }}
                        >
                          {/* Time indicator */}
                          <div className="absolute -top-1 right-1 bg-gray-800 text-white text-xs px-2 py-0.5 rounded-md font-medium shadow-md">
                            {formatTime(dragPosition.time)}
                          </div>
                        </div>
                      )}

                      {daySessions.map((session) => {
                        const student = students.find(
                          (s) => s.id === session.student_id,
                        );
                        const startTime = session.start_time.substring(0, 5);
                        const endTime = session.end_time.substring(0, 5);

                        // Calculate position and height using the new pixel system
                        const top = timeToPixels(startTime);
                        const height = timeToPixels(endTime) - top;

                        const gradeColorMap: { [key: string]: string } = {
                          K: "bg-purple-400 hover:bg-purple-500",
                          "1": "bg-sky-400 hover:bg-sky-500",
                          "2": "bg-cyan-400 hover:bg-cyan-500",
                          "3": "bg-emerald-400 hover:bg-emerald-500",
                          "4": "bg-amber-400 hover:bg-amber-500",
                          "5": "bg-rose-400 hover:bg-rose-500",
                        };

                        // Determine if session should be greyed out
                        // For grades: grey out if the grade is NOT in selectedGrades (since all are selected by default)
                        const isGradeFiltered =
                          student && !selectedGrades.has(student.grade_level);
                        const isTimeFiltered =
                          selectedTimeSlot &&
                          !sessionOverlapsTimeSlot(session, selectedTimeSlot);
                        const isDayFiltered =
                          selectedDay && session.day_of_week !== selectedDay;
                        const shouldGrayOut =
                          isGradeFiltered || isTimeFiltered || isDayFiltered;

                        const gradeColor = shouldGrayOut
                          ? "bg-gray-300 hover:bg-gray-400 opacity-50"
                          : student
                            ? gradeColorMap[student.grade_level] ||
                              "bg-gray-400"
                            : "bg-gray-400";

                        // Add SEA assignment styling
                        const seaAssignmentClass =
                          session.delivered_by === "sea"
                            ? "ring-2 ring-orange-400 ring-inset"
                            : "";

                        // Get pre-calculated column position
                        const columnIndex = sessionColumns.get(session.id) ?? 0;

                        const fixedWidth = 25;
                        const gap = 1;
                        const leftOffset = columnIndex * (fixedWidth + gap);

                        const isHighlighted =
                          highlightedStudentId === session.student_id;
                        const highlightClass = isHighlighted
                          ? "ring-2 ring-yellow-400 ring-offset-2"
                          : "";

                        return (
                          <div
                            key={session.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, session)}
                            onDragEnd={handleDragEnd}
                            className={`absolute ${gradeColor} text-white rounded shadow-sm transition-all hover:shadow-md hover:z-10 group ${highlightClass} ${seaAssignmentClass} ${
                              draggedSession?.id === session.id
                                ? "opacity-50 cursor-grabbing"
                                : "cursor-grab"
                            }`}
                            style={{
                              top: `${top}px`,
                              height: `${height - 2}px`,
                              left: `${leftOffset + 2}px`,
                              width: `${fixedWidth}px`,
                              padding: "2px",
                              cursor: "move",
                              zIndex:
                                draggedSession?.id === session.id ? 20 : 10,
                            }}
                            onClick={(e) => {
                              // Toggle highlight - click same student to turn off
                              setHighlightedStudentId(
                                highlightedStudentId === session.student_id
                                  ? null
                                  : session.student_id,
                              );

                              // Show popup for session assignment
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              setPopupPosition(rect);
                              setSelectedSession(session);
                            }}
                          >
                            <div className="flex flex-col h-full relative">
                              <div className="font-medium text-[10px]">
                                {student?.initials}
                              </div>
                              {height > 40 && (
                                <div className="text-[9px] opacity-90">
                                  {student?.minutes_per_session}m
                                </div>
                              )}
                              {session.delivered_by === "sea" && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                                  <span className="text-[8px] font-bold text-white">
                                    S
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* Total Sessions Counter - Outside the card */}
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Total Sessions: {
              providerRole === "sea" && currentUserId
                ? sessions.filter(s => s.assigned_to_sea_id === currentUserId).length
                : getFilteredSessions(sessions).length
            }
          </div>

          {/* School Hours Toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showSchoolHours}
              onChange={(e) => setShowSchoolHours(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Show school hours
          </label>
        </div>

        {/* Add the SessionAssignmentPopup component here - after line 1113 */}
        {selectedSession && popupPosition && (
          <SessionAssignmentPopup
            session={selectedSession}
            student={students.find((s) => s.id === selectedSession.student_id)}
            triggerRect={popupPosition}
            seaProfiles={seaProfiles}
            otherSpecialists={[]}
            sessionTags={sessionTags}
            setSessionTags={setSessionTags}
            onClose={() => {
              setSelectedSession(null);
              setPopupPosition(null);
            }}
            onUpdate={() => {
              fetchData();
              setSelectedSession(null);
              setPopupPosition(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
