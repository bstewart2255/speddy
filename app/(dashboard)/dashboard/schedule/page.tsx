'use client';

import React, { useState, useEffect } from 'react';  // ← Add React here
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { StatsGrid } from '../../../components/ui/stats';

// Keep all your existing interfaces and helper functions exactly the same
interface Student {
  id: string;
  initials: string;
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
  day_of_week: number;
  start_time: string;
  end_time: string;
  period_name: string;
}

interface SpecialActivity {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  activity_name: string;
}

export default function SchedulePage() {
  // Keep all your existing state variables exactly the same
  const [providerRole, setProviderRole] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [bellSchedules, setBellSchedules] = useState<BellSchedule[]>([]);
  const [specialActivities, setSpecialActivities] = useState<SpecialActivity[]>([]);
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState(new Date());

  const supabase = createClientComponentClient();

  // Keep all your existing helper functions exactly the same
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const isTimeInRange = (checkTime: string, startTime: string, endTime: string): boolean => {
    const check = timeToMinutes(checkTime);
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    return check >= start && check < end;
  };

  // Keep all your existing data fetching exactly the same
  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile) {
        setProviderRole(profile.role);
      }

      const [studentsData, bellData, activitiesData, sessionsData] = await Promise.all([
        supabase.from('students').select('*').eq('provider_id', user.id),
        supabase.from('bell_schedules').select('*').eq('provider_id', user.id),
        supabase.from('special_activities').select('*').eq('provider_id', user.id),
        supabase.from('schedule_sessions').select('*').eq('provider_id', user.id)
      ]);

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

  // Keep all your existing drag-drop handlers exactly the same
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    // Don't allow dropping back on the students list
    if (result.destination.droppableId === 'students-list') return;

    const studentId = result.draggableId;
    const student = students.find(s => s.id === studentId);
    if (!student) {
      alert('Student not found');
      return;
    }

    // Calculate end time based on student's session duration
    const [day, time] = result.destination.droppableId.split('-');
    const dayIndex = days.indexOf(day) + 1; // Convert day name to number (1-5)
    const startMinutes = parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1]);
    const endMinutes = startMinutes + student.minutes_per_session;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;                  

    // First, get the current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('You must be logged in to create sessions');
      return;
    }

    console.log('Creating session with role:', providerRole);
    // console.log('Provider profile role:', profile?.role);

    // Create a new schedule session
    const { error } = await supabase
      .from('schedule_sessions')
      .insert({
        student_id: studentId,
        provider_id: user.id,
        day_of_week: dayIndex,
        start_time: time,
        end_time: endTime,
        service_type: providerRole,
      });

    if (error) {
      alert('Failed to create session: ' + error.message);
    } else {
      // Refresh the data to show the new session
      fetchData();
    }
  };

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

  // Calculate stats for the new stats row
  const totalRequiredSessions = students.reduce((sum, student) => sum + student.sessions_per_week, 0);
  const scheduledSessions = sessions.length;
  const unscheduledSessions = totalRequiredSessions - scheduledSessions;
  const completionPercentage = totalRequiredSessions > 0 ? Math.round((scheduledSessions / totalRequiredSessions) * 100) : 0;

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
            <p className="text-gray-600">Drag students to schedule therapy sessions</p>
          </div>
          <div className="flex gap-3 items-center">
            <select 
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedWeek.toISOString().split('T')[0]}
              onChange={(e) => setSelectedWeek(new Date(e.target.value))}
            >
              <option value="2025-06-02">Week of June 2, 2025</option>
              <option value="2025-06-09">Week of June 9, 2025</option>
              <option value="2025-06-16">Week of June 16, 2025</option>
            </select>
            <Button variant="secondary">Export PDF</Button>
          </div>
        </div>

        {/* Weekly Stats */}
        <div className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardBody className="text-center py-4">
                <div className="text-2xl font-bold text-blue-600">{scheduledSessions}</div>
                <div className="text-sm text-gray-500 uppercase tracking-wide">Total Sessions</div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="text-center py-4">
                <div className="text-2xl font-bold text-orange-600">{unscheduledSessions}</div>
                <div className="text-sm text-gray-500 uppercase tracking-wide">Unscheduled</div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="text-center py-4">
                <div className="text-2xl font-bold text-green-600">{scheduledSessions}</div>
                <div className="text-sm text-gray-500 uppercase tracking-wide">Scheduled</div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="text-center py-4">
                <div className="text-2xl font-bold text-blue-600">{completionPercentage}%</div>
                <div className="text-sm text-gray-500 uppercase tracking-wide">Complete</div>
              </CardBody>
            </Card>
          </div>
        </div>

        {/* Schedule Interface */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

            {/* Students Panel */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Unscheduled Students</CardTitle>
                </CardHeader>
                <CardBody>
                  <Droppable droppableId="students-panel">
                    {(provided) => (
                      <div 
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="space-y-3 min-h-[300px]"
                      >
                        {students.map((student, index) => (
                          <Draggable 
                            key={student.id} 
                            draggableId={student.id} 
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`p-3 bg-blue-100 border border-blue-300 rounded-lg cursor-grab transition-all ${
                                  snapshot.isDragging ? 'shadow-lg bg-blue-200' : 'hover:bg-blue-200'
                                }`}
                              >
                                <div className="font-semibold text-blue-800">{student.initials}</div>
                                <div className="text-sm text-blue-600">{student.minutes_per_session} min session</div>
                                <div className="text-xs text-blue-500">
                                  Needs: {student.sessions_per_week - sessions.filter(s => s.student_id === student.id).length} more sessions
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </CardBody>
              </Card>
            </div>

            {/* Schedule Grid */}
            <div className="lg:col-span-3">
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
                          {time}
                        </div>

                        {/* Day Slots */}
                        {days.map((day, dayIndex) => {
                          const hasConflict = bellSchedules.some(bell => 
                            bell.day_of_week === dayIndex && 
                            isTimeInRange(time, bell.start_time, bell.end_time)
                          ) || specialActivities.some(activity => 
                            activity.day_of_week === dayIndex && 
                            isTimeInRange(time, activity.start_time, activity.end_time)
                          );

                          const sessionInSlot = sessions.find(session => 
                            session.day_of_week === dayIndex && 
                            session.start_time === time
                          );

                          return (
                            <Droppable 
                              key={`${day}-${time}`} 
                              droppableId={`${dayIndex}-${time}`}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className={`p-2 min-h-[60px] border-r border-b last:border-r-0 relative ${
                                    hasConflict ? 'bg-red-50' : 
                                    snapshot.isDraggedOver ? 'bg-green-100' : 'bg-white'
                                  }`}
                                >
                                  {hasConflict && (
                                    <div className="text-xs text-red-600 font-medium">
                                      {bellSchedules.find(bell => 
                                        bell.day_of_week === dayIndex && 
                                        isTimeInRange(time, bell.start_time, bell.end_time)
                                      )?.period_name || 'Activity'}
                                    </div>
                                  )}

                                  {sessionInSlot && (
                                    <div className="bg-green-600 text-white text-xs p-2 rounded shadow-sm">
                                      <div className="font-medium">
                                        {students.find(s => s.id === sessionInSlot.student_id)?.initials} - {students.find(s => s.id === sessionInSlot.student_id)?.minutes_per_session}min
                                      </div>
                                      <div className="opacity-80">{sessionInSlot.service_type}</div>
                                      <button
                                        onClick={() => handleDeleteSession(sessionInSlot.id)}
                                        className="absolute top-1 right-1 text-white hover:text-red-200 text-xs"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  )}

                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        </DragDropContext>

      </div>
    </div>
  );
}