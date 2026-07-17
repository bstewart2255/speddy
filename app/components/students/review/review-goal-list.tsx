'use client';

import type { ReviewRow } from '@/lib/import/review-model';
import { ReviewSignalIcon } from './review-signal';

/**
 * Per-goal detail shown when a row's goal count is expanded (SPE-227): verbatim
 * goal text with checkboxes, "added" markers on new goals, and struck-through
 * lines for goals an update will remove.
 */
interface ReviewGoalListProps {
  row: ReviewRow;
  goalsSelected: Set<number>;
  /** Goal indices whose target date is already past — unchecked by default (SPE-267). */
  pastDatedGoals: Set<number>;
  onToggleGoal: (goalIndex: number) => void;
  onToggleAllGoals: () => void;
}

export function ReviewGoalList({ row, goalsSelected, pastDatedGoals, onToggleGoal, onToggleAllGoals }: ReviewGoalListProps) {
  const hasGoals = row.goals.length > 0;
  const allSelected = hasGoals && goalsSelected.size === row.goals.length;

  return (
    <div className="space-y-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3">
      {hasGoals && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-700">IEP goals</p>
          <button
            type="button"
            onClick={onToggleAllGoals}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
      )}

      {row.goals.map((goal, i) => {
        const selected = goalsSelected.has(i);
        return (
          <label
            key={i}
            className={`flex items-start gap-2 rounded border p-2 text-sm ${
              selected ? 'border-blue-200 bg-white' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleGoal(i)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
            />
            <span className="flex-1 text-gray-900">{goal.text}</span>
            {pastDatedGoals.has(i) && (
              <span
                className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700"
                title="This goal's target date has already passed. Left unchecked by default — check it to import anyway."
              >
                past date
              </span>
            )}
            {goal.status === 'added' && row.action === 'update' && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">
                <ReviewSignalIcon signal="confident" className="h-3 w-3" decorative /> added
              </span>
            )}
          </label>
        );
      })}

      {row.goalsRemoved.map((goal, i) => (
        <div key={`removed-${i}`} className="flex items-start gap-2 px-2 text-sm text-gray-400">
          <ReviewSignalIcon signal="removed" className="mt-0.5" decorative />
          <span className="flex-1 line-through">{goal}</span>
          <span className="shrink-0 text-xs">removed</span>
        </div>
      ))}

      {!hasGoals && row.goalsRemoved.length === 0 && (
        <p className="text-sm text-gray-400 italic">No IEP goals in this import.</p>
      )}
    </div>
  );
}
