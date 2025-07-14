"use client";

import React, { useState, useEffect } from "react";
import { createClient } from '@/lib/supabase/client';
import { Card, CardBody } from "../../../components/ui/card";
import { StatCard } from "../../../components/ui/stats";
import { SessionCompletion } from "../../../components/sea/session-completion";

interface AssignedSession {
  id: string;
  student_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  service_type: string;
  student_initials: string;
  student_grade: string;
  completed_at: string | null;
  session_notes: string | null;
}

export default function SEADashboard() {
  const [assignedSessions, setAssignedSessions] = useState<AssignedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [todaysSessions, setTodaysSessions] = useState<AssignedSession[]>([]);
  const supabase = createClient();

  useEffect(() => {
    fetchSEAData();
  }, []);

  const fetchSEAData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Call the database function to get SEA sessions with student info
      // `get_sea_assigned_sessions` is a Postgres RPC that returns the sessions
      // assigned to the SEA user along with student details.
      const { data: sessions, error } = await supabase
        .rpc('get_sea_assigned_sessions', {
          sea_user_id: user.id
        });

      if (error) {
        console.error('Error fetching sessions:', error);
        setLoading(false);
        return;
      }

      // Transform the data from the RPC function
      const transformedSessions = (sessions || []).map(session => ({
        id: session.session_id,
        student_id: session.student_id,
        day_of_week: session.day_of_week,
        start_time: session.start_time,
        end_time: session.end_time,
        service_type: session.service_type,
        student_initials: session.student_initials || 'Unknown',
        student_grade: session.student_grade || '',
        completed_at: session.completed_at,
        session_notes: session.session_notes
      }));

      // Filter today's sessions
      const today = new Date().getDay();
      const todayIndex = today === 0 ? 7 : today; // Convert Sunday (0) to 7

      const todaysSessionsFiltered = transformedSessions.filter(
        session => session.day_of_week === todayIndex
      );

      setAssignedSessions(transformedSessions);
      setTodaysSessions(todaysSessionsFiltered);

    } catch (error) {
      console.error('Error fetching SEA data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getDayName = (dayNumber: number): string => {
    const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days[dayNumber] || 'Unknown';
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
        <p className="text-gray-600">Manage your assigned sessions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard
          title="Total Weekly Sessions"
          value={assignedSessions.length}
          description="Assigned to you"
          variant="primary"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />

        <StatCard
          title="Today's Sessions"
          value={todaysSessions.length}
          description="Scheduled for today"
          variant="success"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Today's Sessions */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Today&apos;s Sessions</h2>
          {todaysSessions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No sessions scheduled for today</p>
          ) : (
            <div className="space-y-3">
              {todaysSessions
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                .map((session) => (
                  <SessionCompletion
                    key={session.id}
                    session={{
                      id: session.id,
                      student_initials: session.student_initials,
                      start_time: session.start_time,
                      end_time: session.end_time,
                      completed_at: session.completed_at || null,
                      session_notes: session.session_notes || null
                    }}
                    onUpdate={fetchSEAData}
                  />
                ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Weekly Schedule Overview */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Weekly Schedule</h2>
          {assignedSessions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No sessions assigned yet</p>
          ) : (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(dayNumber => {
                const daySessions = assignedSessions.filter(s => s.day_of_week === dayNumber);
                return (
                  <div key={dayNumber} className="border-b border-gray-200 pb-3 last:border-b-0">
                    <h3 className="font-medium text-gray-900 mb-2">
                      {getDayName(dayNumber)} ({daySessions.length} sessions)
                    </h3>
                    {daySessions.length === 0 ? (
                      <p className="text-sm text-gray-500">No sessions</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {daySessions
                          .sort((a, b) => a.start_time.localeCompare(b.start_time))
                          .map((session) => (
                            <div
                              key={session.id}
                              className="p-3 bg-gray-50 rounded border text-sm"
                            >
                              <div className="font-medium">{session.student_initials}</div>
                              <div className="text-gray-600">
                                {formatTime(session.start_time)} - {formatTime(session.end_time)}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}