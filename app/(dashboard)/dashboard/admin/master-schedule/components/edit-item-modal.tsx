'use client';

import React, { useState } from 'react';
import { Button } from '../../../../../components/ui/button';
import { deleteBellSchedule } from '../../../../../../lib/supabase/queries/bell-schedules';
import { deleteSpecialActivity, updateSpecialActivity } from '../../../../../../lib/supabase/queries/special-activities';
import { BELL_SCHEDULE_ACTIVITIES, SPECIAL_ACTIVITY_TYPES } from '../../../../../../lib/constants/activity-types';
import type { SpecialActivity } from '@/src/types/database';
import type { BellScheduleWithCreator } from '../types';

interface EditItemModalProps {
  type: 'bell' | 'activity';
  item: BellScheduleWithCreator | SpecialActivity;
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function EditItemModal({
  type,
  item,
  onClose,
  onSuccess
}: EditItemModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state for activities (bell schedules are read-only for now)
  const activity = type === 'activity' ? item as SpecialActivity : null;
  const [activityName, setActivityName] = useState(activity?.activity_name || '');
  const [startTime, setStartTime] = useState(activity?.start_time || '');
  const [endTime, setEndTime] = useState(activity?.end_time || '');

  const bellSchedule = type === 'bell' ? item as BellScheduleWithCreator : null;

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (type === 'bell') {
        await deleteBellSchedule(item.id);
      } else {
        await deleteSpecialActivity(item.id);
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

    setError(null);
    setLoading(true);

    try {
      await updateSpecialActivity(item.id, {
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

  const formatTime = (time: string | null): string => {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const dayName = item.day_of_week ? DAYS[item.day_of_week - 1] : '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {type === 'bell' ? 'Bell Schedule' : 'Special Activity'}
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
              {/* Bell schedule details (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Activity
                </label>
                <p className="text-sm text-gray-900">{bellSchedule.period_name || 'Not specified'}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Grade Level
                </label>
                <p className="text-sm text-gray-900">{bellSchedule.grade_level || 'Not specified'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time
                  </label>
                  <p className="text-sm text-gray-900">{formatTime(bellSchedule.start_time)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time
                  </label>
                  <p className="text-sm text-gray-900">{formatTime(bellSchedule.end_time)}</p>
                </div>
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
