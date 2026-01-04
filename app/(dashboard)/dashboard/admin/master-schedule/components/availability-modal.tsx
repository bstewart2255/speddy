'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../../../../components/ui/button';
import {
  DayAvailabilityWithTimes,
  DayConfig,
  getActivityTypeAvailabilityWithTimes,
  upsertActivityAvailabilityWithTimes,
} from '../../../../../../lib/supabase/queries/activity-availability';

interface AvailabilityModalProps {
  activityType: string;
  schoolId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
];

const DEFAULT_START_TIME = '08:00';
const DEFAULT_END_TIME = '12:00';

export function AvailabilityModal({
  activityType,
  schoolId,
  onClose,
  onSuccess,
}: AvailabilityModalProps) {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useTimeRanges, setUseTimeRanges] = useState(false);
  const [availability, setAvailability] = useState<Record<DayKey, DayConfig>>({
    monday: { available: true },
    tuesday: { available: true },
    wednesday: { available: true },
    thursday: { available: true },
    friday: { available: true },
  });
  const modalRef = useRef<HTMLDivElement>(null);
  const headingId = 'availability-modal-heading';

  // Fetch current availability on mount
  useEffect(() => {
    async function fetchAvailability() {
      try {
        const data = await getActivityTypeAvailabilityWithTimes(schoolId, activityType);
        setAvailability({
          monday: data.monday,
          tuesday: data.tuesday,
          wednesday: data.wednesday,
          thursday: data.thursday,
          friday: data.friday,
        });
        setUseTimeRanges(data.useTimeRanges);
      } catch (err: unknown) {
        console.error('Error fetching availability:', err);
        setError('Failed to load availability settings');
      } finally {
        setFetching(false);
      }
    }
    fetchAvailability();
  }, [schoolId, activityType]);

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

  const handleToggleDay = (day: DayKey) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: { ...prev[day], available: !prev[day].available },
    }));
  };

  const handleToggleTimeRanges = () => {
    setUseTimeRanges((prev) => {
      const newValue = !prev;
      // When enabling time ranges, set default times for available days
      if (newValue) {
        setAvailability((prevAvail) => {
          const updated = { ...prevAvail };
          for (const day of DAYS) {
            if (updated[day.key].available && !updated[day.key].timeRange) {
              updated[day.key] = {
                ...updated[day.key],
                timeRange: { start: DEFAULT_START_TIME, end: DEFAULT_END_TIME },
              };
            }
          }
          return updated;
        });
      }
      return newValue;
    });
  };

  const handleTimeChange = (day: DayKey, field: 'start' | 'end', value: string) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeRange: {
          start: field === 'start' ? value : (prev[day].timeRange?.start || DEFAULT_START_TIME),
          end: field === 'end' ? value : (prev[day].timeRange?.end || DEFAULT_END_TIME),
        },
      },
    }));
  };

  const handleSave = async () => {
    setError(null);
    setLoading(true);

    try {
      const dataToSave: DayAvailabilityWithTimes = {
        ...availability,
        useTimeRanges,
      };
      await upsertActivityAvailabilityWithTimes(schoolId, activityType, dataToSave);
      onSuccess();
    } catch (err: unknown) {
      console.error('Error saving availability:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save availability';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = DAYS.filter((d) => availability[d.key].available).length;

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
            {activityType} Availability
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Select which days {activityType} is available
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {fetching ? (
            <div className="py-4 text-center text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Time ranges toggle */}
              <div className="pb-3 border-b border-gray-200">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useTimeRanges}
                    onChange={handleToggleTimeRanges}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Set specific hours
                  </span>
                </label>
                {useTimeRanges && (
                  <p className="mt-1 text-xs text-gray-500 ml-7">
                    For teachers who split time between schools
                  </p>
                )}
              </div>

              {/* Days list */}
              <div className="space-y-3">
                {DAYS.map((day) => (
                  <div key={day.key} className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={availability[day.key].available}
                        onChange={() => handleToggleDay(day.key)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        {day.label}
                      </span>
                    </label>

                    {/* Time inputs when toggle is on and day is available */}
                    {useTimeRanges && availability[day.key].available && (
                      <div className="ml-7 flex items-center gap-2">
                        <input
                          type="time"
                          value={availability[day.key].timeRange?.start || DEFAULT_START_TIME}
                          onChange={(e) => handleTimeChange(day.key, 'start', e.target.value)}
                          className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-blue-500 focus:ring-1 focus:border-blue-500"
                        />
                        <span className="text-xs text-gray-500">to</span>
                        <input
                          type="time"
                          value={availability[day.key].timeRange?.end || DEFAULT_END_TIME}
                          onChange={(e) => handleTimeChange(day.key, 'end', e.target.value)}
                          className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-blue-500 focus:ring-1 focus:border-blue-500"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Summary */}
          {!fetching && (
            <div className="pt-2 text-xs text-gray-500">
              {selectedCount === 5
                ? useTimeRanges ? 'Available all days (with hours)' : 'Available all days'
                : selectedCount === 0
                ? 'Not available any day'
                : `Available ${selectedCount} day${selectedCount !== 1 ? 's' : ''}${useTimeRanges ? ' (with hours)' : ''}`}
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
            disabled={loading || fetching}
          >
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
