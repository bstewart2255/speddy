'use client';

import React, { useState, useRef, useEffect } from 'react';
import { EllipsisHorizontalIcon, TrashIcon } from '@heroicons/react/24/outline';

interface DayColumnMenuProps {
  day: number;
  dayName: string;
  sessionCount: number;
  onClearDay: (day: number) => void;
  disabled?: boolean;
}

export function DayColumnMenu({
  day,
  dayName,
  sessionCount,
  onClearDay,
  disabled = false,
}: DayColumnMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowConfirm(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClearClick = () => {
    if (sessionCount === 0) return;
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    onClearDay(day);
    setShowConfirm(false);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  const hasNoSessions = sessionCount === 0;

  return (
    <div className="relative" ref={menuRef}>
      {/* Three-dot menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
        title="Day options"
        aria-label={`Options for ${dayName}`}
      >
        <EllipsisHorizontalIcon className="w-4 h-4" />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-white rounded-md shadow-lg border border-gray-200 z-50">
          <div className="py-1">
            {!showConfirm ? (
              // Clear option
              <button
                onClick={handleClearClick}
                disabled={hasNoSessions || disabled}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
                  hasNoSessions
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-red-700 hover:bg-red-50 transition-colors'
                }`}
                title={hasNoSessions ? 'No sessions to clear' : `Clear all ${sessionCount} sessions from ${dayName}`}
              >
                <TrashIcon className="w-4 h-4" />
                <span>
                  Clear day {!hasNoSessions && `(${sessionCount})`}
                </span>
              </button>
            ) : (
              // Confirmation state
              <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-200">
                <p className="text-xs text-gray-700 mb-2">
                  Clear {sessionCount} session{sessionCount !== 1 ? 's' : ''} from {dayName}?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirm}
                    className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
                  >
                    Yes, clear
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
