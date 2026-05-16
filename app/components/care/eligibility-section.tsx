'use client';

import { useState, useRef, useCallback } from 'react';
import { updateCase, type CareCaseWithDetails } from '@/lib/supabase/queries/care-cases';
import {
  ELIGIBILITY_OUTCOMES,
  ELIGIBILITY_CATEGORIES,
  type EligibilityOutcome,
  type EligibilityCategory,
} from '@/lib/constants/care';

interface EligibilitySectionProps {
  caseId: string;
  caseData: CareCaseWithDetails;
  disabled?: boolean;
  onUpdate?: () => void;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed';

export function EligibilitySection({
  caseId,
  caseData,
  disabled = false,
  onUpdate,
}: EligibilitySectionProps) {
  const [meetingDate, setMeetingDate] = useState(caseData.eligibility_meeting_date ?? '');
  const [outcome, setOutcome] = useState<EligibilityOutcome | ''>(
    caseData.eligibility_outcome ?? ''
  );
  const [category, setCategory] = useState<EligibilityCategory | ''>(
    caseData.eligibility_category ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest server values, used to revert local state if a save fails.
  const propsRef = useRef(caseData);
  propsRef.current = caseData;

  const persist = useCallback(
    async (updates: {
      eligibility_meeting_date?: string | null;
      eligibility_outcome?: EligibilityOutcome | null;
      eligibility_category?: EligibilityCategory | null;
    }) => {
      setSaving(true);
      setError(null);
      try {
        await updateCase(caseId, updates);
        onUpdate?.();
      } catch (err) {
        console.error('Error saving eligibility:', err);
        setError('Failed to save changes');
        setMeetingDate(propsRef.current.eligibility_meeting_date ?? '');
        setOutcome(propsRef.current.eligibility_outcome ?? '');
        setCategory(propsRef.current.eligibility_category ?? '');
      } finally {
        setSaving(false);
      }
    },
    [caseId, onUpdate]
  );

  const isEligible = outcome === 'eligible';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Eligibility Determination</h3>

      {error && (
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="elig-meeting-date"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Eligibility Meeting Date
          </label>
          <input
            id="elig-meeting-date"
            type="date"
            value={meetingDate}
            onChange={(e) => {
              setMeetingDate(e.target.value);
              persist({ eligibility_meeting_date: e.target.value || null });
            }}
            disabled={disabled || saving}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="elig-outcome" className="block text-sm font-medium text-gray-700 mb-1">
            Outcome
          </label>
          <select
            id="elig-outcome"
            value={outcome}
            onChange={(e) => {
              const newOutcome = (e.target.value || '') as EligibilityOutcome | '';
              setOutcome(newOutcome);
              const updates: {
                eligibility_outcome: EligibilityOutcome | null;
                eligibility_category?: EligibilityCategory | null;
              } = { eligibility_outcome: newOutcome || null };
              // A category only applies to an "eligible" outcome.
              if (newOutcome !== 'eligible' && category) {
                setCategory('');
                updates.eligibility_category = null;
              }
              persist(updates);
            }}
            disabled={disabled || saving}
            className={inputClass}
          >
            <option value="">Not yet determined</option>
            {ELIGIBILITY_OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isEligible && (
        <div className="mt-3">
          <label htmlFor="elig-category" className="block text-sm font-medium text-gray-700 mb-1">
            Disability Category
          </label>
          <select
            id="elig-category"
            value={category}
            onChange={(e) => {
              const newCategory = (e.target.value || '') as EligibilityCategory | '';
              setCategory(newCategory);
              persist({ eligibility_category: newCategory || null });
            }}
            disabled={disabled || saving}
            className={inputClass}
          >
            <option value="">Select category...</option>
            {ELIGIBILITY_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {caseData.care_referrals.referral_source === 'private_school' && (
            <p className="mt-1 text-xs text-gray-500">
              Private-school students receive a services plan rather than an IEP.
            </p>
          )}
        </div>
      )}

      {saving && <p className="mt-3 text-xs text-gray-500 text-right">Saving...</p>}
    </div>
  );
}
