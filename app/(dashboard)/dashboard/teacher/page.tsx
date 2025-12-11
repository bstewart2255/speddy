'use client';

import { useState, useEffect } from 'react';
import {
  getCurrentTeacher,
  getMyStudentsInResource,
  getTodayStudentSessions,
  getTodaySpecialActivities,
  getTodayHolidays
} from '@/lib/supabase/queries/teacher-portal';
import Link from 'next/link';
import { Card } from '@/app/components/ui/card';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Helper to format time as "9:00 AM"
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
}

// Helper to calculate duration in minutes
function getDuration(start: string, end: string): number {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  return (endH * 60 + endM) - (startH * 60 + startM);
}

interface TodayViewProps {
  sessions: any[];
  activities: any[];
  holidays: any[];
  isWeekend: boolean;
}

function TodayView({ sessions, activities, holidays, isWeekend }: TodayViewProps) {
  const today = new Date();
  const dayName = DAYS_OF_WEEK[today.getDay()];
  const dateStr = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  // Weekend state
  if (isWeekend) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Today&apos;s Schedule</h2>
        <p className="text-gray-500">{dayName}, {dateStr}</p>
        <div className="mt-4 text-center py-8 text-gray-500">
          No school today - it&apos;s the weekend!
        </div>
      </Card>
    );
  }

  // Holiday state
  if (holidays.length > 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Today&apos;s Schedule</h2>
        <p className="text-gray-500">{dayName}, {dateStr}</p>
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <span className="text-red-600 font-medium">
            {holidays[0].name || 'Holiday'} - No sessions today
          </span>
        </div>
      </Card>
    );
  }

  const hasContent = sessions.length > 0 || activities.length > 0;

  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Schedule</h2>
        <p className="text-sm text-gray-500">{dayName}, {dateStr}</p>
      </div>

      <div className="p-6">
        {!hasContent ? (
          <div className="text-center py-8 text-gray-500">
            No sessions or activities scheduled for today
          </div>
        ) : (
          <div className="space-y-6">
            {/* Student Sessions */}
            {sessions.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Students in Resource ({sessions.length})
                </h3>
                <div className="space-y-2">
                  {sessions.map((session: any) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3 bg-blue-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-blue-900">
                          {session.students?.initials}
                        </span>
                        <span className="text-sm text-blue-700">
                          Grade {session.students?.grade_level}
                        </span>
                      </div>
                      <div className="text-sm text-blue-800">
                        {formatTime(session.start_time)} - {formatTime(session.end_time)}
                        <span className="ml-2 text-blue-600">
                          ({getDuration(session.start_time, session.end_time)} min)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Special Activities */}
            {activities.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Your Special Activities ({activities.length})
                </h3>
                <div className="space-y-2">
                  {activities.map((activity: any) => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                    >
                      <span className="font-medium text-green-900">
                        {activity.activity_name}
                      </span>
                      <span className="text-sm text-green-800">
                        {formatTime(activity.start_time)} - {formatTime(activity.end_time)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function TeacherDashboardPage() {
  const [teacher, setTeacher] = useState<any>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todaySessions, setTodaySessions] = useState<any[]>([]);
  const [todayActivities, setTodayActivities] = useState<any[]>([]);
  const [todayHolidays, setTodayHolidays] = useState<any[]>([]);
  const [isWeekend, setIsWeekend] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Check if it's a weekend
        const today = new Date();
        const dayOfWeek = today.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          setIsWeekend(true);
        }

        // Fetch teacher info
        const teacherData = await getCurrentTeacher();
        setTeacher(teacherData);

        // Fetch all data in parallel
        const [students, sessions, activities, holidays] = await Promise.all([
          getMyStudentsInResource(),
          getTodayStudentSessions(),
          getTodaySpecialActivities(),
          getTodayHolidays()
        ]);

        setStudentCount(students.length);
        setTodaySessions(sessions);
        setTodayActivities(activities);
        setTodayHolidays(holidays);
      } catch (err) {
        console.error('Error loading dashboard:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const teacherName = teacher
    ? `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim()
    : 'Teacher';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome, {teacherName}</h1>
        <p className="mt-2 text-gray-600">
          Manage your students in resource and coordinate with resource specialists
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card className="overflow-hidden">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Students in Resource</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{studentCount}</dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-6 py-3">
            <Link href="/dashboard/teacher/my-students" className="text-sm font-medium text-blue-600 hover:text-blue-500">
              View all students →
            </Link>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Special Activities</dt>
                  <dd className="text-2xl font-semibold text-gray-900">Manage</dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-6 py-3">
            <Link href="/dashboard/teacher/special-activities" className="text-sm font-medium text-green-600 hover:text-green-500">
              View activities →
            </Link>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">IEP Goals</dt>
                  <dd className="text-2xl font-semibold text-gray-900">View</dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-6 py-3">
            <Link href="/dashboard/teacher/my-students" className="text-sm font-medium text-purple-600 hover:text-purple-500">
              Access student IEPs →
            </Link>
          </div>
        </Card>
      </div>

      {/* Today's Schedule */}
      <TodayView
        sessions={todaySessions}
        activities={todayActivities}
        holidays={todayHolidays}
        isWeekend={isWeekend}
      />

      {/* Information Card */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-blue-800">About the Teacher Portal</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                Use this portal to:
              </p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>View which students are in resource and when they're scheduled</li>
                <li>Access student IEP goals to coordinate instruction</li>
                <li>Create special activities that appear in the resource specialist's schedule</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
