'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getStudentDetails, getStudentResourceSchedule } from '@/lib/supabase/queries/teacher-portal';
import { Card } from '@/app/components/ui/card';
import Link from 'next/link';

type StudentDetail = {
  id: string;
  initials: string;
  grade_level: string;
  sessions_per_week: number;
  minutes_per_session: number;
  student_details: {
    iep_goals: string[];
    upcoming_iep_date: string | null;
  } | null;
  profiles: {
    full_name: string;
  } | null;
};

type ScheduleSession = {
  id: string;
  session_date: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  service_type: string;
};

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [schedule, setSchedule] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStudentData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch student details
        const studentData = await getStudentDetails(studentId);
        setStudent(studentData as unknown as StudentDetail);

        // Fetch schedule
        const scheduleData = await getStudentResourceSchedule(studentId);
        setSchedule(scheduleData as ScheduleSession[]);
      } catch (err) {
        console.error('Error fetching student data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load student details');
      } finally {
        setLoading(false);
      }
    };

    if (studentId) {
      fetchStudentData();
    }
  }, [studentId]);

  const formatTime = (time: string | null) => {
    if (!time) return 'TBD';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getDayName = (dayNumber: number | null) => {
    if (dayNumber === null) return 'TBD';
    return DAYS_OF_WEEK[dayNumber - 1] || 'Unknown';
  };

  const calculateDuration = (startTime: string | null, endTime: string | null) => {
    if (!startTime || !endTime) return null;
    const start = new Date(`1970-01-01T${startTime}`);
    const end = new Date(`1970-01-01T${endTime}`);
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return minutes;
  };

  // Parse date string as local date to avoid timezone shift
  // Supabase returns dates like "2025-11-18" which JS interprets as UTC midnight
  // This would shift the date by a day for non-UTC timezones
  const formatSessionDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Date TBD';

    // Parse as local date by appending time component
    const localDate = new Date(dateString + 'T00:00:00');
    return localDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading student details...</p>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-4">
          <Link
            href="/dashboard/teacher/my-students"
            className="text-blue-600 hover:text-blue-800 flex items-center"
          >
            <svg className="h-5 w-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Students
          </Link>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading student</h3>
              <p className="mt-1 text-sm text-red-700">{error || 'Student not found or access denied'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const iepGoals = student.student_details?.iep_goals || [];
  const upcomingIepDate = student.student_details?.upcoming_iep_date;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Back Button */}
      <div className="mb-4">
        <Link
          href="/dashboard/teacher/my-students"
          className="text-blue-600 hover:text-blue-800 flex items-center"
        >
          <svg className="h-5 w-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Students
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Student: {student.initials}</h1>
        <div className="flex items-center gap-4 mt-2">
          <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
            {student.grade_level}
          </span>
          <span className="text-gray-600">
            Resource Specialist: <strong>{student.profiles?.full_name || 'N/A'}</strong>
          </span>
        </div>
      </div>

      {/* Service Details */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-6">
        <Card className="p-6">
          <dt className="text-sm font-medium text-gray-500">Sessions per Week</dt>
          <dd className="mt-1 text-2xl font-semibold text-gray-900">{student.sessions_per_week}</dd>
        </Card>
        <Card className="p-6">
          <dt className="text-sm font-medium text-gray-500">Minutes per Session</dt>
          <dd className="mt-1 text-2xl font-semibold text-gray-900">{student.minutes_per_session}</dd>
        </Card>
        <Card className="p-6">
          <dt className="text-sm font-medium text-gray-500">IEP Goals</dt>
          <dd className="mt-1 text-2xl font-semibold text-gray-900">{iepGoals.length}</dd>
        </Card>
      </div>

      {/* IEP Goals */}
      <Card className="mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">IEP Goals</h2>
            {upcomingIepDate && (
              <span className="text-sm text-gray-500">
                Next IEP: {new Date(upcomingIepDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="px-6 py-4">
          {iepGoals.length === 0 ? (
            <p className="text-gray-500 italic">No IEP goals recorded.</p>
          ) : (
            <ul className="space-y-4">
              {iepGoals.map((goal, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-800 text-sm font-semibold">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-gray-800">{goal}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Resource Schedule */}
      <Card>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Weekly Resource Schedule</h2>
        </div>
        <div className="px-6 py-4">
          {schedule.length === 0 ? (
            <p className="text-gray-500 italic">No scheduled sessions.</p>
          ) : (
            <div className="space-y-3">
              {schedule.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {getDayName(session.day_of_week)}, {formatSessionDate(session.session_date)}
                    </p>
                    <p className="text-sm text-gray-600 capitalize">{session.service_type}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {formatTime(session.start_time)} - {formatTime(session.end_time)}
                    </p>
                    {calculateDuration(session.start_time, session.end_time) !== null && (
                      <p className="text-sm text-gray-600">
                        {calculateDuration(session.start_time, session.end_time)} minutes
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
