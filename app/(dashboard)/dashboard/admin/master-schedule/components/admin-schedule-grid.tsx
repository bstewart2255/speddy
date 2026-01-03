'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { Card, CardBody } from '../../../../../components/ui/card';
import { ScheduleItem } from './schedule-item';
import { CreateItemModal } from './create-item-modal';
import { EditItemModal } from './edit-item-modal';
import { DailyTimeMarker } from './daily-time-marker';
import type { SpecialActivity } from '@/src/types/database';
import type { BellScheduleWithCreator } from '../types';

// Special period names that indicate daily time markers
const DAILY_TIME_PERIOD_NAMES = ['School Start', 'Dismissal', 'Early Dismissal'] as const;

interface AdminScheduleGridProps {
  bellSchedules: BellScheduleWithCreator[];
  specialActivities: SpecialActivity[];
  schoolId: string | null;
  onRefresh: () => Promise<void>;
  viewFilter?: 'all' | 'bell' | 'activities';
  showDailyTimes?: boolean;
  allBellSchedules?: BellScheduleWithCreator[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const GRADE_COLOR_MAP: Record<string, string> = {
  TK: 'bg-slate-50 border-slate-200',
  K: 'bg-slate-100 border-slate-300',
  '1': 'bg-slate-200 border-slate-400',
  '2': 'bg-slate-300 border-slate-400',
  '3': 'bg-slate-300 border-slate-500',
  '4': 'bg-slate-400 border-slate-500',
  '5': 'bg-slate-400 border-slate-600',
};

const ACTIVITY_COLOR_MAP: Record<string, string> = {
  Library: 'bg-blue-200 border-blue-400',
  STEAM: 'bg-orange-200 border-orange-400',
  STEM: 'bg-teal-200 border-teal-400',
  Garden: 'bg-lime-200 border-lime-400',
  Music: 'bg-violet-200 border-violet-400',
  ART: 'bg-fuchsia-200 border-fuchsia-400',
  PE: 'bg-red-200 border-red-400',
};

const DEFAULT_ACTIVITY_COLOR = 'bg-gray-200 border-gray-400';

// Grid configuration
const GRID_CONFIG = {
  startHour: 7.5,  // 7:30 AM
  endHour: 15,     // 3:00 PM
  pixelsPerHour: 80,  // Larger for less compact view
  get totalHeight() {
    return (this.endHour - this.startHour) * this.pixelsPerHour;
  }
};

// Helper to check if two time ranges overlap
function timeRangesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return start1 < end2 && start2 < end1;
}

// Calculate overlap groups for a list of items using transitive grouping
// If A overlaps B, and B overlaps C, then A, B, C are all in the same group
function calculateOverlaps<T extends { start_time: string | null; end_time: string | null; id: string }>(
  items: T[]
): Map<string, { index: number; total: number }> {
  const result = new Map<string, { index: number; total: number }>();

  // Filter items with valid times
  const validItems = items.filter(item => item.start_time && item.end_time);

  // Find overlapping groups using transitive closure
  const processed = new Set<string>();

  for (const item of validItems) {
    if (processed.has(item.id)) continue;

    // Build group transitively - keep expanding until no new items found
    const group: T[] = [item];
    const groupIds = new Set<string>([item.id]);
    let expanded = true;

    while (expanded) {
      expanded = false;
      for (const candidate of validItems) {
        if (groupIds.has(candidate.id)) continue;

        // Check if candidate overlaps with ANY item in the current group
        const overlapsWithGroup = group.some(groupItem =>
          timeRangesOverlap(
            groupItem.start_time!,
            groupItem.end_time!,
            candidate.start_time!,
            candidate.end_time!
          )
        );

        if (overlapsWithGroup) {
          group.push(candidate);
          groupIds.add(candidate.id);
          expanded = true;
        }
      }
    }

    // Assign indices to the group
    group.forEach((groupItem, idx) => {
      result.set(groupItem.id, { index: idx, total: group.length });
      processed.add(groupItem.id);
    });
  }

  return result;
}

export function AdminScheduleGrid({
  bellSchedules,
  specialActivities,
  schoolId,
  onRefresh,
  viewFilter = 'all',
  showDailyTimes = false,
  allBellSchedules = []
}: AdminScheduleGridProps) {
  const [createModal, setCreateModal] = useState<{
    day: number;
    time: string;
  } | null>(null);

  const [editModal, setEditModal] = useState<{
    type: 'bell' | 'activity';
    item: BellScheduleWithCreator | SpecialActivity;
  } | null>(null);

  // Extract daily time markers from bell schedules (School Start, Dismissal, etc.)
  const dailyTimeMarkers = useMemo(() => {
    if (!showDailyTimes) return new Map<number, BellScheduleWithCreator[]>();

    const markers = new Map<number, BellScheduleWithCreator[]>();

    allBellSchedules.forEach(schedule => {
      if (
        schedule.period_name &&
        DAILY_TIME_PERIOD_NAMES.includes(schedule.period_name as typeof DAILY_TIME_PERIOD_NAMES[number]) &&
        schedule.day_of_week &&
        schedule.start_time
      ) {
        const dayMarkers = markers.get(schedule.day_of_week) || [];
        dayMarkers.push(schedule);
        markers.set(schedule.day_of_week, dayMarkers);
      }
    });

    return markers;
  }, [allBellSchedules, showDailyTimes]);

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

  // Get color for a special activity based on its type
  const getActivityColor = (activityName: string | null): string => {
    if (!activityName) return DEFAULT_ACTIVITY_COLOR;
    return ACTIVITY_COLOR_MAP[activityName] || DEFAULT_ACTIVITY_COLOR;
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
                  style={{ top: timeToPixels(time) + 12 }}
                >
                  {formatTime(time)}
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          {DAYS.map((day, dayIndex) => {
            const dayNumber = dayIndex + 1;
            // Filter out daily time markers from regular bell schedules (they render separately)
            const dayBellSchedules = bellSchedules.filter(s =>
              s.day_of_week === dayNumber &&
              (!s.period_name || !DAILY_TIME_PERIOD_NAMES.includes(s.period_name as typeof DAILY_TIME_PERIOD_NAMES[number]))
            );
            const dayActivities = specialActivities.filter(a => a.day_of_week === dayNumber);

            // Calculate overlaps for this day
            const bellOverlaps = calculateOverlaps(dayBellSchedules);
            const activityOverlaps = calculateOverlaps(dayActivities);

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

                  {/* Daily time markers (School Start, Dismissal, etc.) */}
                  {showDailyTimes && dailyTimeMarkers.get(dayNumber)?.map((marker) => {
                    if (!marker.start_time) return null;
                    const isStart = marker.period_name === 'School Start';
                    return (
                      <DailyTimeMarker
                        key={marker.id}
                        time={marker.start_time}
                        label={marker.period_name === 'School Start' ? 'Start' : marker.period_name || 'Dismissal'}
                        color={isStart ? 'blue' : 'orange'}
                        pixelPosition={timeToPixels(marker.start_time)}
                        gradeLevel={marker.grade_level || undefined}
                        onClick={() => handleItemClick('bell', marker)}
                      />
                    );
                  })}

                  {/* Bell schedules */}
                  {dayBellSchedules.map((schedule) => {
                    if (!schedule.start_time || !schedule.end_time) return null;
                    const top = timeToPixels(schedule.start_time);
                    const height = calculateHeight(schedule.start_time, schedule.end_time);
                    const overlap = bellOverlaps.get(schedule.id);

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
                        overlapIndex={overlap?.index}
                        overlapTotal={overlap?.total}
                      />
                    );
                  })}

                  {/* Special activities */}
                  {dayActivities.map((activity) => {
                    if (!activity.start_time || !activity.end_time) return null;
                    const top = timeToPixels(activity.start_time);
                    const height = calculateHeight(activity.start_time, activity.end_time);
                    const overlap = activityOverlaps.get(activity.id);

                    return (
                      <ScheduleItem
                        key={activity.id}
                        type="activity"
                        label={activity.activity_name || 'Activity'}
                        sublabel={activity.teacher_name || ''}
                        top={top}
                        height={height}
                        colorClass={getActivityColor(activity.activity_name)}
                        onClick={() => handleItemClick('activity', activity)}
                        overlapIndex={overlap?.index}
                        overlapTotal={overlap?.total}
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
