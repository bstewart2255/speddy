'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { toWeeklyMinutes, type ServicePeriod } from '@/lib/services/weekly-minutes';

/**
 * IEP minutes converter: enter the minutes exactly as the IEP words them
 * (per year / per month / per day / per week) and apply the converted weekly
 * amount to the real form fields. The conversion runs through the shared
 * 36-week-school-year system, rounding up; the applied value stays fully
 * editable — the IEP document remains the source of truth.
 *
 * Collapsed behind a question by default. Open, it sat in the middle of the
 * add form looking like another field to fill in, when it is an optional
 * calculator most entries never need: the provider who already knows
 * "3x/week, 30 min" has no use for it. The question names the case that DOES
 * need it — a yearly total, far and away the most common IEP wording — so the
 * people it is for recognise themselves in it. The period selector inside
 * still covers month, week and day.
 */
interface IepMinutesConverterProps {
  onApply: (weeklyMinutes: number) => void;
}

const PERIOD_OPTIONS: Array<{ value: ServicePeriod; label: string }> = [
  { value: 'yearly', label: 'per year' },
  { value: 'monthly', label: 'per month' },
  { value: 'weekly', label: 'per week' },
  { value: 'daily', label: 'per day' },
];

export function IepMinutesConverter({ onApply }: IepMinutesConverterProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<ServicePeriod>('yearly');

  // `Number`, not `parseInt`: parseInt reads left to right and stops at the
  // first character it cannot use, so "1e3" becomes 1 instead of 1000 and
  // "30.5" becomes 30 — a compliance number quietly turned into a different
  // one. Anything that is not a whole number converts to nothing at all, which
  // simply leaves the result row hidden rather than offering a wrong figure.
  const parsed = Number(amount);
  const weeklyMinutes =
    Number.isInteger(parsed) && parsed > 0 ? toWeeklyMinutes(parsed, period) : 0;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
      >
        <svg
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        IEP minutes listed per year?
      </button>

      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-gray-700">
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 1080"
            aria-label="Minutes as stated in the IEP"
            className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <span>min</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ServicePeriod)}
            aria-label="Period as stated in the IEP"
            className="px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {weeklyMinutes > 0 && (
            <span className="flex items-center gap-2">
              <span aria-hidden>=</span>
              <span className="font-medium text-gray-900">{weeklyMinutes.toLocaleString()} min/week</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                // Collapse on apply: the numbers are now in the real fields,
                // which is where the user should be reading them.
                onClick={() => {
                  onApply(weeklyMinutes);
                  setOpen(false);
                }}
              >
                Use this
              </Button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
