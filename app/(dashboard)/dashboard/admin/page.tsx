'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getCurrentAdminPermissions,
  getSchoolStaff,
  getDistrictInfo,
  getDistrictStaffCounts,
  getSchoolStudentCount
} from '@/lib/supabase/queries/admin-accounts';
import {
  getTodaySchoolSessions,
  type SessionWithDetails
} from '@/lib/supabase/queries/admin-dashboard';
import Link from 'next/link';
import { Card } from '@/app/components/ui/card';

// Helper functions for Today's Sessions widget
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function getDuration(start: string, end: string): number {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  return (endH * 60 + endM) - (startH * 60 + startM);
}

function getRoleColor(role: string): { bg: string; text: string } {
  switch (role.toLowerCase()) {
    case 'resource':
      return { bg: 'bg-blue-50', text: 'text-blue-700' };
    case 'speech':
      return { bg: 'bg-purple-50', text: 'text-purple-700' };
    case 'ot':
      return { bg: 'bg-green-50', text: 'text-green-700' };
    case 'counseling':
      return { bg: 'bg-amber-50', text: 'text-amber-700' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-700' };
  }
}

function formatRoleDisplay(role: string): string {
  switch (role.toLowerCase()) {
    case 'resource':
      return 'Resource';
    case 'speech':
      return 'Speech';
    case 'ot':
      return 'OT';
    case 'counseling':
      return 'Counseling';
    case 'sea':
      return 'SEA';
    case 'psychologist':
      return 'Psych';
    default:
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

// Today's Sessions Widget Component
function TodaySessionsWidget({
  sessions,
  isWeekend,
  holiday
}: {
  sessions: SessionWithDetails[];
  isWeekend: boolean;
  holiday: { name: string } | null;
}) {
  const today = new Date();
  const dayName = DAYS_OF_WEEK[today.getDay()];
  const dateStr = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  // Group sessions by time slot
  const sessionsByTime = sessions.reduce((acc, session) => {
    const timeKey = `${session.start_time}-${session.end_time}`;
    if (!acc[timeKey]) {
      acc[timeKey] = [];
    }
    acc[timeKey].push(session);
    return acc;
  }, {} as Record<string, SessionWithDetails[]>);

  // Sort time slots chronologically
  const sortedTimeSlots = Object.keys(sessionsByTime).sort((a, b) => {
    const aStart = a.split('-')[0];
    const bStart = b.split('-')[0];
    return aStart.localeCompare(bStart);
  });

  return (
    <Card className="p-6 mb-8">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Today's Sessions</h2>
        <p className="text-sm text-gray-600">{dayName}, {dateStr}</p>
      </div>

      {/* Weekend state */}
      {isWeekend && (
        <div className="text-center py-8 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          <p className="text-base">No school today - it's the weekend!</p>
        </div>
      )}

      {/* Holiday state */}
      {!isWeekend && holiday && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-red-700 font-medium">{holiday.name}</span>
          </div>
          <p className="mt-1 text-sm text-red-600">No sessions scheduled today</p>
        </div>
      )}

      {/* No sessions state */}
      {!isWeekend && !holiday && sessions.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-base">No sessions scheduled today</p>
        </div>
      )}

      {/* Sessions list grouped by time */}
      {!isWeekend && !holiday && sessions.length > 0 && (
        <div className="space-y-4">
          {sortedTimeSlots.map((timeSlot) => {
            const [startTime, endTime] = timeSlot.split('-');
            const slotSessions = sessionsByTime[timeSlot];

            return (
              <div key={timeSlot}>
                <div className="text-sm font-medium text-gray-700 mb-2">
                  {formatTime(startTime)} - {formatTime(endTime)}
                </div>
                <div className="space-y-2">
                  {slotSessions.map((session) => {
                    const roleColors = getRoleColor(session.provider.role);
                    const duration = getDuration(session.start_time, session.end_time);

                    return (
                      <div
                        key={session.id}
                        className={`${roleColors.bg} rounded-lg px-4 py-3 flex items-center justify-between`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">
                            {session.student.initials}
                          </span>
                          <span className="text-gray-500 text-sm">
                            ({session.student.grade_level})
                          </span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-700 flex items-center">
                            {session.provider.full_name}
                            {session.isAssigned && (
                              <span
                                className="ml-1.5 w-2 h-2 rounded-full bg-purple-500"
                                title="Assigned session"
                              />
                            )}
                          </span>
                          <span className={`text-sm ${roleColors.text}`}>
                            ({formatRoleDisplay(session.provider.role)})
                          </span>
                        </div>
                        <span className="text-sm text-gray-500">{duration} min</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function AdminDashboardPage() {
  const [permissions, setPermissions] = useState<any>(null);
  const [staffCounts, setStaffCounts] = useState({ teachers: 0, specialists: 0, schools: 0, students: 0 });
  const [districtInfo, setDistrictInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  // Today's Sessions state (site admin only)
  const [todaySessions, setTodaySessions] = useState<SessionWithDetails[]>([]);
  const [isWeekend, setIsWeekend] = useState(false);
  const [todayHoliday, setTodayHoliday] = useState<{ name: string } | null>(null);
  const supabase = createClient();

  const isDistrictAdmin = permissions?.role === 'district_admin';

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current user profile
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        setProfile(profileData);

        // Fetch admin permissions
        const perms = await getCurrentAdminPermissions();

        if (!perms || perms.length === 0) {
          setError('No admin permissions found. Please contact your administrator.');
          return;
        }

        setPermissions(perms[0]); // Assuming single permission for now

        // Different data fetching based on admin type
        if (perms[0]?.role === 'district_admin' && perms[0]?.district_id) {
          // District admin - fetch district-level data
          const [district, counts] = await Promise.all([
            getDistrictInfo(perms[0].district_id),
            getDistrictStaffCounts(perms[0].district_id)
          ]);
          setDistrictInfo(district);
          setStaffCounts({
            teachers: counts.teachers ?? 0,
            specialists: counts.specialists ?? 0,
            schools: counts.schools ?? 0,
            students: 0 // Students not shown on district admin dashboard
          });
        } else if (perms[0]?.school_id) {
          // Site admin - fetch school-level data
          const [staff, studentCount, scheduleData] = await Promise.all([
            getSchoolStaff(perms[0].school_id),
            getSchoolStudentCount(perms[0].school_id),
            getTodaySchoolSessions(perms[0].school_id)
          ]);
          setStaffCounts({
            teachers: staff.teachers.length,
            specialists: staff.specialists.length,
            schools: 1,
            students: studentCount
          });
          // Set today's sessions data
          setTodaySessions(scheduleData.sessions);
          setIsWeekend(scheduleData.isWeekend);
          setTodayHoliday(scheduleData.holiday);
        }
      } catch (err) {
        console.error('Error loading dashboard:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [supabase]);

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

  if (!permissions) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">No admin permissions</h3>
              <p className="mt-1 text-sm text-yellow-700">
                Your account does not have any admin permissions assigned. Please contact your system administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const adminName = profile?.full_name || 'Admin';
  const roleDisplay = permissions.role === 'site_admin' ? 'Site Admin' : 'District Admin';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome, {adminName}</h1>
        <div className="mt-2 text-sm text-gray-600 space-y-1">
          <p className="text-base">
            {roleDisplay} Dashboard{isDistrictAdmin && districtInfo ? ` - ${districtInfo.name}` : ' - Manage staff accounts and school settings'}
          </p>
          {isDistrictAdmin && districtInfo && (
            <p>
              <span className="font-medium">District ID:</span> <span className="font-mono">{districtInfo.id}</span>
              {districtInfo.city && (
                <> · {districtInfo.city}{districtInfo.zip ? `, ${districtInfo.zip}` : ''}</>
              )}
              {districtInfo.phone && (
                <> · {districtInfo.phone}</>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className={`grid grid-cols-1 ${isDistrictAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6 mb-8`}>
        {/* Schools card - only for district admin */}
        {isDistrictAdmin && (
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Schools</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{staffCounts.schools}</p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-full">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
            <Link
              href="/dashboard/admin/schools"
              className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center"
            >
              View all schools
              <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </Card>
        )}

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Teachers</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{staffCounts.teachers}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          {!isDistrictAdmin && (
            <Link
              href="/dashboard/admin/teachers"
              className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 inline-flex items-center"
            >
              View teacher directory
              <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
          {isDistrictAdmin && (
            <p className="mt-4 text-sm text-gray-500">
              Across all schools
            </p>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Providers</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{staffCounts.specialists}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          {!isDistrictAdmin && (
            <Link
              href="/dashboard/admin/providers"
              className="mt-4 text-sm font-medium text-green-600 hover:text-green-700 inline-flex items-center"
            >
              View provider directory
              <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
          {isDistrictAdmin && (
            <p className="mt-4 text-sm text-gray-500">
              Across all schools
            </p>
          )}
        </Card>

        {!isDistrictAdmin && (
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Students</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {staffCounts.students}
                </p>
              </div>
              <div className="p-3 bg-amber-100 rounded-full">
                <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
            <Link
              href="/dashboard/admin/students"
              className="mt-4 text-sm font-medium text-amber-600 hover:text-amber-700 inline-flex items-center"
            >
              View all students
              <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </Card>
        )}
      </div>

      {/* Today's Sessions Widget - only for site admins */}
      {!isDistrictAdmin && (
        <TodaySessionsWidget
          sessions={todaySessions}
          isWeekend={isWeekend}
          holiday={todayHoliday}
        />
      )}

      {/* Quick Actions - only for district admins */}
      {isDistrictAdmin && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              href="/dashboard/admin/schools"
              className="flex items-center p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-500 hover:shadow-md transition-all"
            >
              <div className="flex-shrink-0 p-3 bg-indigo-100 rounded-lg">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">View Schools</h3>
                <p className="text-sm text-gray-600">Browse all schools in your district</p>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/care"
              className="flex items-center p-4 bg-white border border-gray-200 rounded-lg hover:border-purple-500 hover:shadow-md transition-all"
            >
              <div className="flex-shrink-0 p-3 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">CARE Referrals</h3>
                <p className="text-sm text-gray-600">View student support referrals</p>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/create-account"
              className="flex items-center p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
            >
              <div className="flex-shrink-0 p-3 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">Create New Account</h3>
                <p className="text-sm text-gray-600">Add a teacher or provider account</p>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
