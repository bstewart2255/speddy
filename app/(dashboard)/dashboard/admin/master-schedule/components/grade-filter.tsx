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
  TK: { bg: 'bg-slate-50', border: 'border-slate-200', selectedBg: 'bg-slate-100' },
  K: { bg: 'bg-slate-50', border: 'border-slate-300', selectedBg: 'bg-slate-200' },
  '1': { bg: 'bg-slate-100', border: 'border-slate-400', selectedBg: 'bg-slate-300' },
  '2': { bg: 'bg-slate-200', border: 'border-slate-400', selectedBg: 'bg-slate-300' },
  '3': { bg: 'bg-slate-200', border: 'border-slate-500', selectedBg: 'bg-slate-400' },
  '4': { bg: 'bg-slate-300', border: 'border-slate-500', selectedBg: 'bg-slate-400' },
  '5': { bg: 'bg-slate-300', border: 'border-slate-600', selectedBg: 'bg-slate-500' },
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
    <div className="flex items-center gap-2 bg-gray-200 rounded-full px-3 py-1.5">
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
