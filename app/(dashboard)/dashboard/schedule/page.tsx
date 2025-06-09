              'use client';

              import { useState, useEffect } from 'react';
              import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
              import TimeSlotBlock from '../../../components/schedule/time-slot-block';
              import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
              import { Database, Student, BellSchedule, SpecialActivity, ScheduleSession } from '../../../../src/types/database';
              // import { ExportPDF } from '../../../components/schedule/export-pdf';

              export default function SchedulePage() {
                const [crossProviderSessions, setCrossProviderSessions] = useState<any[]>([]);
                const [providerRole, setProviderRole] = useState<string>('Resource');
                const [providerName, setProviderName] = useState<string>('');
                const [students, setStudents] = useState<Student[]>([]);
                const [bellSchedules, setBellSchedules] = useState<BellSchedule[]>([]);
                const [specialActivities, setSpecialActivities] = useState<SpecialActivity[]>([]);
                const [sessions, setSessions] = useState<ScheduleSession[]>([]);
                const [loading, setLoading] = useState(true);
                const [selectedWeek, setSelectedWeek] = useState(() => {
                
                  // Get current week's Monday
                  const today = new Date();
                  const day = today.getDay();
                  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                  return new Date(today.setDate(diff));
                });

                const supabase = createClientComponentClient<Database>();

                const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                const timeSlots: string[] = [];

                // Generate time slots from 8:00 AM to 3:00 PM in 30-minute intervals
                for (let hour = 8; hour < 15; hour++) {
                  for (let minute = 0; minute < 60; minute += 30) {
                    timeSlots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
                  }
                }

                useEffect(() => {
                  fetchData();
                }, [selectedWeek]);

                async function fetchData() {
                  try {
                    const { data: user } = await supabase.auth.getUser();
                    if (!user.user) return;

                    // Fetch the provider's profile to get their role
                    const { data: profile } = await supabase
                      .from('profiles')
                      .select('*')
                      .eq('id', user.user.id)
                      .single();
                    
                    if (profile?.role) {
                      setProviderRole(profile.role);
                      setProviderName(profile.full_name || user.user.email || 'Provider');
                    }

                    // Fetch all required data
                    const [studentsRes, bellRes, specialRes, sessionsRes] = await Promise.all([
                      supabase.from('students').select('*').order('initials'),
                      supabase.from('bell_schedules').select('*'),
                      supabase.from('special_activities').select('*'),
                      supabase.from('schedule_sessions').select('*')
                    ]);

                    if (studentsRes.error) throw studentsRes.error;
                    if (bellRes.error) throw bellRes.error;
                    if (specialRes.error) throw specialRes.error;
                    if (sessionsRes.error) throw sessionsRes.error;

                    // Add this after the other data fetches in fetchData()
                    // Fetch cross-provider sessions (other providers' sessions with our students)
                    const { data: crossProviderSessions } = await supabase
                      .from('cross_provider_visibility')
                      .select('*')
                      .neq('provider_id', user.user.id);  // Exclude our own sessions

                    setStudents(studentsRes.data || []);
                    setBellSchedules(bellRes.data || []);
                    setSpecialActivities(specialRes.data || []);
                    console.log('Special activities data:', {
                      type: typeof specialRes.data,
                      isArray: Array.isArray(specialRes.data),
                      length: specialRes.data?.length || 0,
                      sample: specialRes.data?.[0]
                    });                    
                    setSessions(sessionsRes.data || []);
                    setCrossProviderSessions(crossProviderSessions || []);
                    
                  } catch (error) {
                    // Add more detailed error logging
                    if (error instanceof Error) {
                    }
                  } finally {
                    setLoading(false);
                  }
                }

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

                function formatTime(time: string) {
                  const [hour, minute] = time.split(':');
                  const hourNum = parseInt(hour);
                  const ampm = hourNum >= 12 ? 'PM' : 'AM';
                  const displayHour = hourNum > 12 ? hourNum - 12 : hourNum === 0 ? 12 : hourNum;
                  return `${displayHour}:${minute} ${ampm}`;
                }

                function isTimeInRange(time: string, startTime: string, endTime: string): boolean {
                  const slotStart = timeToMinutes(time);
                  const slotEnd = slotStart + 30; // Each slot is 30 minutes
                  const blockStart = timeToMinutes(startTime);
                  const blockEnd = timeToMinutes(endTime);

                  // Check if there's any overlap (including boundaries)
                  return slotStart < blockEnd && slotEnd > blockStart;
                }

                function timeToMinutes(time: string): number {
                  // Handle both HH:MM and HH:MM:SS formats
                  const parts = time.split(':');
                  const hours = parseInt(parts[0]);
                  const minutes = parseInt(parts[1]);
                  return hours * 60 + minutes;
                }

                if (loading) {
                  return <div className="flex justify-center items-center h-64">Loading...</div>;
                }

                return (
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                      <div className="mb-8">
                        <h1 className="text-2xl font-bold">Weekly Schedule</h1>
                        <p className="text-gray-600 mt-2">
                          Drag and drop students to schedule their sessions
                        </p>
                      </div>
                    

                      {/* Week Navigation */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                          <button
                            onClick={() => setSelectedWeek(/* ... */)}
                            className="px-4 py-2 border rounded hover:bg-gray-50"
                          >
                            ← Previous Week
                          </button>

                          <h2 className="text-lg font-semibold">
                            Week of {selectedWeek.toLocaleDateString('en-US', { /* ... */ })}
                          </h2>

                          <button
                            onClick={() => setSelectedWeek(/* ... */)}
                            className="px-4 py-2 border rounded hover:bg-gray-50"
                          >
                            Next Week →
                          </button>
                        </div>

                        {/* Export Button */}
                        <div className="flex justify-end">
                          {/* <ExportPDF
                            students={students}
                            sessions={sessions}
                            bellSchedules={bellSchedules}
                            specialActivities={specialActivities}
                            providerName={providerName}
                            weekOf={selectedWeek}
                          /> */}
                        </div>
                      </div>
                      
                    {/* Students Panel */}
                      <div className="mb-6 bg-white rounded-lg shadow p-4">
                        <h2 className="font-semibold mb-3">Students to Schedule</h2>
                        <Droppable droppableId="students-list" direction="vertical">
                          {(provided) => (
                            <div 
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className="flex flex-wrap gap-2"
                            >
                              {students.map((student, index) => (
                                <Draggable key={student.id} draggableId={student.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={`px-3 py-2 bg-blue-100 text-blue-800 rounded cursor-move hover:bg-blue-200 ${
                                        snapshot.isDragging ? 'opacity-50' : ''
                                      }`}
                                      title={`${student.sessions_per_week} sessions/week, ${student.minutes_per_session} min each`}
                                    >
                                      {student.initials} ({student.sessions_per_week})
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>

                    {/* Schedule Grid */}
                    <div className="bg-white rounded-lg shadow overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="p-3 text-center font-semibold w-24">Time</th>
                            {days.map(day => (
                              <th key={day} className="p-3 text-center font-semibold border-l">
                                {day}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {timeSlots.map(time => (
                            <tr key={time} className="border-b">
                              <td className="p-2 text-sm text-center bg-gray-50 font-medium">
                                {formatTime(time)}
                              </td>
                              {days.map((day, dayIndex) => (
                              <td
                                key={`${day}-${time}`}
                                className="p-2 border-l min-h-[60px] hover:bg-gray-50 relative"
                                data-day={dayIndex + 1}
                                data-time={time}
                                style={{ minHeight: '50px', position: 'relative' }}
                              >
                                <Droppable droppableId={`${day}-${time}`} isDropDisabled={
                                  bellSchedules.some(bell =>
                                    bell.day_of_week === dayIndex + 1 &&
                                    isTimeInRange(time, bell.start_time, bell.end_time)
                                  ) ||
                                  specialActivities.some(activity =>
                                    activity.day_of_week === dayIndex + 1 &&
                                    isTimeInRange(time, activity.start_time, activity.end_time)
                                  ) ||
                                  crossProviderSessions.some(session =>
                                    session.day_of_week === dayIndex + 1 &&
                                    isTimeInRange(time, session.start_time, session.end_time)
                                  )
                                }>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.droppableProps}
                                      className={snapshot.isDraggingOver ? 'bg-blue-50' : ''}
                                      style={{ minHeight: '50px', position: 'absolute', inset: 0 }}
                                    >
                                      {/* Check for bell schedule conflicts */}
                                      {bellSchedules.filter(bell =>
                                        bell.day_of_week === dayIndex + 1 &&
                                        isTimeInRange(time, bell.start_time, bell.end_time)
                                      ).map((bell, idx) => (
                                        <TimeSlotBlock 
                                          key={`bell-${idx}`}
                                          type="bell" 
                                          title="Bell Schedule Block" 
                                        />
                                      ))[0] || null}

                                      {/* Check for special activity conflicts */}
                                      {specialActivities.filter(activity =>
                                        activity.day_of_week === dayIndex + 1 &&
                                        isTimeInRange(time, activity.start_time, activity.end_time)
                                      ).map((_, idx) => (
                                        <TimeSlotBlock 
                                          key={`special-${idx}`}
                                          type="special" 
                                          title="Special Activity Block" 
                                        />
                                      ))[0] || null}
                                      
                                      {/* Check for cross-provider conflicts */}
                                      {crossProviderSessions.filter(session =>
                                        session.day_of_week === dayIndex + 1 &&
                                        isTimeInRange(time, session.start_time, session.end_time)
                                      ).map((session, idx) => (
                                        <TimeSlotBlock 
                                          key={`cross-${idx}`}
                                          type="cross-provider" 
                                          title={session.service_type || 'Other Service'} 
                                        />
                                      ))[0] || null}

                                      {/* Display scheduled sessions */}
                                      {sessions.filter(session => 
                                        session.day_of_week === dayIndex + 1 &&
                                        session.start_time.slice(0, 5) === time  // Compare only HH:MM
                                      ).map(session => {
                                        const student = students.find(s => s.id === session.student_id);
                                        return student ? (
                                            <div 
                                              key={session.id} 
                                              className="bg-schedule-available text-green-800 p-1 rounded text-sm cursor-pointer hover:opacity-80 transition-opacity"
                                            onClick={() => handleDeleteSession(session.id)}
                                            title="Click to remove"
                                          >
                                            {student.initials}
                                          </div>
                                        ) : null;
                                      })}

                                      {provided.placeholder}
                                    </div>
                                  )}
                                </Droppable>
                              </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  </DragDropContext>
                );  
              }