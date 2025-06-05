              'use client';

              import { useState, useEffect } from 'react';
              import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
              import { Database } from '../../../../types/database';

              type Student = Database['public']['Tables']['students']['Row'];
              type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
              type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
              type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

              export default function SchedulePage() {
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
                const timeSlots = [];

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

                    // Fetch all required data
                    const [studentsRes, bellRes, specialRes, sessionsRes] = await Promise.all([
                      supabase.from('students').select('*').order('student_initials'),
                      supabase.from('bell_schedules').select('*'),
                      supabase.from('special_activities').select('*'),
                      supabase.from('schedule_sessions').select('*')
                        .gte('date', selectedWeek.toISOString().split('T')[0])
                        .lt('date', new Date(selectedWeek.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                    ]);

                    if (studentsRes.error) throw studentsRes.error;
                    if (bellRes.error) throw bellRes.error;
                    if (specialRes.error) throw specialRes.error;
                    if (sessionsRes.error) throw sessionsRes.error;

                    setStudents(studentsRes.data || []);
                    setBellSchedules(bellRes.data || []);
                    setSpecialActivities(specialRes.data || []);
                    setSessions(sessionsRes.data || []);
                  } catch (error) {
                    console.error('Error fetching data:', error);
                  } finally {
                    setLoading(false);
                  }
                }

                function formatTime(time: string) {
                  const [hour, minute] = time.split(':');
                  const hourNum = parseInt(hour);
                  const ampm = hourNum >= 12 ? 'PM' : 'AM';
                  const displayHour = hourNum > 12 ? hourNum - 12 : hourNum === 0 ? 12 : hourNum;
                  return `${displayHour}:${minute} ${ampm}`;
                }

                function isTimeInRange(time: string, startTime: string, endTime: string): boolean {
                  const timeMinutes = timeToMinutes(time);
                  const startMinutes = timeToMinutes(startTime);
                  const endMinutes = timeToMinutes(endTime);
                  return timeMinutes >= startMinutes && timeMinutes < endMinutes;
                }

                function timeToMinutes(time: string): number {
                  const [hours, minutes] = time.split(':').map(Number);
                  return hours * 60 + minutes;
                }

                if (loading) {
                  return <div className="flex justify-center items-center h-64">Loading...</div>;
                }

                return (
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="mb-8">
                      <h1 className="text-2xl font-bold">Weekly Schedule</h1>
                      <p className="text-gray-600 mt-2">
                        Drag and drop students to schedule their sessions
                      </p>
                    </div>

                    {/* Week Navigation */}
                    <div className="mb-6 flex items-center justify-between">
                      <button
                        onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 24 * 60 * 60 * 1000))}
                        className="px-4 py-2 border rounded hover:bg-gray-50"
                      >
                        ← Previous Week
                      </button>
                      <span className="font-medium">
                        Week of {selectedWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </span>
                      <button
                        onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 24 * 60 * 60 * 1000))}
                        className="px-4 py-2 border rounded hover:bg-gray-50"
                      >
                        Next Week →
                      </button>
                    </div>

                    {/* Students Panel */}
                    <div className="mb-6 bg-white rounded-lg shadow p-4">
                      <h2 className="font-semibold mb-3">Students to Schedule</h2>
                      <div className="flex flex-wrap gap-2">
                        {students.map(student => (
                          <div
                            key={student.id}
                            className="px-3 py-2 bg-blue-100 text-blue-800 rounded cursor-move hover:bg-blue-200"
                            draggable
                            title={`${student.sessions_per_week} sessions/week, ${student.minutes_per_session} min each`}
                          >
                            {student.student_initials} ({student.grade})
                          </div>
                        ))}
                      </div>
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
                                  style={{ minHeight: '60px' }}
                                >
                                  {/* Check for bell schedule conflicts */}
                                  {bellSchedules.some(bell => 
                                    bell.day_of_week === dayIndex + 1 &&
                                    isTimeInRange(time, bell.start_time, bell.end_time)
                                  ) && (
                                    <div className="absolute inset-0 bg-red-100 opacity-50" title="Bell Schedule Block" />
                                  )}

                                  {/* Check for special activity conflicts */}
                                  {specialActivities.some(activity => 
                                    activity.day_of_week === dayIndex + 1 &&
                                    isTimeInRange(time, activity.start_time, activity.end_time)
                                  ) && (
                                    <div className="absolute inset-0 bg-orange-100 opacity-50" title="Special Activity Block" />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }