"use client";

import React from 'react';
import { Database } from '../../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'];

interface CalendarMonthViewProps {
  sessions: ScheduleSession[];
  holidays: Array<{ date: string; name?: string }>;
  onDayClick: (date: Date) => void;
  userRole: string;
  monthOffset?: number;
  onDateClick?: (date: Date) => void;  // Add this for navigation
  calendarEvents?: CalendarEvent[];
  onAddEvent?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

export function CalendarMonthView({ 
  sessions, 
  holidays,
  onDayClick,
  userRole,
  monthOffset = 0,
  onDateClick,
  calendarEvents = [],
  onAddEvent,
  onEventClick,
}: CalendarMonthViewProps) {
  // Calculate current month based on offset
  const currentMonth = new Date();
  currentMonth.setMonth(currentMonth.getMonth() + monthOffset);

  // Get calendar grid - only weekdays
  const getCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Find the first Monday of the month or before
    const startDate = new Date(firstDay);
    const startDayOfWeek = firstDay.getDay();

    // If the month starts on a weekend, go to the next Monday
    if (startDayOfWeek === 0) { // Sunday
      startDate.setDate(startDate.getDate() + 1);
    } else if (startDayOfWeek === 6) { // Saturday
      startDate.setDate(startDate.getDate() + 2);
    } else if (startDayOfWeek > 1) { // Tuesday-Friday
      // Go back to previous Monday
      startDate.setDate(startDate.getDate() - (startDayOfWeek - 1));
    }

    const days: Date[] = [];
    const current = new Date(startDate);

    // Generate 6 weeks worth of weekdays (30 days max)
    while (days.length < 30 && current <= new Date(year, month + 1, 7)) {
      const dayOfWeek = current.getDay();

      // Only add Monday-Friday (1-5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        days.push(new Date(current));
      }

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

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return calendarEvents.filter(e => e.date === dateStr);
  };

  const calendarDays = getCalendarDays();

  return (
    <div>
      {/* Calendar Grid */}
      <div className="grid grid-cols-5 gap-1">
        {/* Day Headers */}
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
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
          const events = getEventsForDate(date);

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
              {/* Action buttons - holiday checkbox and add event */}
              <div className="absolute top-1 right-1 flex gap-1">
                {/* Add Event button - only show for non-SEA users */}
                {userRole !== 'sea' && onAddEvent && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddEvent(date);
                    }}
                    className={`
                      w-5 h-5 rounded border-2 bg-white border-blue-300
                      opacity-0 group-hover:opacity-100
                      transition-opacity duration-200 flex items-center justify-center
                      hover:border-blue-500 hover:bg-blue-50
                    `}
                    title="Add event"
                  >
                    <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
                {/* Holiday checkbox - only show for non-SEA users */}
                {userRole !== 'sea' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDayClick(date);
                    }}
                    className={`
                      w-5 h-5 rounded border-2 
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
              </div>

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

              {/* Display calendar events */}
              {events.length > 0 && (
                <div className="mt-2 space-y-1">
                  {events.slice(0, 2).map((event, idx) => (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                      className="text-xs px-1 py-0.5 rounded cursor-pointer hover:opacity-80"
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
                      title={event.title}
                    >
                      {event.all_day ? '' : event.start_time?.slice(0, 5) + ' '}
                      {event.title.length > 15 ? event.title.slice(0, 15) + '...' : event.title}
                    </div>
                  ))}
                  {events.length > 2 && (
                    <div className="text-xs text-gray-500 pl-1">
                      +{events.length - 2} more
                    </div>
                  )}
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