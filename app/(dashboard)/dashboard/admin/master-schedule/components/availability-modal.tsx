'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../../../../components/ui/button';
import {
  DayAvailability,
  getActivityTypeAvailability,
  upsertActivityAvailability,
} from '../../../../../../lib/supabase/queries/activity-availability';

interface AvailabilityModalProps {
  activityType: string;
  schoolId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS = [
  { key: 'monday' as const, label: 'Monday' },
  { key: 'tuesday' as const, label: 'Tuesday' },
  { key: 'wednesday' as const, label: 'Wednesday' },
  { key: 'thursday' as const, label: 'Thursday' },
  { key: 'friday' as const, label: 'Friday' },
];

export function AvailabilityModal({
  activityType,
  schoolId,
  onClose,
  onSuccess,
}: AvailabilityModalProps) {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<DayAvailability>({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
  });
  const modalRef = useRef<HTMLDivElement>(null);
  const headingId = 'availability-modal-heading';

  // Fetch current availability on mount
  useEffect(() => {
    async function fetchAvailability() {
      try {
        const data = await getActivityTypeAvailability(schoolId, activityType);
        setAvailability(data);
      } catch (err: any) {
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

  const handleToggleDay = (day: keyof DayAvailability) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  };

  const handleSave = async () => {
    setError(null);
    setLoading(true);

    try {
      await upsertActivityAvailability(schoolId, activityType, availability);
      onSuccess();
    } catch (err: any) {
      console.error('Error saving availability:', err);
      setError(err.message || 'Failed to save availability');
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = DAYS.filter((d) => availability[d.key]).length;

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
            <div className="space-y-3">
              {DAYS.map((day) => (
                <label
                  key={day.key}
                  className="flex items-center gap-3 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={availability[day.key]}
                    onChange={() => handleToggleDay(day.key)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {day.label}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Summary */}
          {!fetching && (
            <div className="pt-2 text-xs text-gray-500">
              {selectedCount === 5
                ? 'Available all days'
                : selectedCount === 0
                ? 'Not available any day'
                : `Available ${selectedCount} day${selectedCount !== 1 ? 's' : ''}`}
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
