'use client';

import React from 'react';

interface ScheduleControlsProps {
  sessionFilter: 'all' | 'mine' | 'sea';
  selectedGrades: Set<string>;
  selectedTimeSlot: string | null;
  selectedDay: number | null;
  highlightedStudentId: string | null;
  showSchoolHours: boolean;
  onSessionFilterChange: (filter: 'all' | 'mine' | 'sea') => void;
  onGradeToggle: (grade: string) => void;
  onTimeSlotClear: () => void;
  onDayClear: () => void;
  onHighlightClear: () => void;
  onSchoolHoursToggle: (show: boolean) => void;
}

const GRADE_COLORS = [
  { grade: 'K', colorClass: 'bg-purple-400', displayName: 'K' },
  { grade: '1', colorClass: 'bg-sky-400', displayName: '1st' },
  { grade: '2', colorClass: 'bg-cyan-400', displayName: '2nd' },
  { grade: '3', colorClass: 'bg-emerald-400', displayName: '3rd' },
  { grade: '4', colorClass: 'bg-amber-400', displayName: '4th' },
  { grade: '5', colorClass: 'bg-rose-400', displayName: '5th' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function ScheduleControls({
  sessionFilter,
  selectedGrades,
  selectedTimeSlot,
  selectedDay,
  highlightedStudentId,
  showSchoolHours,
  onSessionFilterChange,
  onGradeToggle,
  onTimeSlotClear,
  onDayClear,
  onHighlightClear,
  onSchoolHoursToggle,
}: ScheduleControlsProps) {
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <>
      {/* Session Filter */}
      <div className="mb-4 bg-white rounded-lg shadow-sm p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">View Sessions</h3>
        <div className="flex gap-2">
          <FilterButton
            active={sessionFilter === 'all'}
            onClick={() => onSessionFilterChange('all')}
          >
            All Sessions
          </FilterButton>
          <FilterButton
            active={sessionFilter === 'mine'}
            onClick={() => onSessionFilterChange('mine')}
          >
            My Sessions
          </FilterButton>
          <FilterButton
            active={sessionFilter === 'sea'}
            onClick={() => onSessionFilterChange('sea')}
          >
            SEA Sessions
          </FilterButton>
        </div>
      </div>

      {/* Grade Level Filter */}
      <div className="mb-6 bg-white rounded-lg shadow-sm p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium text-gray-700">Grade Levels</h3>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showSchoolHours}
              onChange={(e) => onSchoolHoursToggle(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Show school hours
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          {GRADE_COLORS.map(({ grade, colorClass, displayName }) => {
            const isActive = selectedGrades.has(grade);
            return (
              <button
                key={grade}
                onClick={() => onGradeToggle(grade)}
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div
                  className={`w-4 h-4 rounded ${
                    isActive ? colorClass : 'bg-gray-300'
                  }`}
                />
                <span
                  className={`text-sm ${
                    isActive ? 'text-gray-600' : 'text-gray-400'
                  }`}
                >
                  {displayName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Filters */}
      {(selectedTimeSlot || selectedDay) && (
        <div className="mb-4 flex gap-2 items-center flex-wrap">
          <span className="text-sm text-gray-600">Active filters:</span>
          {selectedTimeSlot && (
            <FilterTag onClear={onTimeSlotClear}>
              Time: {formatTime(selectedTimeSlot)}
            </FilterTag>
          )}
          {selectedDay && (
            <FilterTag onClear={onDayClear}>
              Day: {DAYS[selectedDay - 1]}
            </FilterTag>
          )}
        </div>
      )}

      {/* Highlighted Student */}
      {highlightedStudentId && (
        <HighlightedStudentAlert onClear={onHighlightClear} />
      )}
    </>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-sm rounded-md transition-colors ${
        active
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function FilterTag({
  onClear,
  children,
}: {
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm flex items-center gap-2">
      <span>{children}</span>
      <button onClick={onClear} className="hover:text-blue-900">
        ×
      </button>
    </div>
  );
}

function HighlightedStudentAlert({ onClear }: { onClear: () => void }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <svg
            className="h-5 w-5 text-blue-400 mr-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm font-medium text-blue-800">
            Highlighting student sessions
          </p>
        </div>
        <button
          onClick={onClear}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          Clear highlight
        </button>
      </div>
    </div>
  );
}