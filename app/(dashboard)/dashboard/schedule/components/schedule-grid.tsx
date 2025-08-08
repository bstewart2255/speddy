'use client';

import React, { useMemo, memo } from 'react';
import { Card, CardBody } from '../../../../components/ui/card';
import { SessionAssignmentPopup } from '../session-assignment-popup';

interface ScheduleGridProps {
  sessions: any[];
  students: any[];
  schoolHours: any[];
  selectedGrades: Set<string>;
  selectedTimeSlot: string | null;
  selectedDay: number | null;
  highlightedStudentId: string | null;
  sessionFilter: 'all' | 'mine' | 'sea';
  showSchoolHours: boolean;
  draggedSession: any | null;
  dragPosition: any | null;
  conflictSlots: Set<string>;
  selectedSession: any | null;
  popupPosition: any | null;
  seaProfiles: any[];
  providerRole: string;
  currentUserId: string | null;
  gridConfig: {
    startHour: number;
    endHour: number;
    pixelsPerHour: number;
    snapInterval: number;
    totalHeight: number;
  };
  onDragStart: (e: React.DragEvent, session: any) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, day: number) => void;
  onDrop: (e: React.DragEvent, day: number) => void;
  onTimeSlotClick: (time: string) => void;
  onDayClick: (day: number) => void;
  onSessionClick: (session: any, position: { x: number; y: number }) => void;
  onHighlightToggle: (studentId: string) => void;
  onPopupClose: () => void;
  onPopupUpdate: () => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const GRADE_COLOR_MAP: { [key: string]: string } = {
  K: 'bg-purple-400 hover:bg-purple-500',
  '1': 'bg-sky-400 hover:bg-sky-500',
  '2': 'bg-cyan-400 hover:bg-cyan-500',
  '3': 'bg-emerald-400 hover:bg-emerald-500',
  '4': 'bg-amber-400 hover:bg-amber-500',
  '5': 'bg-rose-400 hover:bg-rose-500',
};

export const ScheduleGrid = memo(function ScheduleGrid({
  sessions,
  students,
  schoolHours,
  selectedGrades,
  selectedTimeSlot,
  selectedDay,
  highlightedStudentId,
  sessionFilter,
  showSchoolHours,
  draggedSession,
  dragPosition,
  conflictSlots,
  selectedSession,
  popupPosition,
  seaProfiles,
  providerRole,
  currentUserId,
  gridConfig,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onTimeSlotClick,
  onDayClick,
  onSessionClick,
  onHighlightToggle,
  onPopupClose,
  onPopupUpdate,
}: ScheduleGridProps) {
  // Generate time markers
  const timeMarkers = useMemo(() => 
    Array.from(
      { length: (gridConfig.endHour - gridConfig.startHour) * 4 },
      (_, i) => {
        const totalMinutes = i * 15;
        const hour = gridConfig.startHour + Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    ),
    [gridConfig]
  );

  // Helper functions
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const timeToPixels = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = (hours - gridConfig.startHour) * 60 + minutes;
    return (totalMinutes * gridConfig.pixelsPerHour) / 60;
  };

  const sessionOverlapsTimeSlot = (session: any, timeSlot: string): boolean => {
    const [slotHour, slotMinute] = timeSlot.split(':').map(Number);
    const slotStartMinutes = slotHour * 60 + slotMinute;
    const slotEndMinutes = slotStartMinutes + 15;

    const [sessionStartHour, sessionStartMinute] = session.start_time.split(':').map(Number);
    const [sessionEndHour, sessionEndMinute] = session.end_time.split(':').map(Number);
    const sessionStartMinutes = sessionStartHour * 60 + sessionStartMinute;
    const sessionEndMinutes = sessionEndHour * 60 + sessionEndMinute;

    return sessionStartMinutes < slotEndMinutes && sessionEndMinutes > slotStartMinutes;
  };

  // Filter sessions
  const getFilteredSessions = (allSessions: any[]) => {
    switch (sessionFilter) {
      case 'mine':
        return allSessions.filter(s => s.delivered_by !== 'sea');
      case 'sea':
        return allSessions.filter(s => s.delivered_by === 'sea');
      default:
        return allSessions;
    }
  };

  // Calculate session columns to prevent overlaps
  const daySessionColumns = useMemo(() => {
    const columns: Record<number, Array<Array<any>>> = {};
    
    DAYS.forEach((_, dayIndex) => {
      const dayNumber = dayIndex + 1;
      const daySessions = sessions.filter(s => s.day_of_week === dayNumber);
      
      if (daySessions.length === 0) {
        columns[dayNumber] = [];
        return;
      }

      // Sort by start time
      daySessions.sort((a, b) => {
        const timeA = parseInt(a.start_time.replace(':', ''));
        const timeB = parseInt(b.start_time.replace(':', ''));
        return timeA - timeB;
      });

      // Group into columns
      const sessionColumns: Array<Array<any>> = [];
      daySessions.forEach(session => {
        const sessionStart = parseInt(session.start_time.replace(':', ''));
        const sessionEnd = parseInt(session.end_time.replace(':', ''));

        let placed = false;
        for (let col = 0; col < sessionColumns.length; col++) {
          const canPlace = sessionColumns[col].every(existing => {
            const existingStart = parseInt(existing.start_time.replace(':', ''));
            const existingEnd = parseInt(existing.end_time.replace(':', ''));
            return sessionEnd <= existingStart || sessionStart >= existingEnd;
          });

          if (canPlace) {
            sessionColumns[col].push(session);
            placed = true;
            break;
          }
        }

        if (!placed) {
          sessionColumns.push([session]);
        }
      });

      columns[dayNumber] = sessionColumns;
    });

    return columns;
  }, [sessions]);

  // Get school hours for a day
  const getSchoolHoursForDay = (day: number, grade: string, sessionTime?: string) => {
    if ((grade === 'K' || grade === 'TK') && sessionTime) {
      const sessionHour = parseInt(sessionTime.split(':')[0]);
      const isAM = sessionHour < 12;
      const amPmGrade = `${grade}-${isAM ? 'AM' : 'PM'}`;
      const amPmHours = schoolHours.find(h => 
        h.day_of_week === day && h.grade_level === amPmGrade
      );

      if (amPmHours) {
        return {
          start: amPmHours.start_time.substring(0, 5),
          end: amPmHours.end_time.substring(0, 5),
        };
      }
    }

    const hours = schoolHours.find(h => 
      h.day_of_week === day && 
      (h.grade_level === grade || (h.grade_level === 'default' && !['TK', 'K'].includes(grade)))
    );

    return hours ? {
      start: hours.start_time.substring(0, 5),
      end: hours.end_time.substring(0, 5),
    } : { start: '08:00', end: '15:00' };
  };

  return (
    <>
      <Card>
        <CardBody className="p-0">
          {/* Grid Header */}
          <div className="grid grid-cols-6 bg-gray-50 border-b">
            <div className="p-3 font-semibold text-gray-700 text-center border-r">
              Time
            </div>
            {DAYS.map((day, index) => (
              <div
                key={day}
                className={`p-3 font-semibold text-center border-r last:border-r-0 cursor-pointer transition-colors ${
                  selectedDay === index + 1
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-700 bg-gray-50 hover:bg-gray-100'
                }`}
                onClick={() => onDayClick(index + 1)}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grid Body */}
          <div className="grid grid-cols-6 overflow-hidden">
            {/* Time Column */}
            <div>
              {timeMarkers.map((time) => (
                <div
                  key={time}
                  className="relative cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{ height: `${gridConfig.pixelsPerHour / 4}px` }}
                  onClick={() => onTimeSlotClick(time)}
                >
                  <div
                    className={`absolute top-0 left-0 right-0 p-2 text-xs text-center border-r border-b font-medium ${
                      selectedTimeSlot === time
                        ? 'bg-blue-100 text-blue-700 border-blue-300'
                        : 'text-gray-500 bg-gray-50'
                    }`}
                  >
                    {formatTime(time)}
                  </div>
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {DAYS.map((_, dayIndex) => {
              const dayNumber = dayIndex + 1;
              const daySessions = (() => {
                const allDaySessions = sessions.filter(s => s.day_of_week === dayNumber);
                if (providerRole === 'sea' && currentUserId) {
                  return allDaySessions.filter(s => s.assigned_to_sea_id === currentUserId);
                }
                return getFilteredSessions(allDaySessions);
              })();

              const columnData = daySessionColumns[dayNumber] || [];
              const sessionColumns = new Map<string, number>();
              columnData.forEach((column, colIndex) => {
                column.forEach(session => {
                  sessionColumns.set(session.id, colIndex);
                });
              });

              return (
                <div key={dayIndex} className="border-r last:border-r-0 relative">
                  <div
                    className="relative"
                    style={{ height: `${timeMarkers.length * (gridConfig.pixelsPerHour / 4)}px` }}
                    onDragOver={(e) => onDragOver(e, dayNumber)}
                    onDrop={(e) => onDrop(e, dayNumber)}
                  >
                    {/* School hours boundaries */}
                    {showSchoolHours && (() => {
                      const uniqueHours = new Map();
                      Array.from(selectedGrades).forEach(grade => {
                        const hours = getSchoolHoursForDay(dayNumber, grade);
                        const key = `${hours.start}-${hours.end}`;
                        if (!uniqueHours.has(key)) {
                          uniqueHours.set(key, { ...hours, grades: [grade] });
                        } else {
                          uniqueHours.get(key).grades.push(grade);
                        }
                      });

                      return Array.from(uniqueHours.values()).map((hours, idx) => (
                        <div
                          key={`boundary-${dayIndex}-${idx}`}
                          className="absolute left-0 right-0 pointer-events-none"
                          style={{
                            top: `${timeToPixels(hours.start)}px`,
                            height: `${timeToPixels(hours.end) - timeToPixels(hours.start)}px`,
                            backgroundColor: 'rgba(59, 130, 246, 0.05)',
                            borderTop: '2px dashed rgba(59, 130, 246, 0.3)',
                            borderBottom: '2px dashed rgba(59, 130, 246, 0.3)',
                            zIndex: 0,
                          }}
                        />
                      ));
                    })()}

                    {/* Grid lines */}
                    {timeMarkers.map((_, index) => (
                      <div
                        key={index}
                        className="absolute w-full border-b border-gray-100"
                        style={{ top: `${index * gridConfig.pixelsPerHour}px` }}
                      />
                    ))}
                    {timeMarkers.slice(0, -1).map((_, index) => (
                      <div
                        key={`half-${index}`}
                        className="absolute w-full border-b border-gray-50"
                        style={{
                          top: `${index * gridConfig.pixelsPerHour + gridConfig.pixelsPerHour / 2}px`,
                        }}
                      />
                    ))}

                    {/* Conflict indicators - Show ALL conflicted slots for the student being dragged */}
                    {draggedSession && (() => {
                      const student = students.find((s: any) => s.id === draggedSession.student_id);
                      if (!student) return null;
                      
                      const conflictIndicators: React.ReactElement[] = [];
                      const sessionHeight = (student.minutes_per_session * gridConfig.pixelsPerHour) / 60;
                      
                      // Check each time slot for conflicts
                      timeMarkers.forEach((time) => {
                        const slotKey = `${dayNumber}-${time}`;
                        
                        // Skip if this is the drop preview position (we handle that separately)
                        if (dragPosition?.day === dayNumber && dragPosition?.time === time) {
                          return;
                        }
                        
                        if (conflictSlots.has(slotKey)) {
                          const pixelY = timeToPixels(time);
                          
                          conflictIndicators.push(
                            <div
                              key={`conflict-${dayNumber}-${time}`}
                              className="absolute bg-red-200 border-2 border-red-500 rounded opacity-50 pointer-events-none"
                              style={{
                                top: `${pixelY}px`,
                                height: `${sessionHeight}px`,
                                left: '2px',
                                right: '2px',
                                zIndex: 5,
                              }}
                            />
                          );
                        }
                      });
                      
                      return conflictIndicators;
                    })()}

                    {/* Drop preview - Shows current drag position with red for conflicts, blue for valid drops */}
                    {draggedSession && dragPosition?.day === dayNumber && (
                      <div
                        className={`absolute w-full rounded pointer-events-none z-20 ${
                          conflictSlots.has(`${dragPosition.day}-${dragPosition.time}`)
                            ? 'bg-red-300 border-2 border-red-600'  // Conflict state: stronger red for current position
                            : 'bg-blue-200 border-2 border-blue-500' // Normal state: blue visual indicator
                        }`}
                        style={{
                          top: `${dragPosition.pixelY}px`,
                          height: `${((students.find((s: any) => s.id === draggedSession.student_id)?.minutes_per_session || 30) * gridConfig.pixelsPerHour) / 60}px`,
                          left: '2px',
                          right: '2px',
                        }}
                      >
                        <div className="absolute -top-1 right-1 bg-gray-800 text-white text-xs px-2 py-0.5 rounded-md font-medium shadow-md">
                          {formatTime(dragPosition.time)}
                        </div>
                      </div>
                    )}

                    {/* Sessions */}
                    {daySessions.map(session => {
                      const student = students.find((s: any) => s.id === session.student_id);
                      const startTime = session.start_time.substring(0, 5);
                      const endTime = session.end_time.substring(0, 5);
                      const top = timeToPixels(startTime);
                      const height = timeToPixels(endTime) - top;

                      const isGradeFiltered = student && !selectedGrades.has(student.grade_level);
                      const isTimeFiltered = selectedTimeSlot && !sessionOverlapsTimeSlot(session, selectedTimeSlot);
                      const isDayFiltered = selectedDay && session.day_of_week !== selectedDay;
                      const shouldGrayOut = isGradeFiltered || isTimeFiltered || isDayFiltered;

                      const gradeColor = shouldGrayOut
                        ? 'bg-gray-300 hover:bg-gray-400 opacity-50'
                        : student
                          ? GRADE_COLOR_MAP[student.grade_level] || 'bg-gray-400'
                          : 'bg-gray-400';

                      const seaAssignmentClass = session.delivered_by === 'sea' ? 'ring-2 ring-orange-400 ring-inset' : '';
                      const columnIndex = sessionColumns.get(session.id) ?? 0;
                      const fixedWidth = 25;
                      const gap = 1;
                      const leftOffset = columnIndex * (fixedWidth + gap);
                      const isHighlighted = highlightedStudentId === session.student_id;
                      const highlightClass = isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-2' : '';

                      return (
                        <div
                          key={session.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, session)}
                          onDragEnd={onDragEnd}
                          className={`absolute ${gradeColor} text-white rounded shadow-sm transition-all hover:shadow-md hover:z-10 group ${highlightClass} ${seaAssignmentClass} ${
                            draggedSession?.id === session.id ? 'opacity-50 cursor-grabbing' : 'cursor-grab'
                          }`}
                          style={{
                            top: `${top}px`,
                            height: `${height - 2}px`,
                            left: `${leftOffset + 2}px`,
                            width: `${fixedWidth}px`,
                            padding: '2px',
                            cursor: 'move',
                            zIndex: draggedSession?.id === session.id ? 20 : 10,
                          }}
                          onClick={(e) => {
                            onHighlightToggle(session.student_id);
                            const rect = e.currentTarget.getBoundingClientRect();
                            onSessionClick(session, { x: rect.right + 10, y: rect.top });
                          }}
                        >
                          <div className="flex flex-col h-full relative">
                            <div className="font-medium text-[10px]">{student?.initials}</div>
                            {height > 40 && (
                              <div className="text-[9px] opacity-90">{student?.minutes_per_session}m</div>
                            )}
                            {session.delivered_by === 'sea' && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                                <span className="text-[8px] font-bold text-white">S</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Session Assignment Popup */}
      {selectedSession && popupPosition && (
        <SessionAssignmentPopup
          session={selectedSession}
          student={students.find((s: any) => s.id === selectedSession.student_id)}
          position={popupPosition}
          seaProfiles={seaProfiles}
          onClose={onPopupClose}
          onUpdate={onPopupUpdate}
        />
      )}
    </>
  );
});