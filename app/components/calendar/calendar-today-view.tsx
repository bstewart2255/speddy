"use client";

import React from 'react';
import { Database } from '../../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

interface CalendarTodayViewProps {
  sessions: ScheduleSession[];
  students: Map<string, { initials: string }>;
  onSessionClick?: (session: ScheduleSession) => void;
}

export function CalendarTodayView({ 
  sessions, 
  students,
  onSessionClick 
}: CalendarTodayViewProps) {
  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Filter sessions for today (based on day_of_week)
  const todayDayOfWeek = new Date().getDay();
  const adjustedDayOfWeek = todayDayOfWeek === 0 ? 7 : todayDayOfWeek; // Convert Sunday (0) to 7
  const todaySessions = sessions.filter(s => s.day_of_week === adjustedDayOfWeek);

  // Sort sessions by start time
  const sortedSessions = [...todaySessions].sort((a, b) => 
    a.start_time.localeCompare(b.start_time)
  );

  // Format time helper
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{todayDate}</h2>

      {sortedSessions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No sessions scheduled for today</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedSessions.map((session) => {
            const student = students.get(session.student_id);
            return (
              <div
                key={session.id}
                onClick={() => onSessionClick?.(session)}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm cursor-pointer transition-shadow"
              >
                <div className="flex items-center space-x-4">
                  <div className="text-sm font-medium text-gray-900">
                    {formatTime(session.start_time)} - {formatTime(session.end_time)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {student?.initials || 'Unknown'}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    session.delivered_by === 'sea' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {session.delivered_by === 'sea' ? 'SEA' : 'Provider'}
                  </span>
                  {session.completed_at && (
                    <span className="text-xs text-green-600">✓ Completed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}