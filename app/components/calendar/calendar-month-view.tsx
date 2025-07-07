"use client";

import React from 'react';
import { Database } from '../../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

interface CalendarMonthViewProps {
  sessions: ScheduleSession[];
  holidays: Array<{ date: string; name?: string }>;
  onDayClick: (date: Date) => void;
  userRole: string;
  monthOffset?: number;
  onDateClick?: (date: Date) => void;  // Add this for navigation
}

export function CalendarMonthView({ 
  sessions, 
  holidays,
  onDayClick,
  userRole,
  monthOffset = 0,
  onDateClick, 
}: CalendarMonthViewProps) {
  // Calculate current month based on offset
  const currentMonth = new Date();
  currentMonth.setMonth(currentMonth.getMonth() + monthOffset);

  // Get calendar grid
  const getCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    const startDayOfWeek = firstDay.getDay();

    // Adjust to start on Monday
    const daysToSubtract = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    startDate.setDate(startDate.getDate() - daysToSubtract);

    // Ensure the days array is explicitly typed to hold Date objects
    const days: Date[] = [];
    const current = new Date(startDate);

    // Generate 6 weeks (42 days)
    for (let i = 0; i < 42; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  };

  // Count sessions for a specific date
  const getSessionCountForDate = (date: Date) => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
    return sessions.filter(s => s.day_of_week === dayOfWeek).length;
  };

  // Check if date is a holiday
  const isHoliday = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return holidays.some(h => h.date === dateStr);
  };

  // Get holiday name
  const getHolidayName = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const holiday = holidays.find(h => h.date === dateStr);
    return holiday?.name;
  };

  const calendarDays = getCalendarDays();

  return (
    <div>
      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Day Headers */}
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div key={day} className="text-center text-sm font-medium text-gray-700 py-2">
            {day}
          </div>
        ))}

        {/* Calendar Days */}
        {calendarDays.map((date, index) => {
          const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
          const isToday = date.toDateString() === new Date().toDateString();
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const holiday = isHoliday(date);
          const holidayName = getHolidayName(date);
          const sessionCount = !isWeekend ? getSessionCountForDate(date) : 0;

          return (
            <div
              key={index}
              onClick={() => onDateClick?.(date)}
              className={`
                relative min-h-[80px] p-2 border rounded-lg transition-all group
                ${isCurrentMonth ? 'bg-white' : 'bg-gray-50'}
                ${isToday ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'}
                ${holiday ? 'bg-red-50 border-red-200' : ''}
                ${isWeekend ? 'bg-gray-100' : ''}
              `}
            >
              {/* Holiday checkbox - only show for non-SEA users */}
              {userRole !== 'sea' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDayClick(date);
                  }}
                  className={`
                    absolute top-1 right-1 w-5 h-5 rounded border-2 
                    ${holiday ? 'bg-red-500 border-red-500' : 'bg-white border-red-300'}
                    ${holiday ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                    transition-opacity duration-200 flex items-center justify-center
                    hover:border-red-500
                  `}
                  title={holiday ? 'Remove holiday' : 'Mark as holiday'}
                >
                  {holiday && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              )}

              <div className={`text-sm font-medium ${
                isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
              } ${isToday ? 'text-blue-600' : ''}`}>
                {date.getDate()}
              </div>

              {holiday && (
                <div className="text-xs text-red-600 font-medium mt-1">
                  {holidayName || 'Holiday'}
                </div>
              )}

              {!isWeekend && sessionCount > 0 && (
                <div className="text-xs text-gray-600 mt-1">
                  {sessionCount} session{sessionCount !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-50 border border-red-200 rounded"></div>
          <span>Holiday</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-white border-2 border-blue-400 rounded"></div>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}