'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../../../../components/ui/button';
import {
  updateRotationGroupMember,
  removeRotationGroupMember,
  type RotationGroupMemberWithTeacher,
} from '../../../../../../lib/supabase/queries/rotation-groups';
import type { SpecialActivity } from '@/src/types/database';

interface RotationQuickEditModalProps {
  member: RotationGroupMemberWithTeacher;
  activityA: string;
  activityB: string;
  teacherActivities: SpecialActivity[];
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
];

interface Conflict {
  activityName: string;
  startTime: string;
  endTime: string;
}

export function RotationQuickEditModal({
  member,
  activityA,
  activityB,
  teacherActivities,
  onClose,
  onSuccess,
}: RotationQuickEditModalProps) {
  const [dayOfWeek, setDayOfWeek] = useState(member.day_of_week);
  const [startTime, setStartTime] = useState(member.start_time.substring(0, 5));
  const [endTime, setEndTime] = useState(member.end_time.substring(0, 5));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const headingId = 'rotation-quick-edit-heading';

  const teacherName = member.teacher
    ? `${member.teacher.first_name || ''} ${member.teacher.last_name || ''}`.trim() || 'Unknown'
    : 'Unknown';

  // Check for conflicts with teacher's existing activities
  const conflicts: Conflict[] = [];
  teacherActivities.forEach(activity => {
    if (
      activity.day_of_week === dayOfWeek &&
      activity.start_time &&
      activity.end_time
    ) {
      const actStart = activity.start_time.substring(0, 5);
      const actEnd = activity.end_time.substring(0, 5);

      // Check if time ranges overlap
      if (startTime < actEnd && endTime > actStart) {
        conflicts.push({
          activityName: activity.activity_name || 'Activity',
          startTime: actStart,
          endTime: actEnd,
        });
      }
    }
  });

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  // Focus management
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const handleSave = async () => {
    // Validate time range
    if (endTime <= startTime) {
      setError('End time must be after start time');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await updateRotationGroupMember(member.id, {
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
      });
      onSuccess();
    } catch (err) {
      console.error('Error updating rotation member:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to update schedule';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 id={headingId} className="text-lg font-semibold text-gray-900">
            Edit Rotation Schedule
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {teacherName}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {activityA} / {activityB}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* Day selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Day
            </label>
            <select
              value={dayOfWeek}
              onChange={e => setDayOfWeek(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              {DAYS.map(day => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>

          {/* Time selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Conflict warnings */}
          {conflicts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Schedule Conflict{conflicts.length > 1 ? 's' : ''}
                  </p>
                  <ul className="mt-1 text-sm text-amber-700">
                    {conflicts.map((conflict, index) => (
                      <li key={index}>
                        {conflict.activityName} ({formatTime(conflict.startTime)} - {formatTime(conflict.endTime)})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
