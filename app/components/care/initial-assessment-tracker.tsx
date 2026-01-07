'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { updateInitialAssessment, InitialAssessmentData } from '@/lib/supabase/queries/care-cases';

interface InitialAssessmentTrackerProps {
  caseId: string;
  initialData: {
    ap_received_date: string | null;
    iep_due_date: string | null;
    academic_testing_completed: boolean;
    academic_testing_date: string | null;
    speech_testing_needed: boolean;
    speech_testing_completed: boolean;
    speech_testing_date: string | null;
    psych_testing_completed: boolean;
    psych_testing_date: string | null;
    ot_testing_needed: boolean;
    ot_testing_completed: boolean;
    ot_testing_date: string | null;
  };
  disabled?: boolean;
  onUpdate?: () => void;
}

/**
 * Calculate IEP due date (60 calendar days from AP received date)
 * Uses local date parsing to avoid timezone off-by-one errors
 */
function calculateIepDueDate(apDate: string): string {
  const [year, month, day] = apDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 60);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format date string for display, returns empty string for null/undefined
 */
function formatDateForDisplay(dateString: string | null): string {
  return dateString || '';
}

export function InitialAssessmentTracker({
  caseId,
  initialData,
  disabled = false,
  onUpdate,
}: InitialAssessmentTrackerProps) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track latest initialData for error revert to avoid stale closure
  const latestInitialDataRef = useRef(initialData);
  useEffect(() => {
    latestInitialDataRef.current = initialData;
  }, [initialData]);

  const handleUpdate = useCallback(
    async (updates: InitialAssessmentData) => {
      setSaving(true);
      setError(null);

      // Update local state immediately
      setData(prev => ({ ...prev, ...updates }));

      try {
        await updateInitialAssessment(caseId, updates);
        onUpdate?.();
      } catch (err) {
        console.error('Error saving assessment data:', err);
        setError('Failed to save changes');
        // Revert local state on error using ref to get latest initialData
        setData(latestInitialDataRef.current);
      } finally {
        setSaving(false);
      }
    },
    [caseId, onUpdate]
  );

  const handleApDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const apDate = e.target.value || null;
      const updates: InitialAssessmentData = {
        ap_received_date: apDate,
      };

      // Auto-calculate IEP due date when AP date is set
      if (apDate) {
        updates.iep_due_date = calculateIepDueDate(apDate);
      }

      handleUpdate(updates);
    },
    [handleUpdate]
  );

  const handleIepDueDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleUpdate({ iep_due_date: e.target.value || null });
    },
    [handleUpdate]
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Initial Assessment Tracking</h3>

      {error && (
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* AP and IEP Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="ap-date" className="block text-sm font-medium text-gray-700 mb-1">
            Date AP Received
          </label>
          <input
            id="ap-date"
            type="date"
            value={formatDateForDisplay(data.ap_received_date)}
            onChange={handleApDateChange}
            disabled={disabled || saving}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-gray-500">IEP due date will auto-calculate (60 days)</p>
        </div>
        <div>
          <label htmlFor="iep-due-date" className="block text-sm font-medium text-gray-700 mb-1">
            IEP Due Date
          </label>
          <input
            id="iep-due-date"
            type="date"
            value={formatDateForDisplay(data.iep_due_date)}
            onChange={handleIepDueDateChange}
            disabled={disabled || saving}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Testing Sections */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">
          Assessment Testing
        </h4>

        {/* Academic Testing */}
        <TestingRow
          label="Academic Testing"
          id="academic-testing"
          completed={data.academic_testing_completed}
          completedDate={data.academic_testing_date}
          disabled={disabled || saving}
          onCompletedChange={(completed) =>
            handleUpdate({
              academic_testing_completed: completed,
              academic_testing_date: completed ? data.academic_testing_date : null,
            })
          }
          onDateChange={(date) => handleUpdate({ academic_testing_date: date })}
        />

        {/* Psych Testing */}
        <TestingRow
          label="Psych Testing"
          id="psych-testing"
          completed={data.psych_testing_completed}
          completedDate={data.psych_testing_date}
          disabled={disabled || saving}
          onCompletedChange={(completed) =>
            handleUpdate({
              psych_testing_completed: completed,
              psych_testing_date: completed ? data.psych_testing_date : null,
            })
          }
          onDateChange={(date) => handleUpdate({ psych_testing_date: date })}
        />

        {/* Speech Testing */}
        <TestingRowWithNeeded
          label="Speech Testing"
          id="speech-testing"
          needed={data.speech_testing_needed}
          completed={data.speech_testing_completed}
          completedDate={data.speech_testing_date}
          disabled={disabled || saving}
          onNeededChange={(needed) =>
            handleUpdate({
              speech_testing_needed: needed,
              speech_testing_completed: needed ? data.speech_testing_completed : false,
              speech_testing_date: needed ? data.speech_testing_date : null,
            })
          }
          onCompletedChange={(completed) =>
            handleUpdate({
              speech_testing_completed: completed,
              speech_testing_date: completed ? data.speech_testing_date : null,
            })
          }
          onDateChange={(date) => handleUpdate({ speech_testing_date: date })}
        />

        {/* OT Testing */}
        <TestingRowWithNeeded
          label="OT Testing"
          id="ot-testing"
          needed={data.ot_testing_needed}
          completed={data.ot_testing_completed}
          completedDate={data.ot_testing_date}
          disabled={disabled || saving}
          onNeededChange={(needed) =>
            handleUpdate({
              ot_testing_needed: needed,
              ot_testing_completed: needed ? data.ot_testing_completed : false,
              ot_testing_date: needed ? data.ot_testing_date : null,
            })
          }
          onCompletedChange={(completed) =>
            handleUpdate({
              ot_testing_completed: completed,
              ot_testing_date: completed ? data.ot_testing_date : null,
            })
          }
          onDateChange={(date) => handleUpdate({ ot_testing_date: date })}
        />
      </div>

      {saving && (
        <p className="mt-4 text-xs text-gray-500 text-right">Saving...</p>
      )}
    </div>
  );
}

/**
 * Testing row component for Academic and Psych (always required)
 */
interface TestingRowProps {
  label: string;
  id: string;
  completed: boolean;
  completedDate: string | null;
  disabled: boolean;
  onCompletedChange: (completed: boolean) => void;
  onDateChange: (date: string | null) => void;
}

function TestingRow({
  label,
  id,
  completed,
  completedDate,
  disabled,
  onCompletedChange,
  onDateChange,
}: TestingRowProps) {
  const checkboxId = `${id}-completed`;
  const dateId = `${id}-date`;

  return (
    <div className="flex items-center gap-4 py-2">
      <div className="w-40">
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={checkboxId}
          type="checkbox"
          checked={completed}
          onChange={(e) => onCompletedChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
        />
        <label htmlFor={checkboxId} className="text-sm text-gray-600">Completed</label>
      </div>
      <div className="flex-1">
        <input
          id={dateId}
          type="date"
          value={formatDateForDisplay(completedDate)}
          onChange={(e) => onDateChange(e.target.value || null)}
          disabled={disabled || !completed}
          aria-label={`${label} completion date`}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}

/**
 * Testing row component for Speech and OT (with "needed" checkbox)
 */
interface TestingRowWithNeededProps {
  label: string;
  id: string;
  needed: boolean;
  completed: boolean;
  completedDate: string | null;
  disabled: boolean;
  onNeededChange: (needed: boolean) => void;
  onCompletedChange: (completed: boolean) => void;
  onDateChange: (date: string | null) => void;
}

function TestingRowWithNeeded({
  label,
  id,
  needed,
  completed,
  completedDate,
  disabled,
  onNeededChange,
  onCompletedChange,
  onDateChange,
}: TestingRowWithNeededProps) {
  const neededId = `${id}-needed`;
  const completedId = `${id}-completed`;
  const dateId = `${id}-date`;

  return (
    <div className="flex items-center gap-4 py-2">
      <div className="w-40">
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={neededId}
          type="checkbox"
          checked={needed}
          onChange={(e) => onNeededChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
        />
        <label htmlFor={neededId} className="text-sm text-gray-600">Needed</label>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={completedId}
          type="checkbox"
          checked={completed}
          onChange={(e) => onCompletedChange(e.target.checked)}
          disabled={disabled || !needed}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
        />
        <label htmlFor={completedId} className={`text-sm ${needed ? 'text-gray-600' : 'text-gray-400'}`}>Completed</label>
      </div>
      <div className="flex-1">
        <input
          id={dateId}
          type="date"
          value={formatDateForDisplay(completedDate)}
          onChange={(e) => onDateChange(e.target.value || null)}
          disabled={disabled || !needed || !completed}
          aria-label={`${label} completion date`}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
