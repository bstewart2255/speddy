'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../ui/button';

interface CloseCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  studentName: string;
}

export function CloseCaseModal({
  isOpen,
  onClose,
  onConfirm,
  studentName,
}: CloseCaseModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => {
    if (!isProcessing) {
      onClose();
    }
  }, [onClose, isProcessing]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, handleClose]);

  // Auto-focus cancel button when modal opens
  useEffect(() => {
    if (isOpen && cancelButtonRef.current) {
      cancelButtonRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-case-title"
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 id="close-case-title" className="text-xl font-bold text-gray-900 mb-2">
            Close Referral
          </h2>
          <p className="text-gray-600">
            Are you sure you want to close <strong>{studentName}</strong>&apos;s referral?
          </p>
        </div>

        <div className="bg-gray-50 border-l-4 border-gray-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-700 font-medium">Note</p>
              <p className="text-sm text-gray-700 mt-1">
                The referral will be moved to the Closed tab. You can view closed referrals but cannot reopen them.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            ref={cancelButtonRef}
            onClick={handleClose}
            variant="secondary"
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            variant="primary"
            disabled={isProcessing}
            className="bg-gray-600 hover:bg-gray-700 focus:ring-gray-500"
          >
            {isProcessing ? 'Closing...' : 'Close Referral'}
          </Button>
        </div>
      </div>
    </div>
  );
}
