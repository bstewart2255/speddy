'use client';

import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ManualPlacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  unplacedCount: number;
  onPlaceAnyway: () => Promise<void>;
  onKeepUnscheduled: () => void;
  isPlacing?: boolean;
}

export function ManualPlacementModal({
  isOpen,
  onClose,
  unplacedCount,
  onPlaceAnyway,
  onKeepUnscheduled,
  isPlacing = false
}: ManualPlacementModalProps) {
  const handlePlaceAnyway = async () => {
    await onPlaceAnyway();
    // onClose is handled by the parent component after successful placement
  };

  const handleKeepUnscheduled = () => {
    onKeepUnscheduled();
    // onClose is handled by the parent component
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Scheduling Conflict Detected"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-gray-700">
              There isn't enough space to fit <span className="font-semibold">{unplacedCount} session{unplacedCount > 1 ? 's' : ''}</span>. 
            </p>
            <p className="text-gray-600 mt-2">
              Should they be put on the calendar anyway so you can adjust manually?
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Note:</span> Placing sessions anyway may create scheduling conflicts that you'll need to resolve manually.
          </p>
        </div>

        <div className="flex gap-3 justify-end mt-2">
          <Button
            variant="secondary"
            onClick={handleKeepUnscheduled}
            disabled={isPlacing}
          >
            Keep Unscheduled
          </Button>
          <Button
            variant="primary"
            onClick={handlePlaceAnyway}
            disabled={isPlacing}
          >
            {isPlacing ? 'Placing...' : 'Place Anyway'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}