'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { Card, CardBody } from '../../../../../components/ui/card';
import { ScheduleItem } from './schedule-item';
import { CreateItemModal } from './create-item-modal';
import { EditItemModal } from './edit-item-modal';
import type { SpecialActivity } from '@/src/types/database';
import type { BellScheduleWithCreator } from '../types';

interface AdminScheduleGridProps {
  bellSchedules: BellScheduleWithCreator[];
  specialActivities: SpecialActivity[];
  schoolId: string | null;
  onRefresh: () => Promise<void>;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const GRADE_COLOR_MAP: Record<string, string> = {
  TK: 'bg-pink-200 border-pink-400',
  K: 'bg-purple-200 border-purple-400',
  '1': 'bg-sky-200 border-sky-400',
  '2': 'bg-cyan-200 border-cyan-400',
  '3': 'bg-emerald-200 border-emerald-400',
  '4': 'bg-amber-200 border-amber-400',
  '5': 'bg-rose-200 border-rose-400',
};

const ACTIVITY_COLOR = 'bg-indigo-200 border-indigo-400';

// Grid configuration
const GRID_CONFIG = {
  startHour: 7,  // 7 AM
  endHour: 16,   // 4 PM
  pixelsPerHour: 60,
  get totalHeight() {
    return (this.endHour - this.startHour) * this.pixelsPerHour;
  }
};

export function AdminScheduleGrid({
  bellSchedules,
  specialActivities,
  schoolId,
  onRefresh
}: AdminScheduleGridProps) {
  const [createModal, setCreateModal] = useState<{
    day: number;
    time: string;
  } | null>(null);

  const [editModal, setEditModal] = useState<{
    type: 'bell' | 'activity';
    item: BellScheduleWithCreator | SpecialActivity;
  } | null>(null);

  // Generate time markers (every 30 minutes)
  const timeMarkers = useMemo(() => {
    const markers: string[] = [];
    for (let hour = GRID_CONFIG.startHour; hour < GRID_CONFIG.endHour; hour++) {
      markers.push(`${hour.toString().padStart(2, '0')}:00`);
      markers.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    return markers;
  }, []);

  // Convert time string to pixel position
  const timeToPixels = useCallback((timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = (hours - GRID_CONFIG.startHour) * 60 + minutes;
    return (totalMinutes * GRID_CONFIG.pixelsPerHour) / 60;
  }, []);

  // Calculate item height based on duration
  const calculateHeight = useCallback((startTime: string, endTime: string): number => {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    return (durationMinutes * GRID_CONFIG.pixelsPerHour) / 60;
  }, []);

  // Format time for display
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Handle cell click for inline create
  const handleCellClick = useCallback((day: number, time: string) => {
    setCreateModal({ day, time });
  }, []);

  // Handle item click for edit
  const handleItemClick = useCallback((type: 'bell' | 'activity', item: BellScheduleWithCreator | SpecialActivity) => {
    setEditModal({ type, item });
  }, []);

  // Close modals and refresh
  const handleModalClose = useCallback(() => {
    setCreateModal(null);
    setEditModal(null);
  }, []);

  const handleModalSuccess = useCallback(async () => {
    handleModalClose();
    await onRefresh();
  }, [handleModalClose, onRefresh]);

  // Get color for a bell schedule based on its first grade
  const getBellScheduleColor = (gradeLevel: string | null): string => {
    if (!gradeLevel) return 'bg-gray-200 border-gray-400';
    const firstGrade = gradeLevel.split(',')[0].trim();
    return GRADE_COLOR_MAP[firstGrade] || 'bg-gray-200 border-gray-400';
  };

  return (
    <Card className="overflow-hidden">
      <CardBody className="p-0">
        <div className="flex">
          {/* Time column */}
          <div className="w-20 flex-shrink-0 border-r border-gray-200 bg-gray-50">
            <div className="h-10 border-b border-gray-200" /> {/* Header spacer */}
            <div className="relative" style={{ height: GRID_CONFIG.totalHeight }}>
              {timeMarkers.map((time) => (
                <div
                  key={time}
                  className="absolute left-0 right-0 text-xs text-gray-500 pr-2 text-right"
                  style={{ top: timeToPixels(time) - 8 }}
                >
                  {formatTime(time)}
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          {DAYS.map((day, dayIndex) => {
            const dayNumber = dayIndex + 1;
            const dayBellSchedules = bellSchedules.filter(s => s.day_of_week === dayNumber);
            const dayActivities = specialActivities.filter(a => a.day_of_week === dayNumber);

            return (
              <div key={day} className="flex-1 border-r border-gray-200 last:border-r-0">
                {/* Day header */}
                <div className="h-10 border-b border-gray-200 flex items-center justify-center font-medium text-gray-700 bg-gray-50">
                  {day}
                </div>

                {/* Day content */}
                <div
                  className="relative bg-white cursor-pointer hover:bg-gray-50/50"
                  style={{ height: GRID_CONFIG.totalHeight }}
                  onClick={(e) => {
                    // Only trigger if clicking on the background, not on items
                    if (e.target === e.currentTarget) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const minutes = Math.round((y / GRID_CONFIG.pixelsPerHour) * 60 / 15) * 15;
                      const hour = GRID_CONFIG.startHour + Math.floor(minutes / 60);
                      const minute = minutes % 60;
                      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                      handleCellClick(dayNumber, time);
                    }
                  }}
                >
                  {/* Hour grid lines */}
                  {Array.from({ length: GRID_CONFIG.endHour - GRID_CONFIG.startHour }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-gray-100"
                      style={{ top: i * GRID_CONFIG.pixelsPerHour }}
                    />
                  ))}

                  {/* Half-hour grid lines */}
                  {Array.from({ length: GRID_CONFIG.endHour - GRID_CONFIG.startHour }).map((_, i) => (
                    <div
                      key={`half-${i}`}
                      className="absolute left-0 right-0 border-t border-gray-50"
                      style={{ top: i * GRID_CONFIG.pixelsPerHour + GRID_CONFIG.pixelsPerHour / 2 }}
                    />
                  ))}

                  {/* Bell schedules */}
                  {dayBellSchedules.map((schedule) => {
                    if (!schedule.start_time || !schedule.end_time) return null;
                    const top = timeToPixels(schedule.start_time);
                    const height = calculateHeight(schedule.start_time, schedule.end_time);

                    return (
                      <ScheduleItem
                        key={schedule.id}
                        type="bell"
                        label={schedule.period_name || 'Bell Schedule'}
                        sublabel={schedule.grade_level || ''}
                        top={top}
                        height={height}
                        colorClass={getBellScheduleColor(schedule.grade_level)}
                        onClick={() => handleItemClick('bell', schedule)}
                      />
                    );
                  })}

                  {/* Special activities */}
                  {dayActivities.map((activity) => {
                    if (!activity.start_time || !activity.end_time) return null;
                    const top = timeToPixels(activity.start_time);
                    const height = calculateHeight(activity.start_time, activity.end_time);

                    return (
                      <ScheduleItem
                        key={activity.id}
                        type="activity"
                        label={activity.activity_name || 'Activity'}
                        sublabel={activity.teacher_name || ''}
                        top={top}
                        height={height}
                        colorClass={ACTIVITY_COLOR}
                        onClick={() => handleItemClick('activity', activity)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>

      {/* Create Modal */}
      {createModal && schoolId && (
        <CreateItemModal
          day={createModal.day}
          startTime={createModal.time}
          schoolId={schoolId}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* Edit Modal */}
      {editModal && (
        <EditItemModal
          type={editModal.type}
          item={editModal.item}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}
    </Card>
  );
}
