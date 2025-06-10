'use client';

import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardBody } from '../../../components/ui/card';
import { AutoScheduleAll } from '../../../components/schedule/auto-schedule-all';

interface Student {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
  sessions_per_week: number;
  minutes_per_session: number;
}

interface ScheduleSession {
  id: string;
  student_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  service_type: string;
}

interface BellSchedule {
  id: string;
  grade_level: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  period_name: string;
}

interface SpecialActivity {
  id: string;
  teacher_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  activity_name: string;
}

export default function SchedulePage() {
  const [providerRole, setProviderRole] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [bellSchedules, setBellSchedules] = useState<BellSchedule[]>([]);
  const [specialActivities, setSpecialActivities] = useState<SpecialActivity[]>([]);
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClientComponentClient();

  // Helper function to format time for display
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Fetch all data
  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      console.log('Fetching data for user:', user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile) {
        setProviderRole(profile.role);
        console.log('Provider role:', profile.role);
      }

      const [studentsData, bellData, activitiesData, sessionsData] = await Promise.all([
        supabase.from('students').select('*').eq('provider_id', user.id),
        supabase.from('bell_schedules').select('*').eq('provider_id', user.id),
        supabase.from('special_activities').select('*').eq('provider_id', user.id),
        supabase.from('schedule_sessions').select('*').eq('provider_id', user.id)
      ]);

      console.log('Fetched data:', {
        students: studentsData.data?.length || 0,
        bellSchedules: bellData.data?.length || 0,
        specialActivities: activitiesData.data?.length || 0,
        sessions: sessionsData.data?.length || 0,
        sessionDetails: sessionsData.data
      });

      if (studentsData.data) setStudents(studentsData.data);
      if (bellData.data) setBellSchedules(bellData.data);
      if (activitiesData.data) setSpecialActivities(activitiesData.data);
      if (sessionsData.data) setSessions(sessionsData.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle session deletion
  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to remove this session?')) {
      return;
    }

    const { error } = await supabase
      .from('schedule_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      alert('Failed to delete session: ' + error.message);
    } else {
      fetchData();
    }
  };

  // Define days and time slots
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timeSlots = Array.from({ length: 16 }, (_, i) => {
    const hour = 8 + Math.floor(i / 2);
    const minute = (i % 2) * 30;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Weekly Schedule</h1>
            <p className="text-gray-600">View and manage sessions</p>
          </div>
          <AutoScheduleAll />
        </div>

        {/* Color Key Legend */}
        <div className="mb-6 bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Grade Levels</h3>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-400 rounded"></div>
              <span className="text-sm text-gray-600">Kindergarten</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-sky-400 rounded"></div>
              <span className="text-sm text-gray-600">1st Grade</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-cyan-400 rounded"></div>
              <span className="text-sm text-gray-600">2nd Grade</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-emerald-400 rounded"></div>
              <span className="text-sm text-gray-600">3rd Grade</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-400 rounded"></div>
              <span className="text-sm text-gray-600">4th Grade</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-rose-400 rounded"></div>
              <span className="text-sm text-gray-600">5th Grade</span>
            </div>
          </div>
        </div>

        {/* Schedule Grid */}
        <Card>
          <CardBody className="p-0">
            {/* Grid Header */}
            <div className="grid grid-cols-6 bg-gray-50 border-b">
              <div className="p-3 font-semibold text-gray-700 text-center border-r">Time</div>
              {days.map((day) => (
                <div key={day} className="p-3 font-semibold text-gray-700 text-center border-r last:border-r-0">
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Body */}
            <div className="grid grid-cols-6 auto-rows-min">
              {timeSlots.map((time) => (
                <React.Fragment key={time}>
                  {/* Time Label */}
                  <div className="p-2 text-xs text-gray-500 text-center bg-gray-50 border-r border-b font-medium">
                    {formatTime(time)}
                  </div>

                  {/* Day Slots */}
                  {days.map((day, dayIndex) => {
                  const sessionInSlot = sessions.find(session => {
                    // Compare just hours and minutes, ignoring seconds
                    const sessionTime = session.start_time.substring(0, 5); // Gets "HH:MM" from "HH:MM:SS"
                    return session.day_of_week === dayIndex + 1 && sessionTime === time;
                  });

                    return (
                      <div
                        key={`${day}-${time}`}
                        className="p-2 min-h-[60px] border-r border-b last:border-r-0 relative bg-white"
                      >
                        {sessionInSlot && (() => {
                          const student = students.find(s => s.id === sessionInSlot.student_id);
                          const gradeColorMap: { [key: string]: string } = {
                            'K': 'bg-purple-400 hover:bg-purple-500',
                            '1': 'bg-sky-400 hover:bg-sky-500',
                            '2': 'bg-cyan-400 hover:bg-cyan-500',
                            '3': 'bg-emerald-400 hover:bg-emerald-500',
                            '4': 'bg-amber-400 hover:bg-amber-500',
                            '5': 'bg-rose-400 hover:bg-rose-500'
                          };
                          const gradeColor = student ? gradeColorMap[student.grade_level] || 'bg-gray-400' : 'bg-gray-400';

                          return (
                            <div className={`${gradeColor} text-white text-xs p-2 rounded shadow-sm relative transition-colors`}>
                              <div className="font-medium">
                                {student?.initials}
                              </div>
                              <div className="text-xs opacity-90">
                                {student?.minutes_per_session}min
                              </div>
                              <button
                                onClick={() => handleDeleteSession(sessionInSlot.id)}
                                className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center text-white hover:text-red-200 hover:bg-black/20 rounded-tr"
                                title="Remove session"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </CardBody>
        </Card>

      </div>
    </div>
  );
}