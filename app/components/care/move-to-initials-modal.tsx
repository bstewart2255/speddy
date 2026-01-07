'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../ui/button';

interface MoveToInitialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  studentName: string;
}

export function MoveToInitialsModal({
  isOpen,
  onClose,
  onConfirm,
  studentName,
}: MoveToInitialsModalProps) {
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
        aria-labelledby="move-to-initials-title"
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 id="move-to-initials-title" className="text-xl font-bold text-gray-900 mb-2">
            Move to Initial Stage
          </h2>
          <p className="text-gray-600">
            Are you sure you want to move <strong>{studentName}</strong>&apos;s case to the Initial stage?
          </p>
        </div>

        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-amber-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-amber-700 font-medium">Note</p>
              <p className="text-sm text-amber-700 mt-1">
                This action cannot be reversed. The case will move from Active to Initial and cannot be moved back.
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
            className="bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"
          >
            {isProcessing ? 'Moving...' : 'Move to Initial'}
          </Button>
        </div>
      </div>
    </div>
  );
}
