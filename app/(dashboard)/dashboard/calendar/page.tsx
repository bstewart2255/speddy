"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from '@/lib/supabase/client';
import { Card, CardBody } from "../../../components/ui/card";
import { CalendarDayView } from "../../../components/calendar/calendar-day-view";
import { CalendarWeekView } from "../../../components/calendar/calendar-week-view";
import { CalendarMonthView } from "../../../components/calendar/calendar-month-view";
import { CalendarEventModal } from "../../../components/calendar/calendar-event-modal";
import { useSchool } from "../../../components/providers/school-context";
import { ToastProvider } from "../../../contexts/toast-context";
import { exportWeekToPDF } from "@/lib/utils/export-week-to-pdf";
import type { Database } from "../../../../src/types/database";
import { getSchoolSite, getSchoolDistrict } from "@/lib/types/school";

type ViewType = 'day' | 'week' | 'month';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'];
type Holiday = Database['public']['Tables']['holidays']['Row'];

interface Student {
  id: string;
  initials: string;
  grade_level: string;
}

export default function CalendarPage() {
  const [currentView, setCurrentView] = useState<ViewType>('day');
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
  const supabase = useMemo(() => createClient<Database>(), []);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEventDate, setSelectedEventDate] = useState<Date>(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [providerId, setProviderId] = useState<string>('');

  // Helper function to fetch calendar events
  const getCalendarEvents = useCallback(async (providerIdParam?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    const effectiveProviderId = providerIdParam || providerId || user.id;
    
    let eventsQuery = supabase
      .from('calendar_events')
      .select('*')
      .eq('provider_id', effectiveProviderId);
    
    // Apply school filter if currentSchool is available (normalize aliases)
    if (currentSchool) {
      const schoolId = currentSchool.school_id ?? null;
      const schoolSite = getSchoolSite(currentSchool);
      const schoolDistrict = getSchoolDistrict(currentSchool);

      if (schoolSite && schoolDistrict) {
        // Filter by school_site and school_district which includes all events at this school
        // This works for both legacy (NULL school_id) and migrated (populated school_id) events
        eventsQuery = eventsQuery
          .eq('school_site', schoolSite)
          .eq('school_district', schoolDistrict);
      }
    }
    
    const { data: eventsData, error } = await eventsQuery.order('date', { ascending: true });
    
    if (error) {
      console.error('Error fetching calendar events:', error);
      return [];
    }
    
    return eventsData || [];
  }, [supabase, providerId, currentSchool]);

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

  const fetchData = useCallback(async () => {
    try {
      // Get user profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, works_at_multiple_schools')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserRole(profile.role);

        // If user works at multiple schools, wait for school context to be selected
        if (profile.works_at_multiple_schools && !currentSchool) {
          console.log('[DEBUG] User works at multiple schools, waiting for school selection');
          // Still set the provider ID so other things can work
          setProviderId(user.id);
          setLoading(false);
          return;
        }
      }

      setProviderId(user.id);

      // Fetch session INSTANCES (not templates) filtered by current school
      // Instances have actual session_date values
      // For SEAs: filter by assigned_to_sea_id, for others: filter by provider_id
      let sessionQuery = supabase
        .from('schedule_sessions')
        .select(`
          *,
          students!inner(
            school_id,
            district_id,
            school_site,
            school_district
          )
        `)
        .not('session_date', 'is', null); // Only fetch instances, not templates

      if (profile?.role === 'sea') {
        sessionQuery = sessionQuery
          .eq('assigned_to_sea_id', user.id)
          .eq('delivered_by', 'sea');
      } else {
        sessionQuery = sessionQuery.eq('provider_id', user.id);
      }

      // Apply school filter if currentSchool is available (normalize aliases)
      if (currentSchool) {
        const schoolId = currentSchool.school_id ?? null;
        const schoolSite = getSchoolSite(currentSchool);
        const schoolDistrict = getSchoolDistrict(currentSchool);

        if (schoolSite && schoolDistrict) {
          // Filter by school_site and school_district which includes all students at this school
          // This works for both legacy (NULL school_id) and migrated (populated school_id) students
          // since all students at the same school share these text field values
          sessionQuery = sessionQuery
            .eq('students.school_site', schoolSite)
            .eq('students.school_district', schoolDistrict);
        }
      }

      const { data: sessionData, error: sessionError } = await sessionQuery;

      if (sessionError) throw sessionError;
      
      // Extract just the session data (without the joined student data)
      const sessionRows = sessionData?.map(item => {
        const { students, ...session } = item;
        return session;
      }) || [];
      
      setSessions(sessionRows);

      // Fetch students filtered by current school
      // For SEAs: use get_sea_students RPC, for others: query students table
      let studentData;
      let studentError;

      if (profile?.role === 'sea') {
        // SEAs use RPC function to get their students
        // Pass both school_id and legacy school_site+district for migration compatibility
        const schoolId = currentSchool?.school_id ?? undefined;
        const schoolSite = getSchoolSite(currentSchool) ?? undefined;
        const schoolDistrict = getSchoolDistrict(currentSchool) ?? undefined;

        const result = await supabase
          .rpc('get_sea_students', {
            p_school_id: schoolId,
            p_school_site: schoolSite,
            p_school_district: schoolDistrict
          });
        studentData = result.data;
        studentError = result.error;
      } else {
        // Other roles fetch students by provider_id
        let studentQuery = supabase
          .from('students')
          .select('id, initials, grade_level')
          .eq('provider_id', user.id);

        // Apply school filter if currentSchool is available (normalize aliases)
        if (currentSchool) {
          const schoolId = currentSchool.school_id ?? null;
          const schoolSite = getSchoolSite(currentSchool);
          const schoolDistrict = getSchoolDistrict(currentSchool);

          if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_LOGGING === 'true') {
            console.log('[DEBUG] Filtering students with school context:', {
              currentSchool,
              schoolId,
              schoolSite,
              schoolDistrict
            });
          }

          if (schoolSite && schoolDistrict) {
            if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_LOGGING === 'true') {
              console.log('[DEBUG] Filtering students by school_site and district:', schoolSite, schoolDistrict);
            }
            // Filter by school_site and school_district which includes all students at this school
            // This works for both legacy (NULL school_id) and migrated (populated school_id) students
            studentQuery = studentQuery
              .eq('school_site', schoolSite)
              .eq('school_district', schoolDistrict);
          } else if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_LOGGING === 'true') {
            console.warn('[DEBUG] No valid school filter criteria, students may include all schools');
          }
        } else if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_LOGGING === 'true') {
          console.warn('[DEBUG] No currentSchool context, loading all students for provider');
        }

        const result = await studentQuery;
        studentData = result.data;
        studentError = result.error;
      }

      if (studentError) throw studentError;

      // Only log aggregate counts in debug mode, never expose PII
      if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_LOGGING === 'true') {
        console.log('[DEBUG] Students loaded - Count:', studentData?.length || 0);
      }

      const studentMap = new Map<string, Student>();
      studentData?.forEach(student => {
        studentMap.set(student.id, student);
      });
      setStudents(studentMap);

      // Fetch calendar events using the helper
      const eventsData = await getCalendarEvents(user.id);
      setCalendarEvents(eventsData);

      // Fetch holidays - add better error handling and logging
      if (currentSchool) {
        // Log to see what properties currentSchool actually has
        console.log('Current school object:', currentSchool);
        console.log('Current school keys:', Object.keys(currentSchool));

        // Check which properties exist (handles both legacy and current field names)
        const schoolSite = getSchoolSite(currentSchool);
        const schoolDistrict = getSchoolDistrict(currentSchool);

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
  }, [currentSchool, supabase, getCalendarEvents]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddEvent = (date: Date) => {
    setSelectedEventDate(date);
    setSelectedEvent(null);
    setShowEventModal(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setSelectedEventDate(new Date(event.date + "T00:00:00"));
    setShowEventModal(true);
  };

  const handleEventSave = async (event: CalendarEvent) => {
    // Refresh calendar events using the centralized helper
    const eventsData = await getCalendarEvents();
    setCalendarEvents(eventsData);
  };

  const handleDayClick = async (date: Date) => {
    // Allow resource, SEA, and admin roles to mark holidays
    const eligibleRoles = ['resource', 'sea', 'admin'];
    if (!eligibleRoles.includes(userRole)) return;

    const dateStr = date.toISOString().split('T')[0];
    const existingHoliday = holidays.find(h => h.date === dateStr);

    if (existingHoliday) {
      // Confirm before removing holiday
      const isPastDate = new Date(dateStr) < new Date();
      const holidayDisplayName = existingHoliday.name || 'Unnamed Holiday';
      
      // Only admins can delete past holidays
      if (isPastDate && userRole !== 'admin') {
        alert('Only administrators can delete past holidays.');
        return;
      }
      
      const confirmMessage = `Are you sure you want to remove "${holidayDisplayName}" on ${date.toLocaleDateString()}?${isPastDate ? ' This is a past date.' : ''}`;
      
      if (!confirm(confirmMessage)) return;

      const { error } = await supabase
        .from('holidays')
        .delete()
        .eq('id', existingHoliday.id);

      if (error) {
        console.error('Error removing holiday:', error);
        alert(`Failed to remove holiday: ${error.message || 'Unknown error'}. Please try again.`);
      } else {
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
        school_district: currentSchool.school_district,
        school_id: currentSchool.school_id || null,
        district_id: currentSchool.district_id || null
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

  const handleExportWeekToPDF = () => {
    // Calculate the week dates based on weekOffset
    const today = new Date();
    today.setDate(today.getDate() + (weekOffset * 7));

    const currentDay = today.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay; // Adjust for Monday start
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);

    const weekDates: Date[] = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      weekDates.push(date);
    }

    // Filter sessions to only include the current week
    const weekSessions = sessions.filter((session) => {
      if (!session.day_of_week) return false;
      return session.day_of_week >= 1 && session.day_of_week <= 5;
    });

    // Export to PDF
    exportWeekToPDF({
      sessions: weekSessions,
      students,
      weekDates
    });
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
                onClick={() => setCurrentView('day')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  currentView === 'day'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Day
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
              {/* Hide Month view for SEAs */}
              {userRole !== 'sea' && (
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
              )}
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
                  if (currentView === 'day') handlePreviousDay();
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
                  {currentView === 'day' && currentDate.toLocaleDateString('en-US', {
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
                {((currentView === 'day' && currentDate.toDateString() !== new Date().toDateString()) ||
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
                  if (currentView === 'day') handleNextDay();
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

            {currentView === 'day' && (
              <ToastProvider>
                <CalendarDayView 
                  sessions={sessions} 
                  students={students}
                  onSessionClick={handleSessionClick}
                  currentDate={currentDate}
                  holidays={holidays.map(h => ({ ...h, name: h.name || undefined }))}
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
                  holidays={holidays.map(h => ({ ...h, name: h.name || undefined }))}
                  calendarEvents={calendarEvents}
                  onAddEvent={handleAddEvent}
                  onEventClick={handleEventClick}
                  onExportPDF={handleExportWeekToPDF}
                />
              </ToastProvider>
            )}
            {currentView === 'month' && (
              <CalendarMonthView 
                sessions={sessions} 
                holidays={holidays.map(h => ({ ...h, name: h.name || undefined }))}
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
        {currentView === 'month' && ['resource', 'sea', 'admin'].includes(userRole) && (
          <div className="mt-4 text-sm text-gray-600">
            <p>Click the checkbox to mark the day as a holiday.</p>
            {userRole !== 'admin' && (
              <p className="text-xs text-gray-500 mt-1">
                Note: Only administrators can modify past holidays.
              </p>
            )}
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
          schoolId={currentSchool?.school_id || undefined}
          districtId={currentSchool?.district_id || undefined}
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
                  onKeyDown={(e) => {
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