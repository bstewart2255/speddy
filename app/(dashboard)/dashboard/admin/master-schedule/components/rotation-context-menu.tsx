'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PencilIcon, UserGroupIcon, TrashIcon } from '@heroicons/react/24/outline';

interface RotationContextMenuProps {
  teacherName: string;
  activityA: string;
  activityB: string;
  position: { x: number; y: number };
  onClose: () => void;
  onEditSchedule: () => void;
  onEditGroup: () => void;
  onRemoveFromRotation: () => void;
}

export function RotationContextMenu({
  teacherName,
  activityA,
  activityB,
  position,
  onClose,
  onEditSchedule,
  onEditGroup,
  onRemoveFromRotation,
}: RotationContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Use a small delay to avoid immediate close from the same click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu within viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 240),
    y: Math.min(position.y, window.innerHeight - 160),
  };

  return createPortal(
    <div
      ref={menuRef}
      className="fixed bg-white rounded-md shadow-lg border border-gray-200 z-[100] py-1 w-56"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="text-xs font-medium text-gray-500 truncate">{teacherName}</div>
        <div className="text-xs text-gray-400 truncate">{activityA} / {activityB}</div>
      </div>

      {/* Edit this schedule */}
      <button
        onClick={() => {
          onEditSchedule();
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <PencilIcon className="w-4 h-4" />
        <span>Edit this schedule</span>
      </button>

      {/* Edit rotation group */}
      <button
        onClick={() => {
          onEditGroup();
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <UserGroupIcon className="w-4 h-4" />
        <span>Edit rotation group</span>
      </button>

      {/* Divider */}
      <div className="border-t border-gray-100 my-1" />

      {/* Remove from rotation */}
      <button
        onClick={() => {
          onRemoveFromRotation();
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-red-600 hover:bg-red-50 transition-colors"
      >
        <TrashIcon className="w-4 h-4" />
        <span>Remove from rotation</span>
      </button>
    </div>,
    document.body
  );
}
