'use client';

import React from 'react';

interface DailyTimeMarkerProps {
  time: string;           // "07:57" format
  label: string;          // "Start", "Dismissal", etc.
  color: 'blue' | 'orange';
  pixelPosition: number;  // top position in pixels
  gradeLevel?: string;    // "TK,K" or "1,2,3,4,5" etc.
  onClick?: () => void;   // Called when marker is clicked
}

// Format time for display (24h to 12h)
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Format grade level for display
function formatGradeLevel(gradeLevel?: string): string {
  if (!gradeLevel) return '';
  const grades = gradeLevel.split(',').map(g => g.trim());
  // If all grades, don't show anything
  if (grades.length >= 7) return '';
  // Compact display
  return ` (${grades.join('/')})`;
}

export function DailyTimeMarker({ time, label, color, pixelPosition, gradeLevel, onClick }: DailyTimeMarkerProps) {
  const colorClasses = color === 'blue'
    ? 'border-blue-400 bg-blue-50 text-blue-700'
    : 'border-orange-400 bg-orange-50 text-orange-700';

  const lineColor = color === 'blue' ? 'border-blue-400' : 'border-orange-400';
  const gradeDisplay = formatGradeLevel(gradeLevel);

  return (
    <div
      className="absolute left-0 right-0 z-10 group cursor-pointer"
      style={{ top: pixelPosition }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Dashed line - clickable area with padding */}
      <div className={`absolute left-0 right-0 border-t-2 border-dashed ${lineColor} opacity-60 group-hover:opacity-100`} />

      {/* Invisible hover target for easier clicking */}
      <div className="absolute left-0 right-0 -top-2 h-4" />

      {/* Label pill - hidden by default, shown on hover */}
      <div
        className={`absolute left-1 -top-2.5 px-1.5 py-0.5 text-[10px] font-medium rounded border ${colorClasses} whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity`}
      >
        {formatTime(time)} - {label}{gradeDisplay}
      </div>
    </div>
  );
}
