'use client';

import React from 'react';

interface RotationScheduleItemProps {
  activityA: string;
  activityB: string;
  teacherName: string;
  top: number;
  height: number;
  onClick?: () => void;
  overlapIndex?: number;
  overlapTotal?: number;
}

// Activity type to color map (matching existing pattern)
const ACTIVITY_COLORS: Record<string, { bg: string; border: string }> = {
  Library: { bg: '#BFDBFE', border: '#60A5FA' },
  STEAM: { bg: '#FED7AA', border: '#FB923C' },
  STEM: { bg: '#99F6E4', border: '#2DD4BF' },
  Garden: { bg: '#D9F99D', border: '#84CC16' },
  Music: { bg: '#DDD6FE', border: '#A78BFA' },
  ART: { bg: '#F5D0FE', border: '#E879F9' },
  PE: { bg: '#FECACA', border: '#F87171' },
};

const DEFAULT_COLOR = { bg: '#E5E7EB', border: '#9CA3AF' };

function getActivityColor(activityType: string): { bg: string; border: string } {
  return ACTIVITY_COLORS[activityType] || DEFAULT_COLOR;
}

export function RotationScheduleItem({
  activityA,
  activityB,
  teacherName,
  top,
  height,
  onClick,
  overlapIndex = 0,
  overlapTotal = 1,
}: RotationScheduleItemProps) {
  const minHeight = 20;
  const displayHeight = Math.max(height, minHeight);
  const isCompact = height < 40;

  const colorA = getActivityColor(activityA);
  const colorB = getActivityColor(activityB);

  // Calculate horizontal position for overlapping items
  const widthPercent = overlapTotal > 1 ? 100 / overlapTotal : 100;
  const leftPercent = overlapIndex * widthPercent;

  return (
    <div
      className="absolute rounded overflow-hidden cursor-pointer transition-all hover:shadow-md hover:z-10"
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
      {/* Split color background */}
      <div className="absolute inset-0 flex">
        <div
          className="w-1/2 h-full"
          style={{ backgroundColor: colorA.bg }}
        />
        <div
          className="w-1/2 h-full"
          style={{ backgroundColor: colorB.bg }}
        />
      </div>

      {/* Split border on left side */}
      <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col">
        <div
          className="flex-1"
          style={{ backgroundColor: colorA.border }}
        />
        <div
          className="flex-1"
          style={{ backgroundColor: colorB.border }}
        />
      </div>

      {/* Content */}
      <div className="relative px-2 py-0.5 h-full flex flex-col justify-center">
        {isCompact ? (
          <div className="flex items-center gap-1 text-xs truncate">
            <span className="font-medium truncate">
              {activityA}/{activityB}
            </span>
            <span className="text-gray-600 truncate">({teacherName})</span>
          </div>
        ) : (
          <>
            <div className="text-xs font-medium truncate flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                style={{ backgroundColor: colorA.border }}
              />
              <span>{activityA}</span>
              <span className="text-gray-500">/</span>
              <span
                className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                style={{ backgroundColor: colorB.border }}
              />
              <span>{activityB}</span>
            </div>
            <div className="text-xs text-gray-600 truncate">
              {teacherName}
            </div>
          </>
        )}
      </div>

      {/* Rotation indicator icon */}
      <div className="absolute top-0.5 right-0.5">
        <svg
          className="w-3 h-3 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </div>
    </div>
  );
}
