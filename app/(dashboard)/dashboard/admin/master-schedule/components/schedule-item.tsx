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
}

export function ScheduleItem({
  type,
  label,
  sublabel,
  top,
  height,
  colorClass,
  onClick
}: ScheduleItemProps) {
  const minHeight = 20;
  const displayHeight = Math.max(height, minHeight);
  const isCompact = height < 40;

  return (
    <div
      className={`absolute left-1 right-1 rounded border-l-4 px-2 py-1 cursor-pointer transition-all hover:shadow-md overflow-hidden ${colorClass}`}
      style={{ top, height: displayHeight }}
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
