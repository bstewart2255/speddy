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
  viewFilter?: 'all' | 'bell' | 'activities';
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
  startHour: 7.5,  // 7:30 AM
  endHour: 15,     // 3:00 PM
  pixelsPerHour: 80,  // Larger for less compact view
  get totalHeight() {
    return (this.endHour - this.startHour) * this.pixelsPerHour;
  }
};

export function AdminScheduleGrid({
  bellSchedules,
  specialActivities,
  schoolId,
  onRefresh,
  viewFilter = 'all'
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
    const startMinutes = GRID_CONFIG.startHour * 60;
    const endMinutes = GRID_CONFIG.endHour * 60;

    for (let mins = startMinutes; mins < endMinutes; mins += 30) {
      const hour = Math.floor(mins / 60);
      const minute = mins % 60;
      markers.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    }
    return markers;
  }, []);

  // Convert time string to pixel position
  const timeToPixels = useCallback((timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = (hours * 60 + minutes) - (GRID_CONFIG.startHour * 60);
    // Clamp to grid boundaries to prevent negative positions
    return Math.max(0, (totalMinutes * GRID_CONFIG.pixelsPerHour) / 60);
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
                      // Calculate minutes from start of grid, snap to 15-minute intervals
                      const minutesFromStart = Math.round((y / GRID_CONFIG.pixelsPerHour) * 60 / 15) * 15;
                      const totalMinutes = Math.floor(GRID_CONFIG.startHour * 60) + minutesFromStart;
                      const hour = Math.floor(totalMinutes / 60);
                      const minute = totalMinutes % 60;
                      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                      handleCellClick(dayNumber, time);
                    }
                  }}
                >
                  {/* Grid lines every 30 minutes */}
                  {timeMarkers.map((time, i) => (
                    <div
                      key={time}
                      className={`absolute left-0 right-0 border-t ${i % 2 === 0 ? 'border-gray-100' : 'border-gray-50'}`}
                      style={{ top: timeToPixels(time) }}
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
          defaultTab={viewFilter === 'activities' ? 'activity' : 'bell'}
        />
      )}

      {/* Edit Modal */}
      {editModal && schoolId && (
        <EditItemModal
          type={editModal.type}
          item={editModal.item}
          schoolId={schoolId}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}
    </Card>
  );
}
