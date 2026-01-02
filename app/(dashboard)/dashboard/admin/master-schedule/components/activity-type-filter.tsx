'use client';

import React from 'react';
import { SPECIAL_ACTIVITY_TYPES } from '../../../../../../lib/constants/activity-types';

interface ActivityTypeFilterProps {
  selectedTypes: Set<string>;
  onToggleType: (type: string) => void;
  onClearAll: () => void;
  onSelectAll: () => void;
}

const ACTIVITY_COLOR_MAP: Record<string, { bg: string; border: string; selectedBg: string }> = {
  Library: { bg: 'bg-blue-50', border: 'border-blue-300', selectedBg: 'bg-blue-200' },
  STEAM: { bg: 'bg-orange-50', border: 'border-orange-300', selectedBg: 'bg-orange-200' },
  STEM: { bg: 'bg-teal-50', border: 'border-teal-300', selectedBg: 'bg-teal-200' },
  Garden: { bg: 'bg-lime-50', border: 'border-lime-300', selectedBg: 'bg-lime-200' },
  Music: { bg: 'bg-violet-50', border: 'border-violet-300', selectedBg: 'bg-violet-200' },
  ART: { bg: 'bg-fuchsia-50', border: 'border-fuchsia-300', selectedBg: 'bg-fuchsia-200' },
  PE: { bg: 'bg-red-50', border: 'border-red-300', selectedBg: 'bg-red-200' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-50', border: 'border-gray-300', selectedBg: 'bg-gray-200' };

export function ActivityTypeFilter({
  selectedTypes,
  onToggleType,
  onClearAll,
  onSelectAll
}: ActivityTypeFilterProps) {
  const allSelected = selectedTypes.size === SPECIAL_ACTIVITY_TYPES.length;
  const noneSelected = selectedTypes.size === 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-700">Activity:</span>
      <div className="flex items-center gap-1">
        {SPECIAL_ACTIVITY_TYPES.map((type) => {
          const isSelected = selectedTypes.has(type);
          const colors = ACTIVITY_COLOR_MAP[type] || DEFAULT_COLOR;

          return (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              className={`
                px-2 py-0.5 text-xs font-medium rounded border transition-all
                ${isSelected
                  ? `${colors.selectedBg} ${colors.border} text-gray-900`
                  : `${colors.bg} ${colors.border} text-gray-600 opacity-60 hover:opacity-100`
                }
              `}
              title={`${isSelected ? 'Hide' : 'Show'} ${type}`}
            >
              {type}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1 ml-2 border-l border-gray-200 pl-2">
        <button
          onClick={onSelectAll}
          disabled={allSelected}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            allSelected
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-blue-600 hover:bg-blue-50'
          }`}
        >
          All
        </button>
        <button
          onClick={onClearAll}
          disabled={noneSelected}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            noneSelected
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-blue-600 hover:bg-blue-50'
          }`}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
