'use client';

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface ManualProgressEntry {
  id: string;
  student_id: string;
  iep_goal_index: number;
  score: number;
  observation_date: string;
  source?: string;
  notes?: string;
}

interface AddManualProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  studentId: string;
  goalIndex: number;
  goalText: string;
  entry?: ManualProgressEntry | null; // For edit mode
  schoolId?: string;
  districtId?: string;
  stateId?: string;
}

const SOURCE_OPTIONS = [
  'Session observation',
  'Classroom feedback',
  'External assessment',
  'Parent report',
  'Other',
];

export function AddManualProgressModal({
  isOpen,
  onClose,
  onSave,
  studentId,
  goalIndex,
  goalText,
  entry,
  schoolId,
  districtId,
  stateId,
}: AddManualProgressModalProps) {
  const [score, setScore] = useState<string>(entry?.score?.toString() || '');
  const [observationDate, setObservationDate] = useState<string>(
    entry?.observation_date || format(new Date(), 'yyyy-MM-dd')
  );
  const [source, setSource] = useState<string>(entry?.source || '');
  const [notes, setNotes] = useState<string>(entry?.notes || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!entry;

  // Reset form when modal opens or entry changes
  useEffect(() => {
    if (isOpen) {
      setScore(entry?.score?.toString() || '');
      setObservationDate(entry?.observation_date || format(new Date(), 'yyyy-MM-dd'));
      setSource(entry?.source || '');
      setNotes(entry?.notes || '');
      setError(null);
    }
  }, [isOpen, entry]);

  const handleSave = async () => {
    // Validate score
    const scoreNum = parseInt(score, 10);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      setError('Score must be a number between 0 and 100');
      return;
    }

    // Validate date
    if (!observationDate) {
      setError('Date is required');
      return;
    }

    const selectedDate = new Date(observationDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (selectedDate > today) {
      setError('Date cannot be in the future');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const body = {
        ...(isEditMode && { id: entry.id }),
        student_id: studentId,
        iep_goal_index: goalIndex,
        score: scoreNum,
        observation_date: observationDate,
        source: source || null,
        notes: notes || null,
        school_id: schoolId,
        district_id: districtId,
        state_id: stateId,
      };

      const response = await fetch('/api/manual-progress', {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save progress');
      }

      onSave();
      handleClose();
    } catch (err: any) {
      console.error('Error saving manual progress:', err);
      setError(err.message || 'Failed to save progress');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!entry?.id) return;

    if (!confirm('Are you sure you want to delete this progress entry?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/manual-progress?id=${entry.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete progress');
      }

      onSave();
      handleClose();
    } catch (err: any) {
      console.error('Error deleting manual progress:', err);
      setError(err.message || 'Failed to delete progress');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setScore('');
    setObservationDate(format(new Date(), 'yyyy-MM-dd'));
    setSource('');
    setNotes('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          {isEditMode ? 'Edit Progress Entry' : 'Add Manual Progress'}
        </h3>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Goal display (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Goal #{goalIndex + 1}
            </label>
            <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded border">
              {goalText}
            </p>
          </div>

          {/* Observation date */}
          <div>
            <label htmlFor="observationDate" className="block text-sm font-medium text-gray-700 mb-1">
              Date *
            </label>
            <input
              id="observationDate"
              type="date"
              value={observationDate}
              onChange={(e) => setObservationDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Score */}
          <div>
            <label htmlFor="score" className="block text-sm font-medium text-gray-700 mb-1">
              Score (0-100%) *
            </label>
            <div className="relative">
              <input
                id="score"
                type="number"
                min="0"
                max="100"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="e.g., 85"
                className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                %
              </span>
            </div>
          </div>

          {/* Source */}
          <div>
            <label htmlFor="source" className="block text-sm font-medium text-gray-700 mb-1">
              Source
            </label>
            <select
              id="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a source (optional)</option>
              {SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes about this observation..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-between">
          {isEditMode && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <div className={`flex gap-2 ${isEditMode ? '' : 'ml-auto'}`}>
            <button
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !score || !observationDate}
              className={`px-4 py-2 rounded-md text-white ${
                loading || !score || !observationDate
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? 'Saving...' : isEditMode ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
