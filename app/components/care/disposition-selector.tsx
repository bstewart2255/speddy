'use client';

import { useState } from 'react';
import { CARE_DISPOSITIONS, type CareDisposition } from '@/lib/constants/care';

interface DispositionSelectorProps {
  value: CareDisposition | null;
  onChange: (disposition: CareDisposition) => Promise<void>;
  disabled?: boolean;
}

export function DispositionSelector({ value, onChange, disabled }: DispositionSelectorProps) {
  const [loading, setLoading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value as CareDisposition;
    if (!newValue || newValue === value) return;

    setLoading(true);
    try {
      await onChange(newValue);
    } catch (error) {
      console.error('Failed to update disposition:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label htmlFor="disposition" className="block text-sm font-medium text-gray-700 mb-1">
        Disposition / Outcome
      </label>
      <select
        id="disposition"
        value={value || ''}
        onChange={handleChange}
        disabled={disabled || loading}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <option value="">Select outcome...</option>
        {CARE_DISPOSITIONS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      {loading && <p className="mt-1 text-xs text-gray-500">Saving...</p>}
    </div>
  );
}
