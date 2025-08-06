import React from "react";

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
}

export function Progress({
  value,
  max = 100,
  className = "",
  showLabel = false,
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={`relative ${className}`}>
      <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
        <div
          style={{ width: `${percentage}%` }}
          className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600 transition-all duration-300"
        />
      </div>
      {showLabel && (
        <span className="text-sm text-gray-600 mt-1 block">
          {percentage.toFixed(0)}%
        </span>
      )}
    </div>
  );
}