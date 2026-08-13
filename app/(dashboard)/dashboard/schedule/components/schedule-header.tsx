'use client';

import React from 'react';
import { ScheduleSessions } from '../../../../components/schedule/schedule-sessions';
import { UndoSchedule } from '../../../../components/schedule/undo-schedule';

interface ScheduleHeaderProps {
  unscheduledCount: number;
  unscheduledPanelCount: number;
  currentSchool: {
    school_site: string;
    school_district: string;
  } | null;
  onScheduleComplete: () => void;
  /** SPE-478: shown only for providers with a linked classroom (the SDC dual-role marker). */
  showMainstreamingButton?: boolean;
  onAddMainstreamingBlock?: () => void;
}

export function ScheduleHeader({
  unscheduledCount,
  unscheduledPanelCount,
  currentSchool,
  onScheduleComplete,
  showMainstreamingButton = false,
  onAddMainstreamingBlock
}: ScheduleHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Main Schedule
          </h1>
          <p className="text-gray-600">
            This schedule is the base schedule for the platform.
          </p>
        </div>
        <div className="flex gap-3">
          {showMainstreamingButton && (
            <button
              onClick={onAddMainstreamingBlock}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-medium"
            >
              Add Mainstreaming Block
            </button>
          )}
          <ScheduleSessions
            onComplete={onScheduleComplete}
            currentSchool={currentSchool}
            unscheduledCount={unscheduledCount}
            unscheduledPanelCount={unscheduledPanelCount}
          />
          <UndoSchedule onComplete={onScheduleComplete} />
        </div>
      </div>

      {unscheduledCount > 0 && (
        <UnscheduledSessionsAlert count={unscheduledCount} />
      )}
    </div>
  );
}

function UnscheduledSessionsAlert({ count }: { count: number }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center">
        <svg
          className="h-5 w-5 text-amber-400 mr-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">
            {count} session{count !== 1 ? 's' : ''} need{count === 1 ? 's' : ''} to be scheduled
          </p>
          <p className="text-sm text-amber-700">
            Click &quot;Auto-Schedule Sessions&quot; above to add these sessions to your calendar, or drag-and-drop them from the &quot;Unscheduled Sessions&quot; section below.
          </p>
        </div>
      </div>
    </div>
  );
}