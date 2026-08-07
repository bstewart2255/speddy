'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { toWeeklyMinutes, type ServicePeriod } from '@/lib/services/weekly-minutes';

/**
 * "As the IEP states it" helper: enter the minutes exactly as the IEP words
 * them (per year / per month / per day / per week) and apply the converted
 * weekly amount to the real form fields. The conversion runs through the
 * shared 36-week-school-year system, rounding up; the applied value stays
 * fully editable — the IEP document remains the source of truth.
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
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<ServicePeriod>('yearly');

  const parsed = parseInt(amount, 10);
  const weeklyMinutes = Number.isFinite(parsed) && parsed > 0 ? toWeeklyMinutes(parsed, period) : 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-gray-700">
      <span className="font-medium text-gray-900">As the IEP states it:</span>
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
          <Button type="button" variant="secondary" size="sm" onClick={() => onApply(weeklyMinutes)}>
            Use this
          </Button>
        </span>
      )}
    </div>
  );
}
