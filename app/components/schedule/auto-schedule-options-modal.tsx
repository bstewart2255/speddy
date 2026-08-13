'use client';

import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import {
  SCHEDULING_STRATEGY_OPTIONS,
  summarizeGroupability,
  type GroupableStudent,
  type GroupabilitySummary,
  type SchedulingStrategy,
} from '../../../lib/scheduling/scheduling-strategy';

/**
 * What a grouping option can actually do with this caseload, in plain words
 * (SPE-482). Returns null when there is nothing worth saying.
 *
 * The case this exists for: a provider picks "Group by teacher", none of their
 * students have a teacher recorded, and the run silently produces a balanced
 * schedule with no explanation. Telling them BEFORE the run costs nothing and
 * points at the fix, which is their data rather than the option.
 */
function groupabilityNote(
  summary: GroupabilitySummary | null,
  noun: string | null
): { text: string; tone: 'warning' | 'info' } | null {
  if (!summary || !noun || summary.total === 0) return null;

  // Deliberately phrased in terms of grouping outcomes, never as "identical to
  // Balanced". That equivalence isn't true: a student with a key the strategy
  // recognises — even a unique one nobody shares — still takes the grouping
  // capacity ladder, which opens at the full group ceiling rather than
  // Balanced's conservative first pass. What the provider needs to know is
  // whether anyone gets grouped, which is exactly what these say.
  if (summary.withKey === 0) {
    return {
      tone: 'warning',
      text: `None of your ${summary.total} students here have a ${noun} recorded, so this option can't group anyone. Add ${noun}s on the Students page to use it.`,
    };
  }
  if (summary.groupable === 0) {
    return {
      tone: 'warning',
      text: `No two students here share a ${noun}, so there is no one to group.`,
    };
  }
  if (summary.groupable < summary.total) {
    return {
      tone: 'info',
      text: `${summary.groupable} of ${summary.total} students share a ${noun} with someone. The others have no one to group with.`,
    };
  }
  return {
    tone: 'info',
    text: `All ${summary.total} students share a ${noun} with someone.`,
  };
}

interface AutoScheduleOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * How many sessions this run will try to place, from the authoritative
   * school-scoped count of unscheduled templates. May be 0 while the button is
   * still enabled — the schedule page also enables on its unscheduled-panel
   * count, which is the same rows counted client-side and can include dated
   * instances the authoritative query deliberately excludes. The two must never
   * be summed; they count the same work.
   */
  sessionCount: number;
  strategy: SchedulingStrategy;
  onStrategyChange: (strategy: SchedulingStrategy) => void;
  onConfirm: () => void;
  /**
   * The caseload at the current school, used only to tell the provider how much
   * each grouping option can act on. Optional: with none passed, the picker
   * simply shows no coverage note.
   */
  students?: readonly GroupableStudent[];
}

/**
 * Strategy picker shown when the provider clicks Auto-Schedule (SPE-473).
 *
 * Replaces the native `confirm()` this flow used to open: it keeps the same
 * "this will schedule N sessions, continue?" checkpoint before a bulk write,
 * and adds room to explain what each strategy actually does — which a provider
 * can't be expected to infer from a four-word label.
 */
export function AutoScheduleOptionsModal({
  isOpen,
  onClose,
  sessionCount,
  strategy,
  onStrategyChange,
  onConfirm,
  students = [],
}: AutoScheduleOptionsModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Auto-Schedule Sessions"
      description={
        sessionCount > 0
          ? `This will schedule ${sessionCount} session${sessionCount !== 1 ? 's' : ''} that ${sessionCount === 1 ? 'has' : 'have'} never been scheduled before.`
          : 'This will schedule any sessions that have never been scheduled before.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Schedule Sessions
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="text-sm font-medium text-gray-900">
          How should sessions be arranged?
        </legend>
        <p className="mt-1 text-sm text-gray-600">
          Every option respects bell schedules, special activities and your work
          days. This only changes which open times are preferred.
        </p>

        <div className="mt-4 space-y-2">
          {SCHEDULING_STRATEGY_OPTIONS.map((option) => {
            const isSelected = option.value === strategy;
            // Shown on every grouping option, not just the selected one, so the
            // coverage is visible while choosing rather than after.
            const note = groupabilityNote(
              summarizeGroupability(students, option.value),
              option.groupingNoun
            );
            return (
              <label
                key={option.value}
                htmlFor={`auto-schedule-strategy-${option.value}`}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  id={`auto-schedule-strategy-${option.value}`}
                  name="auto-schedule-strategy"
                  value={option.value}
                  checked={isSelected}
                  onChange={() => onStrategyChange(option.value)}
                  className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-600">
                    {option.description}
                  </span>
                  {note && (
                    <span
                      data-testid={`strategy-coverage-${option.value}`}
                      className={`mt-1.5 block text-sm ${
                        note.tone === 'warning'
                          ? 'font-medium text-amber-700'
                          : 'text-gray-500'
                      }`}
                    >
                      {note.tone === 'warning' && (
                        <span aria-hidden="true" className="mr-1">
                          ⚠
                        </span>
                      )}
                      {note.text}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </Modal>
  );
}
