'use client';

import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import {
  SCHEDULING_STRATEGY_OPTIONS,
  type SchedulingStrategy,
} from '../../../lib/scheduling/scheduling-strategy';

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
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </Modal>
  );
}
