"use client";

import React from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AIContentModal } from "./ai-content-modal";

const TIME_SLOTS = [
  "8:00", "8:30", "9:00", "9:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "1:00", "1:30",
  "2:00", "2:30", "3:00"
];

export function GroupSessionsWidget() {
  const [sessions, setSessions] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState(true);
  const [currentTime, setCurrentTime] = React.useState(new Date());

  // Modal state
  const [modalOpen, setModalOpen] = React.useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = React.useState("");
  const [selectedStudents, setSelectedStudents] = React.useState<any[]>([]);
  const [aiContent, setAiContent] = React.useState<string | null>(null);
  const [generatingContent, setGeneratingContent] = React.useState(false);
  const [currentSchool, setCurrentSchool] = React.useState<string>("");

  // Update current time every minute
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    fetchUpcomingSessions();
  }, []);

  const fetchUpcomingSessions = async () => {
    const supabase = createClientComponentClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's current school
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_site")
        .eq("id", user.id)
        .single();

      if (profile) {
        setCurrentSchool(profile.school_site);
      }

      // Get today's day of week (1-5 for Mon-Fri)
      const today = new Date().getDay() || 7; // Convert Sunday from 0 to 7
      const adjustedToday = today === 7 ? 1 : today; // Treat Sunday as Monday for now

      // Fetch today's sessions
      const { data: sessionData, error } = await supabase
        .from("schedule_sessions")
        .select("*, students(*)")
        .eq("provider_id", user.id)
        .eq("day_of_week", adjustedToday)
        .order("start_time");

      if (error) throw error;

      setSessions(sessionData || []);

      // Create students lookup
      const studentsMap: Record<string, any> = {};
      sessionData?.forEach(session => {
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
  };

  const getNextFiveHours = () => {
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();

    // Find the current or next 30-min slot
    const currentTimeString = `${currentHour}:${currentMinutes < 30 ? '00' : '30'}`;

    // Get index of current time slot
    let startIndex = TIME_SLOTS.findIndex(slot => {
      const [hour, min] = slot.split(':').map(s => parseInt(s));
      const slotTime = hour + (min || 0) / 60;
      const nowTime = currentHour + currentMinutes / 60;
      return slotTime >= nowTime;
    });

    if (startIndex === -1) startIndex = 0; // If after 3 PM, show from 8 AM

    // Return 10 slots (5 hours)
    return TIME_SLOTS.slice(startIndex, startIndex + 10);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes || '00'} ${period}`;
  };

  const getSessionsForSlot = (timeSlot: string) => {
    const slotTime = timeSlot.padStart(5, '0') + ':00'; // Convert "8:00" to "08:00:00"
    return sessions.filter(session => 
      session.start_time.substring(0, 5) === slotTime.substring(0, 5)
    );
  };

    const generateAIContent = async (students: any[], timeSlot: string) => {
    setGeneratingContent(true);

    try {
      const response = await fetch('/api/generate-lesson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          students: students.map(s => s.students),
          timeSlot: selectedTimeSlot,
          duration: 30
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate content');
      }

      const { content } = await response.json();
      setAiContent(content);

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

  const handleGenerateAIContent = async (timeSlot: string, slotSessions: any[]) => {
    setSelectedTimeSlot(formatTime(timeSlot));
    setSelectedStudents(slotSessions);
    setModalOpen(true);
    setAiContent(null);

    // Generate content
    await generateAIContent(slotSessions, timeSlot);
  };

  if (loading) {
    return <div className="animate-pulse bg-gray-100 rounded-lg h-64"></div>;
  }

  const visibleSlots = getNextFiveHours();

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-base font-semibold mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          Upcoming Group Sessions
        </h3>

        <div className="space-y-2">
          {visibleSlots.map((timeSlot) => {
            const slotSessions = getSessionsForSlot(timeSlot);

            return (
              <div
                key={timeSlot}
                className={`flex items-center justify-between px-3 py-2 rounded-md text-sm ${
                  slotSessions.length > 0 
                    ? 'bg-blue-50 border border-blue-200' 
                    : 'text-gray-500'
                }`}
              >
                <div className="flex-1">
                  <span className={slotSessions.length > 0 ? 'font-medium' : ''}>
                    {formatTime(timeSlot)}
                  </span>
                  {slotSessions.length > 0 && (
                    <span className="ml-2 text-xs text-gray-600">
                      {slotSessions.map(s => students[s.student_id]?.initials).join(', ')}
                    </span>
                  )}
                </div>

                {slotSessions.length > 0 && (
                  <button
                    onClick={() => handleGenerateAIContent(timeSlot, slotSessions)}
                    className="ml-2 bg-purple-500 hover:bg-purple-600 text-white text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1"
                    title={`Generate AI lesson content for ${slotSessions.length} students`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    AI Lesson
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AIContentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        timeSlot={selectedTimeSlot}
        students={selectedStudents.map(s => s.students)}
        content={aiContent}
        isLoading={generatingContent}
        schoolSite={currentSchool}  // ADD THIS LINE
      />
    </>
  );
}