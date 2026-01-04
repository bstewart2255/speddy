'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';

interface ActivityContextMenuProps {
  activityType: string;
  position: { x: number; y: number };
  onClose: () => void;
  onConfigureAvailability: () => void;
}

export function ActivityContextMenu({
  activityType,
  position,
  onClose,
  onConfigureAvailability,
}: ActivityContextMenuProps) {
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
    x: Math.min(position.x, window.innerWidth - 220),
    y: Math.min(position.y, window.innerHeight - 100),
  };

  const handleConfigureClick = () => {
    onConfigureAvailability();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="fixed bg-white rounded-md shadow-lg border border-gray-200 z-[100] py-1 w-52"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      <div className="px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500">{activityType}</span>
      </div>
      <button
        onClick={handleConfigureClick}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <Cog6ToothIcon className="w-4 h-4" />
        <span>Configure Availability...</span>
      </button>
    </div>,
    document.body
  );
}
