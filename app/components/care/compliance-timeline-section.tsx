'use client';

import { useState, useRef, useCallback } from 'react';
import { updateCase, type CareCaseWithDetails } from '@/lib/supabase/queries/care-cases';

interface ComplianceTimelineSectionProps {
  caseId: string;
  caseData: CareCaseWithDetails;
  disabled?: boolean;
  onUpdate?: () => void;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed';

/** Format a YYYY-MM-DD date string for display (parsed in local time). */
function formatDate(d: string | null): string {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** True if a YYYY-MM-DD date is before today. */
function isPast(d: string): boolean {
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(y, m - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export function ComplianceTimelineSection({
  caseId,
  caseData,
  disabled = false,
  onUpdate,
}: ComplianceTimelineSectionProps) {
  const [apSentDate, setApSentDate] = useState(caseData.ap_sent_date ?? '');
  const [apDueDate, setApDueDate] = useState(caseData.ap_due_date ?? '');
  const [apDueNote, setApDueNote] = useState(caseData.ap_due_date_note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest server values, used to revert local state if a save fails.
  const propsRef = useRef(caseData);
  propsRef.current = caseData;

  const persist = useCallback(
    async (updates: {
      ap_sent_date?: string | null;
      ap_due_date?: string | null;
      ap_due_date_note?: string | null;
    }) => {
      setSaving(true);
      setError(null);
      try {
        await updateCase(caseId, updates);
        onUpdate?.();
      } catch (err) {
        console.error('Error saving compliance dates:', err);
        setError('Failed to save changes');
        setApSentDate(propsRef.current.ap_sent_date ?? '');
        setApDueDate(propsRef.current.ap_due_date ?? '');
        setApDueNote(propsRef.current.ap_due_date_note ?? '');
      } finally {
        setSaving(false);
      }
    },
    [caseId, onUpdate]
  );

  // Timeline step derivation -- a step is "done" when its data is present.
  const apSent = !!caseData.ap_sent_date;
  const consentReceived = !!caseData.ap_received_date;
  const testingDone =
    caseData.academic_testing_completed &&
    caseData.psych_testing_completed &&
    (!caseData.speech_testing_needed || caseData.speech_testing_completed) &&
    (!caseData.ot_testing_needed || caseData.ot_testing_completed);
  const eligibilityDone = !!caseData.eligibility_outcome;

  const steps = [
    { label: 'Request received', done: true },
    { label: 'AP sent', done: apSent },
    { label: 'Consent received', done: consentReceived },
    { label: 'Evaluation', done: consentReceived && testingDone },
    { label: 'Eligibility', done: eligibilityDone },
  ];
  const currentIndex = steps.findIndex((s) => !s.done);

  // Next deadline the provider should be watching.
  let deadline: { label: string; date: string | null } | null = null;
  if (!apSent) {
    deadline = { label: 'Assessment Plan due', date: caseData.ap_due_date };
  } else if (!consentReceived) {
    deadline = { label: 'Awaiting parent consent', date: null };
  } else if (!eligibilityDone) {
    deadline = { label: 'IEP due', date: caseData.iep_due_date };
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Compliance Timeline</h3>

      {error && (
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step strip */}
      <div className="flex items-start mb-4">
        {steps.map((step, i) => (
          <div key={step.label} className="flex-1 flex flex-col items-center relative">
            {i > 0 && (
              <div
                className={`absolute top-3 right-1/2 w-full h-0.5 ${
                  steps[i - 1].done ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              />
            )}
            <div
              className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                step.done
                  ? 'bg-blue-600 text-white'
                  : i === currentIndex
                  ? 'bg-white border-2 border-blue-600 text-blue-600'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step.done ? '✓' : i + 1}
            </div>
            <span
              className={`mt-1 text-xs text-center ${
                i === currentIndex ? 'text-blue-700 font-medium' : 'text-gray-500'
              }`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Next deadline */}
      {deadline && (
        <div className="mb-4 text-sm">
          <span className="font-medium text-gray-700">Next: </span>
          <span className="text-gray-700">{deadline.label}</span>
          {deadline.date && (
            <span
              className={`ml-1 font-medium ${
                isPast(deadline.date) ? 'text-red-600' : 'text-gray-900'
              }`}
            >
              — {formatDate(deadline.date)}
              {isPast(deadline.date) ? ' (overdue)' : ''}
            </span>
          )}
        </div>
      )}

      {/* Assessment Plan dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ap-sent-date" className="block text-sm font-medium text-gray-700 mb-1">
            Date AP Sent
          </label>
          <input
            id="ap-sent-date"
            type="date"
            value={apSentDate}
            onChange={(e) => {
              setApSentDate(e.target.value);
              persist({ ap_sent_date: e.target.value || null });
            }}
            disabled={disabled || saving}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="ap-due-date" className="block text-sm font-medium text-gray-700 mb-1">
            AP Due Date
          </label>
          <input
            id="ap-due-date"
            type="date"
            value={apDueDate}
            onChange={(e) => {
              setApDueDate(e.target.value);
              persist({ ap_due_date: e.target.value || null });
            }}
            disabled={disabled || saving}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="ap-due-note" className="block text-sm font-medium text-gray-700 mb-1">
          AP Due Date Note
        </label>
        <input
          id="ap-due-note"
          type="text"
          value={apDueNote}
          onChange={(e) => setApDueNote(e.target.value)}
          onBlur={() => {
            if ((apDueNote || '') !== (caseData.ap_due_date_note ?? '')) {
              persist({ ap_due_date_note: apDueNote || null });
            }
          }}
          disabled={disabled || saving}
          placeholder="Reason for any adjustment (e.g. winter break 12/22–1/5)"
          className={inputClass}
        />
      </div>

      {saving && <p className="mt-3 text-xs text-gray-500 text-right">Saving...</p>}
    </div>
  );
}
