'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { getCurrentSchoolYear } from '@/lib/school-year';
import {
  getMyTeacherAvailabilityPref,
  upsertMyTeacherAvailabilityPref,
} from '@/lib/supabase/queries/iep-meeting-setup';

type Preference = 'before_school' | 'after_school' | 'prep' | 'any';

const PREFERENCE_OPTIONS: { value: Preference; label: string }[] = [
  { value: 'before_school', label: 'Before school' },
  { value: 'after_school', label: 'After school' },
  { value: 'prep', label: 'During my prep' },
  { value: 'any', label: 'Any of these' },
];

/**
 * Once-a-year prompt asking teachers when IEP meetings work for them.
 * Renders nothing if the teacher already answered for the current school
 * year, or dismissed the prompt this year ("remind me later").
 */
export function AvailabilityPromptCard() {
  const schoolYear = getCurrentSchoolYear();
  const dismissKey = `iep-availability-prompt-dismissed-${schoolYear}`;

  const [visible, setVisible] = useState(false);
  const [preference, setPreference] = useState<Preference | null>(null);
  const [prepStart, setPrepStart] = useState('');
  const [prepEnd, setPrepEnd] = useState('');
  const [prepDescription, setPrepDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      try {
        if (localStorage.getItem(dismissKey)) return;
        const pref = await getMyTeacherAvailabilityPref(schoolYear);
        if (!pref) setVisible(true);
      } catch {
        // Non-critical prompt: stay hidden on any failure
      }
    }
    check();
  }, [dismissKey, schoolYear]);

  const showPrepFields = preference === 'prep' || preference === 'any';
  // Prep times are the scheduler's only availability source for secondary
  // teachers — a prep preference without times would be unusable and the
  // prompt never re-asks once a row exists.
  const prepTimesMissing = showPrepFields && (!prepStart || !prepEnd);
  const canSave = !!preference && !prepTimesMissing;

  const handleSave = async () => {
    if (!canSave || !preference) return;
    setSaving(true);
    setError(null);
    try {
      await upsertMyTeacherAvailabilityPref({
        school_year: schoolYear,
        meeting_time_preference: preference,
        prep_start: showPrepFields && prepStart ? prepStart : null,
        prep_end: showPrepFields && prepEnd ? prepEnd : null,
        prep_description:
          showPrepFields && prepDescription.trim()
            ? prepDescription.trim()
            : null,
      });
      setSaved(true);
      setTimeout(() => setVisible(false), 2500);
    } catch (err) {
      console.error('Failed to save availability preference:', err);
      setError('Could not save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissKey, '1');
    } catch {
      // Storage unavailable (e.g. private mode) — still hide for this session
    }
    setVisible(false);
  };

  if (!visible) return null;

  if (saved) {
    return (
      <div className="mb-8 bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
        Thanks — your IEP meeting availability is saved for {schoolYear}.
      </div>
    );
  }

  return (
    <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-blue-800">
            When do IEP meetings work for you this year?
          </h3>
          <p className="mt-1 text-sm text-blue-700">
            Answer once and meeting organizers will only propose times that
            fit your day.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-blue-400 hover:text-blue-600 text-xl leading-none flex-shrink-0"
          aria-label="Remind me later"
          title="Remind me later"
        >
          ×
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PREFERENCE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setPreference(opt.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              preference === opt.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
            }`}
            aria-pressed={preference === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {showPrepFields && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-700" htmlFor="prep-start">
            My prep is
          </label>
          <input
            id="prep-start"
            type="time"
            value={prepStart}
            onChange={e => setPrepStart(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            aria-label="Prep start time"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="time"
            value={prepEnd}
            onChange={e => setPrepEnd(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            aria-label="Prep end time"
          />
          <input
            type="text"
            placeholder="e.g. 4th period (optional)"
            value={prepDescription}
            onChange={e => setPrepDescription(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1 min-w-[180px]"
            aria-label="Prep description"
          />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={!canSave} isLoading={saving}>
          Save availability
        </Button>
        {preference && prepTimesMissing && (
          <span className="text-sm text-blue-700">
            Enter your prep start and end times to save.
          </span>
        )}
      </div>
    </div>
  );
}
