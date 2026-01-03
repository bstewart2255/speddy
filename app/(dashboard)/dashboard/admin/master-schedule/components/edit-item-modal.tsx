'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../../../../components/ui/button';
import { deleteBellScheduleAsAdmin, updateBellScheduleAsAdmin } from '../../../../../../lib/supabase/queries/bell-schedules';
import { deleteSpecialActivityAsAdmin, updateSpecialActivityAsAdmin } from '../../../../../../lib/supabase/queries/special-activities';
import { SPECIAL_ACTIVITY_TYPES, BELL_SCHEDULE_ACTIVITIES } from '../../../../../../lib/constants/activity-types';
import type { SpecialActivity } from '@/src/types/database';
import type { BellScheduleWithCreator } from '../types';

interface EditItemModalProps {
  type: 'bell' | 'activity';
  item: BellScheduleWithCreator | SpecialActivity;
  schoolId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAILY_TIME_PERIOD_NAMES = ['School Start', 'Dismissal', 'Early Dismissal'] as const;

// Helper to add minutes to a time string
const addMinutesToTime = (time: string, minutes: number): string => {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
};

export function EditItemModal({
  type,
  item,
  schoolId,
  onClose,
  onSuccess
}: EditItemModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const headingId = 'edit-modal-heading';

  // Form state for activities
  const activity = type === 'activity' ? item as SpecialActivity : null;
  const [activityName, setActivityName] = useState(activity?.activity_name || '');
  const [startTime, setStartTime] = useState(activity?.start_time || '');
  const [endTime, setEndTime] = useState(activity?.end_time || '');

  // Form state for bell schedules
  const bellSchedule = type === 'bell' ? item as BellScheduleWithCreator : null;
  const [bellPeriodName, setBellPeriodName] = useState(bellSchedule?.period_name || '');
  const [bellStartTime, setBellStartTime] = useState(bellSchedule?.start_time || '');
  const [bellEndTime, setBellEndTime] = useState(bellSchedule?.end_time || '');

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  // Focus trap and initial focus
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (type === 'bell') {
        await deleteBellScheduleAsAdmin(item.id, schoolId);
      } else {
        await deleteSpecialActivityAsAdmin(item.id, schoolId);
      }
      onSuccess();
    } catch (err: any) {
      console.error('Error deleting item:', err);
      setError(err.message || 'Failed to delete item');
      setConfirmDelete(false);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (type !== 'activity') return;

    // Validate times
    if (startTime && endTime && startTime >= endTime) {
      setError('End time must be after start time');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await updateSpecialActivityAsAdmin(item.id, schoolId, {
        activity_name: activityName,
        start_time: startTime,
        end_time: endTime
      });
      onSuccess();
    } catch (err: any) {
      console.error('Error updating activity:', err);
      setError(err.message || 'Failed to update activity');
    } finally {
      setLoading(false);
    }
  };

  // Check if this is a daily time marker
  const isDailyTimeMarker = bellPeriodName && DAILY_TIME_PERIOD_NAMES.includes(bellPeriodName as typeof DAILY_TIME_PERIOD_NAMES[number]);

  const handleBellUpdate = async () => {
    if (type !== 'bell') return;

    // For daily time markers, auto-calculate end_time as start_time + 1 minute
    const effectiveEndTime = isDailyTimeMarker ? addMinutesToTime(bellStartTime, 1) : bellEndTime;

    // Validate times (skip for daily time markers since we auto-calculate)
    if (!isDailyTimeMarker && bellStartTime && effectiveEndTime && bellStartTime >= effectiveEndTime) {
      setError('End time must be after start time');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await updateBellScheduleAsAdmin(item.id, schoolId, {
        period_name: bellPeriodName,
        start_time: bellStartTime,
        end_time: effectiveEndTime
      });
      onSuccess();
    } catch (err: any) {
      console.error('Error updating bell schedule:', err);
      setError(err.message || 'Failed to update bell schedule');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string | null): string => {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const dayName = item.day_of_week ? DAYS[item.day_of_week - 1] : '';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 id={headingId} className="text-lg font-semibold text-gray-900">
            {type === 'bell' ? (isDailyTimeMarker ? 'Daily Time' : 'Bell Schedule') : 'Special Activity'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {dayName} at {formatTime(item.start_time || null)}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {type === 'bell' && bellSchedule && (
            <>
              {/* Grade Level (read-only - defines the schedule slot) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Grade Level
                </label>
                <p className="text-sm text-gray-900">{bellSchedule.grade_level || 'Not specified'}</p>
              </div>

              {/* Activity/Type (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isDailyTimeMarker ? 'Type' : 'Activity'}
                </label>
                <select
                  value={bellPeriodName}
                  onChange={(e) => setBellPeriodName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select {isDailyTimeMarker ? 'type' : 'activity'}...</option>
                  {isDailyTimeMarker ? (
                    DAILY_TIME_PERIOD_NAMES.map((periodName) => (
                      <option key={periodName} value={periodName}>
                        {periodName}
                      </option>
                    ))
                  ) : (
                    BELL_SCHEDULE_ACTIVITIES.map((activity) => (
                      <option key={activity} value={activity}>
                        {activity}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Times (editable) */}
              <div className={isDailyTimeMarker ? '' : 'grid grid-cols-2 gap-4'}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isDailyTimeMarker ? 'Time' : 'Start Time'}
                  </label>
                  <input
                    type="time"
                    value={bellStartTime}
                    onChange={(e) => setBellStartTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {!isDailyTimeMarker && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={bellEndTime}
                      onChange={(e) => setBellEndTime(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {type === 'activity' && activity && (
            <>
              {/* Teacher (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teacher
                </label>
                <p className="text-sm text-gray-900">{activity.teacher_name || 'Not specified'}</p>
              </div>

              {/* Activity type (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Activity Type
                </label>
                <select
                  value={activityName}
                  onChange={(e) => setActivityName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select activity...</option>
                  {SPECIAL_ACTIVITY_TYPES.map((activityType) => (
                    <option key={activityType} value={activityType}>
                      {activityType}
                    </option>
                  ))}
                </select>
              </div>

              {/* Times (editable) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm text-red-700">
                Are you sure you want to delete this {type === 'bell' ? 'bell schedule' : 'activity'}?
                This action cannot be undone.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between">
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading && confirmDelete ? 'Deleting...' : confirmDelete ? 'Confirm Delete' : 'Delete'}
          </Button>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              {confirmDelete ? 'Cancel' : 'Close'}
            </Button>
            {type === 'bell' && (
              <Button variant="primary" onClick={handleBellUpdate} disabled={loading}>
                {loading && !confirmDelete ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            {type === 'activity' && (
              <Button variant="primary" onClick={handleUpdate} disabled={loading}>
                {loading && !confirmDelete ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
