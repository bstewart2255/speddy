'use client';

import React from 'react';

export const ZONE_OTHER = '__other__';

interface ZoneFilterProps {
  selectedZones: Set<string>;
  availableZones: string[];
  hasUnzoned: boolean;
  onToggleZone: (zone: string) => void;
  onClearAll: () => void;
  onSelectAll: () => void;
}

export function ZoneFilter({
  selectedZones,
  availableZones,
  hasUnzoned,
  onToggleZone,
  onClearAll,
  onSelectAll,
}: ZoneFilterProps) {
  // Total count includes "Other" if there are unzoned assignments
  const totalCount = availableZones.length + (hasUnzoned ? 1 : 0);
  const allSelected = selectedZones.size === totalCount;
  const noneSelected = selectedZones.size === 0;

  if (totalCount === 0) return null;

  return (
    <div className="flex items-center gap-2 bg-gray-200 rounded-full px-3 py-1.5">
      <span className="text-xs font-medium text-gray-700">Zone:</span>
      <div className="flex items-center gap-1 flex-wrap">
        {availableZones.map((zone) => {
          const isSelected = selectedZones.has(zone);

          return (
            <button
              key={zone}
              onClick={() => onToggleZone(zone)}
              aria-pressed={isSelected}
              className={`
                px-2 py-0.5 text-xs font-medium rounded transition-all
                ${isSelected
                  ? 'bg-amber-200 border-2 border-gray-900 text-gray-900'
                  : 'bg-amber-50 border border-amber-300 text-gray-600 opacity-60 hover:opacity-100'
                }
              `}
              title={`${isSelected ? 'Hide' : 'Show'} zone: ${zone}`}
            >
              {zone}
            </button>
          );
        })}
        {hasUnzoned && (
          <button
            onClick={() => onToggleZone(ZONE_OTHER)}
            aria-pressed={selectedZones.has(ZONE_OTHER)}
            className={`
              px-2 py-0.5 text-xs font-medium rounded italic transition-all
              ${selectedZones.has(ZONE_OTHER)
                ? 'bg-amber-200 border-2 border-gray-900 text-gray-900'
                : 'bg-amber-50 border border-amber-300 text-gray-600 opacity-60 hover:opacity-100'
              }
            `}
            title={`${selectedZones.has(ZONE_OTHER) ? 'Hide' : 'Show'} assignments without a zone`}
          >
            Other
          </button>
        )}
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
