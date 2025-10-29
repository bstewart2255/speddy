"use client";

import React, { useMemo, useCallback } from "react";
import { createClient } from '@/lib/supabase/client';
import { AIContentModal } from "./ai-content-modal";
import { AIContentModalEnhanced } from "./ai-content-modal-enhanced";
import { useSessionSync } from '@/lib/hooks/use-session-sync';
import { cn } from '@/src/utils/cn';
import { getMinutesUntilFirstSession } from '../utils/date-helpers';
import { parseGradeLevel } from '@/lib/utils/grade-parser';
import { fetchWithRetry } from '@/lib/utils/fetch-with-retry';
import { useSchool } from './providers/school-context';
import type { Database } from '../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type StudentRow = Database['public']['Tables']['students']['Row'];
type ScheduleSessionWithStudent = ScheduleSession & { students: StudentRow | null };

// Add custom styles for the highlight animation
const highlightAnimation = `
  @keyframes highlight-fade {
    0% { background-color: rgb(219 234 254); }
    100% { background-color: rgb(239 246 255); }
  }
`;

const TIME_SLOTS = [
  "8:00",
  "8:30",
  "9:00",
  "9:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
];

export function GroupSessionsWidget() {
  const [sessions, setSessions] = React.useState<ScheduleSessionWithStudent[]>([]);
  const [students, setStudents] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState(true);
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const [providerId, setProviderId] = React.useState<string | null>(null);
  const [updatedSessionIds, setUpdatedSessionIds] = React.useState<Set<string>>(new Set());

  // Modal state
  const [modalOpen, setModalOpen] = React.useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = React.useState("");
  const [selectedStudents, setSelectedStudents] = React.useState<any[]>([]);
  const [aiContent, setAiContent] = React.useState<string | null>(null);
  const [generatingContent, setGeneratingContent] = React.useState(false);
  
  // Enhanced modal state for proper lesson display
  const [enhancedModalOpen, setEnhancedModalOpen] = React.useState(false);
  const [enhancedModalLessons, setEnhancedModalLessons] = React.useState<any[]>([]);
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const [userProfile, setUserProfile] = React.useState<any>(null);
  
  // Subject type selection popup state
  const [subjectTypePopupOpen, setSubjectTypePopupOpen] = React.useState(false);
  const [pendingGenerationData, setPendingGenerationData] = React.useState<{
    students: any[];
    timeSlot: string;
  } | null>(null);
  
  // Use school context to get the current school
  const { currentSchool } = useSchool();


  // Use session sync hook for real-time updates
  // Note: useSessionSync expects ScheduleSession[], but we use ScheduleSessionWithStudent[]
  // This is safe because the sync hook only updates existing sessions without the students field
  const { isConnected, lastSync } = useSessionSync({
    sessions: sessions as any,
    setSessions: setSessions as any,
    providerId: providerId || undefined,
  });

  // Update current time every minute
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchUpcomingSessions = React.useCallback(async () => {
    const supabase = createClient();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      
      setProviderId(user.id);

      // Get today's day of week (1-5 for Mon-Fri)
      const today = new Date().getDay() || 7; // Convert Sunday from 0 to 7
      // NOTE: Sunday (7) is intentionally mapped to Monday (1) to show Monday's schedule
      // This is a business decision for weekend planning - users see next Monday's sessions on Sunday
      const adjustedToday = today === 7 ? 1 : today;

      // Build the query for sessions with school filtering using inner join
      let sessionQuery = supabase
        .from("schedule_sessions")
        .select("*, students!inner(*)")
        .eq("provider_id", user.id)
        .eq("day_of_week", adjustedToday);

      // Apply school filter if we have a current school selected
      if (currentSchool) {
        // For migrated schools (have school_id)
        if (currentSchool.school_id) {
          sessionQuery = sessionQuery.eq("students.school_id", currentSchool.school_id);
        } 
        // For legacy schools (use school_site and school_district)
        else if (currentSchool.school_site && currentSchool.school_district) {
          sessionQuery = sessionQuery
            .eq("students.school_site", currentSchool.school_site)
            .eq("students.school_district", currentSchool.school_district);
        }
      }

      // Execute the query
      const { data: sessionData, error } = await sessionQuery.order("start_time");

      if (error) throw error;

      setSessions((sessionData as ScheduleSessionWithStudent[]) || []);

      // Create students lookup
      const studentsMap: Record<string, any> = {};
      sessionData?.forEach((session) => {
        if (session.students) {
          studentsMap[session.student_id] = session.students;
        }
      });
      setStudents(studentsMap);
    } catch (error) {
      console.error("Error fetching sessions:", error);
    } finally {
      setLoading(false);
    }
  }, [currentSchool]);

  React.useEffect(() => {
    if (!currentSchool) return; // Wait for school selection to avoid showing unfiltered data
    setLoading(true);
    fetchUpcomingSessions();
  }, [currentSchool, fetchUpcomingSessions]); // Re-fetch when school changes
  
  // Fetch user profile for teacher role
  React.useEffect(() => {
    const fetchUserProfile = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      setUserProfile(profile);
    };
    
    fetchUserProfile();
  }, []);

  const getNextFiveHours = useCallback(() => {
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();

    // Find the current or next 30-min slot
    const currentTimeString = `${currentHour}:${currentMinutes < 30 ? "00" : "30"}`;

    // Get index of current time slot
    let startIndex = TIME_SLOTS.findIndex((slot) => {
      const [hour, min] = slot.split(":").map((s) => parseInt(s));
      const slotTime = hour + (min || 0) / 60;
      const nowTime = currentHour + currentMinutes / 60;
      return slotTime >= nowTime;
    });

    // If after 3 PM, we've passed all slots for today
    if (startIndex === -1) {
      return []; // Return empty array instead of resetting to morning
    }

    // Return 10 slots (5 hours) or whatever remains
    return TIME_SLOTS.slice(startIndex, startIndex + 10);
  }, [currentTime]);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes || "00"} ${period}`;
  };

  const getSessionsForSlot = useCallback((timeSlot: string) => {
    const [slotHour, slotMin] = timeSlot.split(":").map(Number);
    const slotMinutes = slotHour * 60 + slotMin;

    return sessions.filter((session) => {
      if (!session.start_time) return false;
      const [sessionHour, sessionMin] = session.start_time
        .split(":")
        .map(Number);
      const sessionMinutes = sessionHour * 60 + sessionMin;

      // Check if session starts within this 30-minute slot
      return sessionMinutes >= slotMinutes && sessionMinutes < slotMinutes + 30;
    });
  }, [sessions]);

  // Get relative time display (e.g., "in 30 minutes")
  const getRelativeTime = useCallback((timeSlot: string) => {
    // Get sessions for this specific slot to show accurate countdown
    const slotSessions = getSessionsForSlot(timeSlot);
    
    if (slotSessions.length === 0) {
      // No sessions in this slot, calculate time to slot start
      const now = currentTime;
      const [slotHour, slotMin] = timeSlot.split(":").map(Number);
      
      const slotDate = new Date();
      slotDate.setHours(slotHour, slotMin, 0, 0);
      
      const diffMs = slotDate.getTime() - now.getTime();
      const diffMinutes = Math.round(diffMs / 60000);
      
      if (diffMinutes < 0) {
        return "now";
      } else if (diffMinutes === 0) {
        return "starting now";
      } else if (diffMinutes < 60) {
        return `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
      } else {
        const hours = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;
        if (mins === 0) {
          return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        return `in ${hours}h ${mins}m`;
      }
    }

    // For slots with sessions, calculate time until first session in this slot
    const minutesUntilFirstSession = getMinutesUntilFirstSession(slotSessions, currentTime);
    
    // getMinutesUntilFirstSession only returns null or a non-negative number
    if (minutesUntilFirstSession === null) {
      return "now";
    } else if (minutesUntilFirstSession === 0) {
      return "starting now";
    } else if (minutesUntilFirstSession < 60) {
      return `in ${minutesUntilFirstSession} minute${minutesUntilFirstSession !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(minutesUntilFirstSession / 60);
      const mins = minutesUntilFirstSession % 60;
      if (mins === 0) {
        return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
      }
      return `in ${hours}h ${mins}m`;
    }
  }, [currentTime, getSessionsForSlot]);

  const generateAIContent = async (students: any[], timeSlot: string, subjectType: 'ela' | 'math') => {
    setGeneratingContent(true);

    try {
      // Transform students to match new API format with IEP goals enrichment
      const formattedStudents = students.map(student => {
        return {
          id: student.id,
          grade: parseGradeLevel(student.grade_level)
        };
      });

      // Calculate duration from time slot (30 minutes default)
      const duration = 30;
      
      // Get the displayed schedule date (adjust Sunday to Monday)
      const today = new Date();
      const currentDayOfWeek = today.getDay() || 7; // Convert Sunday from 0 to 7
      let displayDate = new Date(today);
      
      // If it's Sunday, adjust to show Monday's date
      if (currentDayOfWeek === 7) {
        displayDate.setDate(displayDate.getDate() + 1); // Move to Monday
      }
      
      // Format the display date for lesson date
      const lessonDate = `${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, '0')}-${String(displayDate.getDate()).padStart(2, '0')}`;

      // Use the batch API with retry logic for production reliability
      // Generate idempotency key to prevent duplicate lessons on retry
      const idempotencyKey = `gsw:${lessonDate}:${timeSlot}:${formattedStudents.map(s => s.id).sort().join('-')}`;
      const response = await fetchWithRetry("/api/lessons/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify({
          batch: [{
            students: formattedStudents,
            subject: subjectType === 'ela' ? 'English Language Arts' : 'Math',
            subjectType: subjectType,
            duration: duration,
            topic: `Group session for ${formatTime(timeSlot)}`,
            teacherRole: userProfile?.role || 'resource',
            lessonDate: lessonDate,
            timeSlot: timeSlot
          }]
        }),
        onRetry: (attempt, maxRetries) => {
          console.log(`Retrying lesson generation (${attempt}/${maxRetries})...`);
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate lesson");
      }

      const data = await response.json();
      
      // Process response - only require data.lessons to exist
      if (data.lessons && data.lessons.length > 0) {
        const result = data.lessons[0];
        if (result.success && result.lesson) {
          // Format lesson for enhanced modal
          const lessonData = {
            timeSlot: timeSlot,
            content: JSON.stringify(result.lesson),
            students: students.map(s => ({
              id: s.id,
              initials: s.initials || 'Unknown',
              grade_level: s.grade_level || '',
              teacher_name: s.teacher_name || ''
            }))
          };
          
          // Set data for enhanced modal
          setEnhancedModalLessons([lessonData]);
          
          // Close generating modal and open enhanced modal
          setModalOpen(false);
          setEnhancedModalOpen(true);
        } else {
          throw new Error(result.error || "Failed to generate lesson");
        }
      } else {
        // Log for debugging if lessons array is missing or empty
        console.warn("Response data structure:", data);
        throw new Error("No lesson content received");
      }
    } catch (error) {
      console.error("Error generating content:", error);
      setAiContent(`
        <div style="color: red; text-align: center; padding: 20px;">
          <p><strong>Error generating content</strong></p>
          <p>Please try again or contact support if the problem persists.</p>
        </div>
      `);
    } finally {
      setGeneratingContent(false);
    }
  };

  const handleGenerateAIContent = async (
    timeSlot: string,
    slotSessions: any[],
  ) => {
    // Transform sessions to student objects for the modal
    const studentData = slotSessions.map(session => ({
      id: session.student_id,
      initials: session.students?.initials || 'Unknown',
      grade_level: session.students?.grade_level || '',
      teacher_name: session.students?.teacher_name || '',
    }));

    // Store data for pending generation and show subject type popup
    setPendingGenerationData({
      students: studentData,
      timeSlot: timeSlot
    });
    setSubjectTypePopupOpen(true);
  };

  // Handle subject type selection and proceed with generation
  const handleSubjectTypeSelection = async (subjectType: 'ela' | 'math') => {
    if (!pendingGenerationData) return;

    setSubjectTypePopupOpen(false);
    setSelectedTimeSlot(formatTime(pendingGenerationData.timeSlot));
    setSelectedStudents(pendingGenerationData.students);
    setModalOpen(true);
    setAiContent(null);

    // Generate content with the selected subject type
    await generateAIContent(pendingGenerationData.students, pendingGenerationData.timeSlot, subjectType);
    
    // Clear pending data
    setPendingGenerationData(null);
  };

  // Memoize visible slots to prevent unnecessary recalculations
  const visibleSlots = useMemo(() => getNextFiveHours(), [getNextFiveHours]);

  // Memoize sessions by slot to optimize rendering
  const sessionsBySlot = useMemo(() => {
    const slotMap = new Map<string, ScheduleSession[]>();
    
    visibleSlots.forEach(timeSlot => {
      const slotSessions = getSessionsForSlot(timeSlot);
      if (slotSessions.length > 0) {
        slotMap.set(timeSlot, slotSessions);
      }
    });
    
    return slotMap;
  }, [visibleSlots, getSessionsForSlot]);

  if (loading) {
    return <div className="animate-pulse bg-gray-100 rounded-lg h-64"></div>;
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold flex items-center">
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            Upcoming Sessions
          </h3>
          {isConnected && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-gray-500">Live</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {visibleSlots.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg
                className="w-12 h-12 mx-auto mb-3 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium">No more sessions today</p>
              <p className="text-xs mt-1">
                Check back tomorrow for your schedule
              </p>
            </div>
          ) : (
            <>
              {visibleSlots.map((timeSlot) => {
                const slotSessions = sessionsBySlot.get(timeSlot) || [];

                // Debug logging removed to prevent console spam

                const hasUpdatedSession = slotSessions.some(s => updatedSessionIds.has(s.id));
                const relativeTime = getRelativeTime(timeSlot);
                
                return (
                  <div
                    key={timeSlot}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-md text-sm transition-all duration-300",
                      slotSessions.length > 0
                        ? "bg-blue-50 border border-blue-200"
                        : "text-gray-500",
                      hasUpdatedSession && "animate-pulse bg-blue-100 border-blue-300"
                    )}
                  >
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={slotSessions.length > 0 ? "font-medium" : ""}
                        >
                          {formatTime(timeSlot)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {relativeTime}
                        </span>
                      </div>
                      {slotSessions.length > 0 && (
                        <div className="mt-0.5">
                          {slotSessions.map((session, idx) => (
                            <span
                              key={session.id}
                              className={cn(
                                "inline-block text-xs",
                                updatedSessionIds.has(session.id) 
                                  ? "text-blue-700 font-semibold" 
                                  : "text-gray-600"
                              )}
                            >
                              {students[session.student_id]?.initials}
                              {idx < slotSessions.length - 1 && ", "}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Subject Type Selection Popup */}
      {subjectTypePopupOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Choose Subject Type
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Select the type of lesson you want to generate for {formatTime(pendingGenerationData?.timeSlot || "")}
              </p>
              
              <div className="flex flex-col space-y-3">
                <button
                  onClick={() => handleSubjectTypeSelection('ela')}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  📚 ELA (English Language Arts)
                  <div className="text-xs mt-1 opacity-90">
                    Reading, writing, grammar, vocabulary
                  </div>
                </button>
                
                <button
                  onClick={() => handleSubjectTypeSelection('math')}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                >
                  🔢 Math
                  <div className="text-xs mt-1 opacity-90">
                    Computation, problem-solving, number sense
                  </div>
                </button>
              </div>
              
              <button
                onClick={() => {
                  setSubjectTypePopupOpen(false);
                  setPendingGenerationData(null);
                }}
                className="mt-4 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <AIContentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        timeSlot={selectedTimeSlot}
        students={selectedStudents}
        content={aiContent}
        isLoading={generatingContent}
        hideControls={true}  // Add this line to hide controls in upcoming sessions widget
      />
      
      <AIContentModalEnhanced
        isOpen={enhancedModalOpen}
        onClose={() => setEnhancedModalOpen(false)}
        lessons={enhancedModalLessons}
        isLoading={false}
        schoolSite={currentSchool?.school_site}
        lessonDate={selectedDate}
        hideControls={false} // Allow viewing and editing in the enhanced modal
      />
    </>
  );
}
