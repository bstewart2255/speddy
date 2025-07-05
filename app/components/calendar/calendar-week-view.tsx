"use client";

import React from 'react';
import { Database } from '../../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

interface CalendarWeekViewProps {
  sessions: ScheduleSession[];
  students: Map<string, { initials: string }>;
  onSessionClick?: (session: ScheduleSession) => void;
}

export function CalendarWeekView({ 
  sessions, 
  students,
  onSessionClick 
}: CalendarWeekViewProps) {
  // Get current week dates
  const getWeekDates = () => {
    const today = new Date();
    const currentDay = today.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay; // Adjust for Monday start
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);

    const weekDates = [];
    for (let i = 0; i < 5; i++) { // Monday to Friday only
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      weekDates.push(date);
    }
    return weekDates;
  };

  const weekDates = getWeekDates();
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Group sessions by day
  const sessionsByDay = sessions.reduce((acc, session) => {
    if (!acc[session.day_of_week]) {
      acc[session.day_of_week] = [];
    }
    acc[session.day_of_week].push(session);
    return acc;
  }, {} as Record<number, ScheduleSession[]>);

  // Sort sessions within each day
  Object.keys(sessionsByDay).forEach(day => {
    sessionsByDay[Number(day)].sort((a, b) => a.start_time.localeCompare(b.start_time));
  });

  return (
    <div>
      <div className="grid grid-cols-5 gap-4">
        {weekDates.map((date, index) => {
          const dayOfWeek = index + 1; // 1 = Monday, 2 = Tuesday, etc.
          const daySessions = sessionsByDay[dayOfWeek] || [];
          const isToday = date.toDateString() === new Date().toDateString();

          return (
            <div 
              key={dayOfWeek} 
              className={`border rounded-lg ${isToday ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
            >
              <div className={`p-2 text-center font-medium text-sm ${
                isToday ? 'bg-blue-100' : 'bg-gray-50'
              }`}>
                <div>{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div className="text-lg">{date.getDate()}</div>
              </div>

              <div className="p-2 space-y-1 min-h-[200px]">
                {daySessions.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center mt-4">No sessions</p>
                ) : (
                  daySessions.map((session) => {
                    const student = students.get(session.student_id);
                    return (
                      <div
                        key={session.id}
                        onClick={() => onSessionClick?.(session)}
                        className="p-2 text-xs bg-white border border-gray-200 rounded cursor-pointer hover:shadow-sm transition-shadow"
                      >
                        <div className="font-medium text-gray-900">
                          {formatTime(session.start_time)}
                        </div>
                        <div className="text-gray-600 truncate">
                          {student?.initials || 'Unknown'}
                        </div>
                        {session.delivered_by === 'sea' && (
                          <div className="text-green-600 text-xs">SEA</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}