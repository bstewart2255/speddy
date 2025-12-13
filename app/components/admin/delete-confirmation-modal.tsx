'use client';

import { useState } from 'react';
import { Button } from '../ui/button';

interface DependencyCount {
  label: string;
  count: number;
}

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  itemName: string;
  itemType: string;
  canDelete: boolean;
  blockerReason?: string;
  dependencyCounts?: DependencyCount[];
  isDeleting?: boolean;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  itemType,
  canDelete,
  blockerReason,
  dependencyCounts,
  isDeleting = false,
}: DeleteConfirmationModalProps) {
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen) return null;

  const requiresTypedConfirmation = canDelete && dependencyCounts &&
    dependencyCounts.some(d => d.count > 0);

  const isConfirmEnabled = canDelete &&
    (!requiresTypedConfirmation || confirmText.toLowerCase() === 'delete');

  const handleConfirm = () => {
    if (isConfirmEnabled) {
      onConfirm();
    }
  };

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 m-4">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
          <p className="text-gray-600">
            Are you sure you want to delete <strong>{itemName}</strong>?
          </p>
        </div>

        {!canDelete && blockerReason && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700 font-medium">Cannot Delete</p>
                <p className="text-sm text-red-700 mt-1">{blockerReason}</p>
              </div>
            </div>
          </div>
        )}

        {dependencyCounts && dependencyCounts.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded p-4 mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              {canDelete ? 'Current associations:' : 'Active dependencies:'}
            </p>
            <ul className="space-y-1">
              {dependencyCounts.map((dep, index) => (
                <li key={index} className="text-sm text-gray-600 flex justify-between">
                  <span>{dep.label}</span>
                  <span className={`font-medium ${dep.count > 0 ? 'text-orange-600' : 'text-gray-500'}`}>
                    {dep.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canDelete && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-yellow-400"
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
                <p className="text-sm text-yellow-700 font-medium">Warning</p>
                <p className="text-sm text-yellow-700 mt-1">
                  This action cannot be undone. The {itemType} will be permanently removed.
                </p>
              </div>
            </div>
          </div>
        )}

        {canDelete && requiresTypedConfirmation && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type "delete" to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button onClick={handleClose} variant="secondary" disabled={isDeleting}>
            Cancel
          </Button>
          {canDelete ? (
            <Button
              onClick={handleConfirm}
              variant="primary"
              disabled={!isConfirmEnabled || isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          ) : (
            <Button onClick={handleClose} variant="primary">
              Understood
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
