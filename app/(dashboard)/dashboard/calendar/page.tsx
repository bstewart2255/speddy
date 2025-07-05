"use client";

import React, { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardBody } from "../../../components/ui/card";
import { CalendarTodayView } from "../../../components/calendar/calendar-today-view";
import { CalendarWeekView } from "../../../components/calendar/calendar-week-view";
import { CalendarMonthView } from "../../../components/calendar/calendar-month-view";
import { useSchool } from "../../../components/providers/school-context";
import { Database } from "../../../../src/types/database";

type ViewType = 'today' | 'week' | 'month';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

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
  const supabase = createClientComponentClient();

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
        .select('id, initials')
        .eq('provider_id', user.id);

      if (studentError) throw studentError;

      const studentMap = new Map();
      studentData?.forEach(student => {
        studentMap.set(student.id, student);
      });
      setStudents(studentMap);

      // Fetch holidays
      if (currentSchool) {
        const { data: holidayData, error: holidayError } = await supabase
          .from('holidays')
          .select('*')
          .eq('school_site', currentSchool.site)
          .eq('school_district', currentSchool.district);

        if (holidayError) throw holidayError;
        setHolidays(holidayData || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
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
          <p className="text-gray-600">View your sessions in calendar view and mark down holidays.</p>
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
            {currentView === 'today' && (
              <CalendarTodayView 
                sessions={sessions} 
                students={students}
                onSessionClick={handleSessionClick}
              />
            )}
            {currentView === 'week' && (
              <CalendarWeekView 
                sessions={sessions} 
                students={students}
                onSessionClick={handleSessionClick}
              />
            )}
            {currentView === 'month' && (
              <CalendarMonthView 
                sessions={sessions} 
                holidays={holidays}
                onDayClick={handleDayClick}
                userRole={userRole}
              />
            )}
          </CardBody>
        </Card>

        {/* Instructions for month view */}
        {currentView === 'month' && userRole !== 'sea' && (
          <div className="mt-4 text-sm text-gray-600">
            <p>Click on any day to mark it as a holiday. Click again to remove the holiday.</p>
          </div>
        )}
      </div>
      
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