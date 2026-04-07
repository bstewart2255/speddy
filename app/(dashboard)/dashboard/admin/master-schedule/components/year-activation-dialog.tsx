'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/app/components/ui/dialog';

interface YearActivationDialogProps {
  open: boolean;
  onClose: () => void;
  onActivateWithCopy: () => Promise<void>;
  onActivateBlank: () => Promise<void>;
  currentYear: string;
  nextYear: string;
  loading: boolean;
}

export function YearActivationDialog({
  open,
  onClose,
  onActivateWithCopy,
  onActivateBlank,
  currentYear,
  nextYear,
  loading,
}: YearActivationDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Reset to step 1 when dialog opens
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !loading) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === 1
              ? 'Are you ready to start the upcoming year?'
              : 'Do you want to copy over all the items from this current year?'}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? `This will activate the ${nextYear} school year for scheduling.`
              : `Copying will bring over all bell schedules, special activities, and rotation groups from ${currentYear}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                Yes
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onActivateBlank}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {loading ? 'Activating...' : 'No'}
              </button>
              <button
                type="button"
                onClick={onActivateWithCopy}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Copying...' : 'Yes'}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
