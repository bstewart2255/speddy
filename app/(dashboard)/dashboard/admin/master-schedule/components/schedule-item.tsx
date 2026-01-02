'use client';

import React from 'react';

interface ScheduleItemProps {
  type: 'bell' | 'activity';
  label: string;
  sublabel?: string;
  top: number;
  height: number;
  colorClass: string;
  onClick?: () => void;
  // For handling overlapping items
  overlapIndex?: number;
  overlapTotal?: number;
}

export function ScheduleItem({
  type,
  label,
  sublabel,
  top,
  height,
  colorClass,
  onClick,
  overlapIndex = 0,
  overlapTotal = 1
}: ScheduleItemProps) {
  const minHeight = 20;
  const displayHeight = Math.max(height, minHeight);
  const isCompact = height < 40;

  // Calculate horizontal position for overlapping items
  const widthPercent = overlapTotal > 1 ? 100 / overlapTotal : 100;
  const leftPercent = overlapIndex * widthPercent;

  return (
    <div
      className={`absolute rounded border-l-4 px-1 py-0.5 cursor-pointer transition-all hover:shadow-md hover:z-10 overflow-hidden ${colorClass}`}
      style={{
        top,
        height: displayHeight,
        left: overlapTotal > 1 ? `calc(${leftPercent}% + 2px)` : '4px',
        width: overlapTotal > 1 ? `calc(${widthPercent}% - 4px)` : 'calc(100% - 8px)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {isCompact ? (
        <div className="flex items-center gap-1 text-xs truncate">
          <span className="font-medium truncate">{label}</span>
          {sublabel && <span className="text-gray-600 truncate">({sublabel})</span>}
        </div>
      ) : (
        <>
          <div className="text-xs font-medium truncate">{label}</div>
          {sublabel && (
            <div className="text-xs text-gray-600 truncate">{sublabel}</div>
          )}
        </>
      )}
    </div>
  );
}
