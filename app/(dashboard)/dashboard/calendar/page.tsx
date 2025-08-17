"use client";

import React, { useState, useEffect } from "react";
import { createClient } from '@/lib/supabase/client';
import { Card, CardBody } from "../../../components/ui/card";
import { CalendarTodayView } from "../../../components/calendar/calendar-today-view";
import { CalendarWeekView } from "../../../components/calendar/calendar-week-view";
import { CalendarMonthView } from "../../../components/calendar/calendar-month-view";
import { CalendarEventModal } from "../../../components/calendar/calendar-event-modal";
import { useSchool } from "../../../components/providers/school-context";
import { ToastProvider } from "../../../contexts/toast-context";
import type { Database } from "../../../../src/types/database";

type ViewType = 'today' | 'week' | 'month';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'];

interface Holiday {
  id: string;
  date: string;
  name?: string;
  school_site: string;
  school_district: string;
}

interface Student {
  id: string;
  initials: string;
  grade_level: string;
}

export default function CalendarPage() {
  const [currentView, setCurrentView] = useState<ViewType>('today');
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [students, setStudents] = useState<Map<string, Student>>(new Map());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [holidayName, setHolidayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { currentSchool } = useSchool();
  const supabase = createClient<Database>();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEventDate, setSelectedEventDate] = useState<Date>(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [providerId, setProviderId] = useState<string>('');

  // Navigation handlers
  const handlePreviousDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const handlePreviousWeek = () => {
    setWeekOffset(prev => prev - 1);
  };

  const handleNextWeek = () => {
    setWeekOffset(prev => prev + 1);
  };

  const handlePreviousMonth = () => {
    setMonthOffset(prev => prev - 1);
  };

  const handleNextMonth = () => {
    setMonthOffset(prev => prev + 1);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setWeekOffset(0);
    setMonthOffset(0);
  };

  useEffect(() => {
    fetchData();
  }, [currentSchool]);

  const fetchData = async () => {
    try {
      // Get user profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserRole(profile.role);
      }
      
      setProviderId(user.id);

      // Fetch sessions
      const { data: sessionData, error: sessionError } = await supabase
        .from('schedule_sessions')
        .select('*')
        .eq('provider_id', user.id);

      if (sessionError) throw sessionError;
      setSessions(sessionData || []);

      // Fetch students
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, initials, grade_level')
        .eq('provider_id', user.id);

      if (studentError) throw studentError;

      const studentMap = new Map();
      studentData?.forEach(student => {
        studentMap.set(student.id, student);
      });
      setStudents(studentMap);

      // Fetch calendar events
      const { data: eventsData } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('provider_id', user.id)
        .order('date', { ascending: true });

      if (eventsData) {
        setCalendarEvents(eventsData);
      }

      // Fetch holidays - add better error handling and logging
      if (currentSchool) {
        // Log to see what properties currentSchool actually has
        console.log('Current school object:', currentSchool);
        console.log('Current school keys:', Object.keys(currentSchool));

        // Check which properties exist
        const schoolSite = (currentSchool as any).site || (currentSchool as any).school_site;
        const schoolDistrict = (currentSchool as any).district || (currentSchool as any).school_district;

        if (schoolSite && schoolDistrict) {
          console.log('Fetching holidays for:', { schoolSite, schoolDistrict });

          const { data: holidayData, error: holidayError } = await supabase
            .from('holidays')
            .select('*')
            .eq('school_site', schoolSite)
            .eq('school_district', schoolDistrict);

          if (holidayError) {
            console.error('Error fetching holidays:', holidayError);
          } else {
            console.log('Holidays fetched:', holidayData);
            setHolidays(holidayData || []);
          }
        } else {
          console.log('School site or district missing');
          setHolidays([]);
        }
      } else {
        console.log('No currentSchool available yet');
        setHolidays([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEvent = (date: Date) => {
    setSelectedEventDate(date);
    setSelectedEvent(null);
    setShowEventModal(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setSelectedEventDate(new Date(event.date));
    setShowEventModal(true);
  };

  const handleEventSave = async (event: CalendarEvent) => {
    // Refresh calendar events
    const { data: eventsData } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('provider_id', providerId)
      .order('date', { ascending: true });

    if (eventsData) {
      setCalendarEvents(eventsData);
    }
  };

  const handleDayClick = async (date: Date) => {
    // Only allow non-SEA users to mark holidays
    if (userRole === 'sea') return;

    const dateStr = date.toISOString().split('T')[0];
    const existingHoliday = holidays.find(h => h.date === dateStr);

    if (existingHoliday) {
      // Remove holiday
      const { error } = await supabase
        .from('holidays')
        .delete()
        .eq('id', existingHoliday.id);

      if (!error) {
        setHolidays(holidays.filter(h => h.id !== existingHoliday.id));
      }
    } else {
      // Show modal to add holiday
      setSelectedDate(date);
      setShowHolidayModal(true);
      setHolidayName('');
    }
  };

  const handleAddHoliday = async () => {
    if (!selectedDate || !currentSchool) {
      console.error('Missing selectedDate or currentSchool');
      return;
    }

    const dateStr = selectedDate.toISOString().split('T')[0];
    console.log('Attempting to add holiday:', {
      date: dateStr,
      name: holidayName,
      school_site: currentSchool.school_site,
      school_district: currentSchool.school_district
    });

    const { data, error } = await supabase
      .from('holidays')
      .insert({
        date: dateStr,
        name: holidayName || null,
        school_site: currentSchool.school_site,
        school_district: currentSchool.school_district
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding holiday:', error);
      setError(error.message);
    } else if (data) {
      console.log('Holiday added successfully:', data);
      setHolidays([...holidays, data]);
      setShowHolidayModal(false);
      setHolidayName('');
      setSelectedDate(null);
      setError(null);
    }
  };

  const handleSessionClick = (session: ScheduleSession) => {
    // You can implement session details popup here
    console.log('Session clicked:', session);
  };

  // Add this handler function after the other navigation handlers
  const handleDateClick = (date: Date) => {
    // Calculate the week offset from today to the clicked date
    const today = new Date();
    const clickedDate = new Date(date);

    // Get the Monday of the current week
    const currentWeekMonday = new Date(today);
    const currentDay = today.getDay();
    const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    currentWeekMonday.setDate(today.getDate() + daysToMonday);

    // Get the Monday of the clicked date's week
    const clickedWeekMonday = new Date(clickedDate);
    const clickedDay = clickedDate.getDay();
    const clickedDaysToMonday = clickedDay === 0 ? -6 : 1 - clickedDay;
    clickedWeekMonday.setDate(clickedDate.getDate() + clickedDaysToMonday);

    // Calculate week difference
    const weekDiff = Math.round((clickedWeekMonday.getTime() - currentWeekMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));

    // Set the week offset and switch to week view
    setWeekOffset(weekDiff);
    setCurrentView('week');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Calendar</h1>
          <p className="text-gray-600">View upcoming weeks, create lesson plans, and more.</p>
        </div>

        {/* View Toggle Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setCurrentView('today')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  currentView === 'today'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setCurrentView('week')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  currentView === 'week'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setCurrentView('month')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  currentView === 'month'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Month
              </button>
            </nav>
          </div>
        </div>

        {/* Calendar Content */}
        <Card>
          <CardBody className="p-6">
            {/* Navigation Header */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => {
                  if (currentView === 'today') handlePreviousDay();
                  else if (currentView === 'week') handlePreviousWeek();
                  else if (currentView === 'month') handlePreviousMonth();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Previous"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="text-center">
                <h2 className="text-lg font-semibold">
                  {currentView === 'today' && currentDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                  {currentView === 'week' && `Week of ${new Date(new Date().setDate(new Date().getDate() + (weekOffset * 7))).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}`}
                  {currentView === 'month' && new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric'
                  })}
                </h2>
                {((currentView === 'today' && currentDate.toDateString() !== new Date().toDateString()) ||
                  (currentView === 'week' && weekOffset !== 0) ||
                  (currentView === 'month' && monthOffset !== 0)) && (
                  <button
                    onClick={handleToday}
                    className="text-sm text-blue-600 hover:text-blue-700 mt-1"
                  >
                    Back to today
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  if (currentView === 'today') handleNextDay();
                  else if (currentView === 'week') handleNextWeek();
                  else if (currentView === 'month') handleNextMonth();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Next"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {currentView === 'today' && (
              <ToastProvider>
                <CalendarTodayView 
                  sessions={sessions} 
                  students={students}
                  onSessionClick={handleSessionClick}
                  currentDate={currentDate}
                  holidays={holidays}
                  calendarEvents={calendarEvents}
                  onAddEvent={handleAddEvent}
                  onEventClick={handleEventClick}
                />
              </ToastProvider>
            )}
            {currentView === 'week' && (
              <ToastProvider>
                <CalendarWeekView 
                  sessions={sessions} 
                  students={students}
                  onSessionClick={handleSessionClick}
                  weekOffset={weekOffset}
                  holidays={holidays}  // Add this line
                  calendarEvents={calendarEvents}
                  onAddEvent={handleAddEvent}
                  onEventClick={handleEventClick}
                />
              </ToastProvider>
            )}
            {currentView === 'month' && (
              <CalendarMonthView 
                sessions={sessions} 
                holidays={holidays}
                onDayClick={handleDayClick}
                userRole={userRole}
                monthOffset={monthOffset}
                onDateClick={handleDateClick}  // Add this to navigate from 'month' to 'week'
                calendarEvents={calendarEvents}
                onAddEvent={handleAddEvent}
                onEventClick={handleEventClick}
              />
            )}
          </CardBody>
        </Card>

        {/* Instructions for month view */}
        {currentView === 'month' && userRole !== 'sea' && (
          <div className="mt-4 text-sm text-gray-600">
            <p>Click the checkbox to mark the day as a holiday.</p>
          </div>
        )}
      </div>
      
      {/* Event Modal */}
      {showEventModal && (
        <CalendarEventModal
          isOpen={showEventModal}
          onClose={() => {
            setShowEventModal(false);
            setSelectedEvent(null);
          }}
          onSave={handleEventSave}
          selectedDate={selectedEventDate}
          event={selectedEvent}
          providerId={providerId}
          schoolSite={currentSchool?.school_site}
          schoolDistrict={currentSchool?.school_district}
        />
      )}

      {/* Holiday Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Add Holiday</h3>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            {!currentSchool ? (
              <p className="text-red-600 text-sm mb-4">Please select a school first</p>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  {selectedDate?.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
                <input
                  type="text"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="Holiday name (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddHoliday();
                    }
                  }}
                />
              </>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowHolidayModal(false);
                  setHolidayName('');
                  setSelectedDate(null);
                  setError(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAddHoliday}
                disabled={!currentSchool}
                className={`px-4 py-2 rounded-md ${
                  currentSchool 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Add Holiday
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}