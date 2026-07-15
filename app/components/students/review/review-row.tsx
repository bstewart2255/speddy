'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReviewRow as ReviewRowData } from '@/lib/import/review-model';
import { ReviewGoalList } from './review-goal-list';
import { ReviewSignalIcon } from './review-signal';
import type { ReviewSelection } from './use-review-selection';

const ACTION_BADGE: Record<ReviewRowData['action'], { label: string; className: string }> = {
  insert: { label: 'New', className: 'bg-green-100 text-green-800' },
  update: { label: 'Update', className: 'bg-blue-100 text-blue-800' },
  skip: { label: 'No changes', className: 'bg-gray-100 text-gray-600' },
};

interface ReviewRowProps {
  row: ReviewRowData;
  selection: ReviewSelection;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Total table columns, for the full-width expansion/warning rows. */
  columnCount: number;
}

export function ReviewRow({ row, selection, isExpanded, onToggleExpand, columnCount }: ReviewRowProps) {
  const isSkip = row.action === 'skip';
  const selected = selection.isRowSelected(row.id);
  const goalsSelected = selection.goalsSelectedFor(row.id);
  const badge = ACTION_BADGE[row.action];
  const goalCount = row.goals.length;
  const noGoalsSelected = selected && goalCount > 0 && goalsSelected.size === 0;

  return (
    <>
      <tr className={selected ? 'bg-blue-50/40' : isSkip ? 'text-gray-500' : undefined}>
        <td className="px-3 py-2 align-top">
          <input
            type="checkbox"
            checked={selected}
            disabled={isSkip}
            onChange={() => selection.toggleRow(row.id)}
            aria-label={`Select ${row.displayName}`}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 disabled:opacity-40"
          />
        </td>
        <td className="px-3 py-2 align-top text-sm font-medium text-gray-900">{row.displayName}</td>
        <td className="px-3 py-2 align-top">
          <input
            type="text"
            value={selection.initialsFor(row)}
            onChange={(e) => selection.setInitials(row.id, e.target.value)}
            maxLength={4}
            aria-label={`Initials for ${row.displayName}`}
            className="w-14 rounded border border-gray-300 px-2 py-1 text-sm font-medium uppercase"
          />
        </td>
        <td className="px-3 py-2 align-top text-sm tabular-nums text-gray-900">{row.gradeLevel}</td>
        <td className="px-3 py-2 align-top text-sm text-gray-900">
          {row.teacher ? (
            <span className="inline-flex items-center gap-1">
              <span className="truncate" title={row.teacher.teacherName ?? undefined}>
                {row.teacher.teacherName ?? 'Unknown'}
              </span>
              {row.teacher.signal === 'check' && (
                <ReviewSignalIcon signal="check" className="h-3.5 w-3.5" />
              )}
            </span>
          ) : (
            <span className="text-gray-400 italic">Not set</span>
          )}
        </td>
        <td className="px-3 py-2 align-top text-sm tabular-nums text-gray-900">
          {row.schedule ? (
            `${row.schedule.sessionsPerWeek}×/${row.schedule.minutesPerSession}min`
          ) : (
            <span className="text-gray-400 italic">Not set</span>
          )}
        </td>
        <td className="px-3 py-2 align-top text-sm">
          {goalCount > 0 ? (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={isExpanded}
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="tabular-nums">
                {goalsSelected.size}/{goalCount}
              </span>
              {noGoalsSelected && <ReviewSignalIcon signal="check" className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </td>
      </tr>

      {noGoalsSelected && (
        <tr>
          <td colSpan={columnCount} className="px-3 pb-2 text-xs text-amber-700">
            No goals selected — this student will be imported without any goals.
          </td>
        </tr>
      )}

      {isExpanded && (goalCount > 0 || row.goalsRemoved.length > 0) && (
        <tr>
          <td colSpan={columnCount} className="p-0">
            <ReviewGoalList
              row={row}
              goalsSelected={goalsSelected}
              onToggleGoal={(i) => selection.toggleGoal(row.id, i)}
              onToggleAllGoals={() => selection.toggleAllGoals(row)}
            />
          </td>
        </tr>
      )}
    </>
  );
}
