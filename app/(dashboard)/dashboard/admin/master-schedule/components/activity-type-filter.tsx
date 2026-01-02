'use client';

import React from 'react';
import { SPECIAL_ACTIVITY_TYPES } from '../../../../../../lib/constants/activity-types';

interface ActivityTypeFilterProps {
  selectedTypes: Set<string>;
  onToggleType: (type: string) => void;
  onClearAll: () => void;
  onSelectAll: () => void;
}

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

          return (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              className={`
                px-2 py-0.5 text-xs font-medium rounded border transition-all
                ${isSelected
                  ? 'bg-indigo-200 border-indigo-400 text-gray-900'
                  : 'bg-indigo-50 border-indigo-300 text-gray-600 opacity-60 hover:opacity-100'
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
