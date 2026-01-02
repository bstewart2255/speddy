'use client';

import React from 'react';

interface GradeFilterProps {
  selectedGrades: Set<string>;
  onToggleGrade: (grade: string) => void;
  onClearAll: () => void;
  onSelectAll: () => void;
}

const GRADES = ['TK', 'K', '1', '2', '3', '4', '5'];

const GRADE_COLOR_MAP: Record<string, { bg: string; border: string; selectedBg: string }> = {
  TK: { bg: 'bg-pink-50', border: 'border-pink-300', selectedBg: 'bg-pink-200' },
  K: { bg: 'bg-purple-50', border: 'border-purple-300', selectedBg: 'bg-purple-200' },
  '1': { bg: 'bg-sky-50', border: 'border-sky-300', selectedBg: 'bg-sky-200' },
  '2': { bg: 'bg-cyan-50', border: 'border-cyan-300', selectedBg: 'bg-cyan-200' },
  '3': { bg: 'bg-emerald-50', border: 'border-emerald-300', selectedBg: 'bg-emerald-200' },
  '4': { bg: 'bg-amber-50', border: 'border-amber-300', selectedBg: 'bg-amber-200' },
  '5': { bg: 'bg-rose-50', border: 'border-rose-300', selectedBg: 'bg-rose-200' },
};

export function GradeFilter({
  selectedGrades,
  onToggleGrade,
  onClearAll,
  onSelectAll
}: GradeFilterProps) {
  const allSelected = selectedGrades.size === GRADES.length;
  const noneSelected = selectedGrades.size === 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-700">Grade:</span>
      <div className="flex items-center gap-1">
        {GRADES.map((grade) => {
          const isSelected = selectedGrades.has(grade);
          const colors = GRADE_COLOR_MAP[grade];

          return (
            <button
              key={grade}
              onClick={() => onToggleGrade(grade)}
              className={`
                px-2 py-0.5 text-xs font-medium rounded border transition-all
                ${isSelected
                  ? `${colors.selectedBg} ${colors.border} text-gray-900`
                  : `${colors.bg} ${colors.border} text-gray-600 opacity-60 hover:opacity-100`
                }
              `}
              title={`${isSelected ? 'Hide' : 'Show'} grade ${grade}`}
            >
              {grade}
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
