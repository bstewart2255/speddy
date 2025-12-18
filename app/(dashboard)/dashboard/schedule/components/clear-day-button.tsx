'use client';

import React, { useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { LongHoverTooltip } from '../../../../components/ui/long-hover-tooltip';

interface ClearDayButtonProps {
  day: number;
  dayName: string;
  sessionCount: number;
  onClearDay: (day: number) => void;
  disabled?: boolean;
}

export function ClearDayButton({
  day,
  dayName,
  sessionCount,
  onClearDay,
  disabled = false,
}: ClearDayButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = () => {
    if (sessionCount === 0) return;
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    onClearDay(day);
    setShowConfirm(false);
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  if (sessionCount === 0) {
    return (
      <button
        disabled
        className="px-2 py-1 text-xs text-gray-300 cursor-not-allowed flex items-center gap-1"
        title="No sessions to clear"
      >
        <TrashIcon className="w-3 h-3" />
        Clear
      </button>
    );
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded border border-yellow-300">
        <span className="text-xs text-gray-700 whitespace-nowrap">Clear {sessionCount}?</span>
        <button
          onClick={handleConfirm}
          className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Yes
        </button>
        <button
          onClick={handleCancel}
          className="px-2 py-0.5 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <LongHoverTooltip content="Remove all sessions from this day. Sessions will return to the unscheduled pool and can be rescheduled later.">
      <button
        onClick={handleClick}
        disabled={disabled}
        className="px-2 py-1 text-xs bg-red-50 text-red-700 hover:bg-red-100 rounded flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <TrashIcon className="w-3 h-3" />
        Clear ({sessionCount})
      </button>
    </LongHoverTooltip>
  );
}
