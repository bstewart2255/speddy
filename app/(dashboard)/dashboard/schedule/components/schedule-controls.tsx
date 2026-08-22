'use client';

import React from 'react';
import { formatTime } from '@/lib/utils/time-options';
import type { SessionFilterAvailability } from '../utils/session-filter-availability';
import { formatGradeShort } from '@/lib/utils/grade-level';
import { GRADE_LEGEND_COLOR_MAP } from '@/lib/scheduling/constants';

interface SeaProfile {
  id: string;
  full_name: string;
}

interface SpecialistProfile {
  id: string;
  full_name: string;
  role: string;
}

interface ScheduleControlsProps {
  sessionFilter: 'all' | 'mine' | 'sea' | 'specialist' | 'assigned';
  /** The active school's own grades, in grade order (SPE-587). */
  availableGrades: string[];
  selectedGrades: Set<string>;
  selectedTimeSlot: string | null;
  selectedDay: number | null;
  highlightedStudentId: string | null;
  onSessionFilterChange: (filter: 'all' | 'mine' | 'sea' | 'specialist' | 'assigned') => void;
  /**
   * SPE-589: which sharing filters this provider has any use for. Nothing on
   * offer means no "View Sessions" card at all — Grade Levels then takes the
   * full row on its own.
   */
  filterAvailability: SessionFilterAvailability;
  onGradeToggle: (grade: string) => void;
  onTimeSlotClear: () => void;
  onDayClear: () => void;
  onHighlightClear: () => void;
  // New props for person filtering
  seaProfiles?: SeaProfile[];
  otherSpecialists?: SpecialistProfile[];
  selectedSeaId: string | null;
  selectedSpecialistId: string | null;
  onSeaSelect: (seaId: string | null) => void;
  onSpecialistSelect: (specialistId: string | null) => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function ScheduleControls({
  sessionFilter,
  availableGrades,
  selectedGrades,
  selectedTimeSlot,
  selectedDay,
  highlightedStudentId,
  onSessionFilterChange,
  filterAvailability,
  onGradeToggle,
  onTimeSlotClear,
  onDayClear,
  onHighlightClear,
  seaProfiles = [],
  otherSpecialists = [],
  selectedSeaId,
  selectedSpecialistId,
  onSeaSelect,
  onSpecialistSelect,
}: ScheduleControlsProps) {
  return (
    <>
      {/* Session Filter and Grade Level Filter - Side by Side */}
      <div className="mb-4 flex flex-col lg:flex-row gap-4">
        {/* View Sessions - Left Side. SPE-589: only for providers who share
            work. With no SEA at the site and nothing delegated either way, every
            button here led to the same grid, so the whole card is dropped and
            Grade Levels (flex-1) takes the row. */}
        {filterAvailability.showCard && (
        <div className="bg-white rounded-lg shadow-sm p-4 flex-shrink-0">
          <h3 className="text-sm font-medium text-gray-700 mb-3">View Sessions</h3>
          <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
            <FilterButton
              active={sessionFilter === 'all'}
              onClick={() => onSessionFilterChange('all')}
              compact
            >
              All Sessions
            </FilterButton>
            <FilterButton
              active={sessionFilter === 'mine'}
              onClick={() => onSessionFilterChange('mine')}
              compact
            >
              My Sessions
            </FilterButton>
            {filterAvailability.sea && (
              <div className="relative">
                <FilterButton
                  active={sessionFilter === 'sea'}
                  onClick={() => onSessionFilterChange('sea')}
                  compact
                >
                  SEA Sessions
                </FilterButton>
                {sessionFilter === 'sea' && seaProfiles.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 z-10">
                    <select
                      value={selectedSeaId || ''}
                      onChange={(e) => onSeaSelect(e.target.value || null)}
                      className="text-xs px-2 py-1 border border-gray-300 rounded-md bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[120px]"
                    >
                      <option value="">All SEAs</option>
                      {seaProfiles.map((sea) => (
                        <option key={sea.id} value={sea.id}>
                          {sea.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            {filterAvailability.specialist && (
              <div className="relative">
                <FilterButton
                  active={sessionFilter === 'specialist'}
                  onClick={() => onSessionFilterChange('specialist')}
                  compact
                >
                  Specialist Sessions
                </FilterButton>
                {sessionFilter === 'specialist' && otherSpecialists.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 z-10">
                    <select
                      value={selectedSpecialistId || ''}
                      onChange={(e) => onSpecialistSelect(e.target.value || null)}
                      className="text-xs px-2 py-1 border border-gray-300 rounded-md bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[120px]"
                    >
                      <option value="">All Specialists</option>
                      {otherSpecialists.map((specialist) => (
                        <option key={specialist.id} value={specialist.id}>
                          {specialist.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            {filterAvailability.assigned && (
              <FilterButton
                active={sessionFilter === 'assigned'}
                onClick={() => onSessionFilterChange('assigned')}
                compact
              >
                Assigned Sessions
              </FilterButton>
            )}
          </div>
        </div>
        )}

        {/* Grade Levels - Right Side */}
        <div className="bg-white rounded-lg shadow-sm p-4 flex-1">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Grade Levels</h3>
          <div className="flex flex-wrap gap-3">
            {availableGrades.map((grade) => {
              const isActive = selectedGrades.has(grade);
              return (
                <button
                  key={grade}
                  onClick={() => onGradeToggle(grade)}
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <div
                    className={`w-4 h-4 rounded ${
                      isActive
                        ? GRADE_LEGEND_COLOR_MAP[grade] || 'bg-gray-400'
                        : 'bg-gray-300'
                    }`}
                  />
                  <span
                    className={`text-sm ${
                      isActive ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    {formatGradeShort(grade)}
                  </span>
                </button>
              );
            })}
          </div>
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
  compact = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'} rounded-md transition-colors ${
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
