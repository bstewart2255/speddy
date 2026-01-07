'use client';

import { useState } from 'react';
import { CARE_DISPOSITIONS, type CareDisposition } from '@/lib/constants/care';

interface DispositionSelectorProps {
  value: CareDisposition | null;
  onChange: (disposition: CareDisposition) => Promise<void>;
  onMoveToInitials?: () => void;
  showMoveToInitials?: boolean;
  onCloseCase?: () => void;
  showCloseCase?: boolean;
  disabled?: boolean;
}

export function DispositionSelector({
  value,
  onChange,
  onMoveToInitials,
  showMoveToInitials = false,
  onCloseCase,
  showCloseCase = false,
  disabled,
}: DispositionSelectorProps) {
  const [loading, setLoading] = useState(false);

  // Filter out special action options - they're handled specially
  const regularOptions = CARE_DISPOSITIONS.filter(
    d => d.value !== 'move_to_initials' && d.value !== 'close_case'
  );
  const moveToInitialsOption = CARE_DISPOSITIONS.find(d => d.value === 'move_to_initials');
  const closeCaseOption = CARE_DISPOSITIONS.find(d => d.value === 'close_case');

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value as CareDisposition;
    if (!newValue || newValue === value) return;

    // Handle "Move to 'Initials'" specially
    if (newValue === 'move_to_initials') {
      if (onMoveToInitials) {
        onMoveToInitials();
      }
      // Reset the select to the current value (don't actually set this disposition)
      e.target.value = value || '';
      return;
    }

    // Handle "Close Case" specially
    if (newValue === 'close_case') {
      if (onCloseCase) {
        onCloseCase();
      }
      // Reset the select to the current value (don't actually set this disposition)
      e.target.value = value || '';
      return;
    }

    setLoading(true);
    try {
      await onChange(newValue);
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label htmlFor="disposition" className="block text-sm font-medium text-gray-700 mb-1">
        Status
      </label>
      <select
        id="disposition"
        value={value || ''}
        onChange={handleChange}
        disabled={disabled || loading}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <option value="">Select status...</option>
        {regularOptions.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
        {(showMoveToInitials || showCloseCase) && (
          <option disabled>───────────</option>
        )}
        {showMoveToInitials && moveToInitialsOption && (
          <option value={moveToInitialsOption.value}>
            {moveToInitialsOption.label}
          </option>
        )}
        {showCloseCase && closeCaseOption && (
          <option value={closeCaseOption.value}>
            {closeCaseOption.label}
          </option>
        )}
      </select>
      {loading && <p className="mt-1 text-xs text-gray-500">Saving...</p>}
    </div>
  );
}
