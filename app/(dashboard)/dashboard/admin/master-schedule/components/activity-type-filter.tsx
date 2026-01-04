'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ActivityContextMenu } from './activity-context-menu';
import { AvailabilityModal } from './availability-modal';

interface ActivityTypeFilterProps {
  selectedTypes: Set<string>;
  availableTypes: string[];
  onToggleType: (type: string) => void;
  onClearAll: () => void;
  onSelectAll: () => void;
  schoolId: string | null;
  onAvailabilityChange?: () => void;
}

const ACTIVITY_COLOR_MAP: Record<string, { bg: string; border: string; selectedBg: string }> = {
  Library: { bg: 'bg-blue-50', border: 'border-blue-300', selectedBg: 'bg-blue-200' },
  STEAM: { bg: 'bg-orange-50', border: 'border-orange-300', selectedBg: 'bg-orange-200' },
  STEM: { bg: 'bg-teal-50', border: 'border-teal-300', selectedBg: 'bg-teal-200' },
  Garden: { bg: 'bg-lime-50', border: 'border-lime-300', selectedBg: 'bg-lime-200' },
  Music: { bg: 'bg-violet-50', border: 'border-violet-300', selectedBg: 'bg-violet-200' },
  ART: { bg: 'bg-fuchsia-50', border: 'border-fuchsia-300', selectedBg: 'bg-fuchsia-200' },
  PE: { bg: 'bg-red-50', border: 'border-red-300', selectedBg: 'bg-red-200' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-50', border: 'border-gray-300', selectedBg: 'bg-gray-200' };

export function ActivityTypeFilter({
  selectedTypes,
  availableTypes,
  onToggleType,
  onClearAll,
  onSelectAll,
  schoolId,
  onAvailabilityChange
}: ActivityTypeFilterProps) {
  const [contextMenu, setContextMenu] = useState<{
    activityType: string;
    position: { x: number; y: number };
  } | null>(null);
  const [availabilityModal, setAvailabilityModal] = useState<string | null>(null);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  const allSelected = selectedTypes.size === availableTypes.length && availableTypes.length > 0;
  const noneSelected = selectedTypes.size === 0;

  // Focus input when add mode is activated
  useEffect(() => {
    if (showAddInput && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [showAddInput]);

  const handleContextMenu = (e: React.MouseEvent, activityType: string) => {
    e.preventDefault();
    setContextMenu({
      activityType,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleOpenAvailabilityModal = () => {
    if (contextMenu) {
      setAvailabilityModal(contextMenu.activityType);
    }
  };

  const handleCloseAvailabilityModal = () => {
    setAvailabilityModal(null);
  };

  const handleAvailabilitySuccess = () => {
    setAvailabilityModal(null);
    setShowAddInput(false);
    setNewTypeName('');
    onAvailabilityChange?.();
  };

  const handleAddClick = () => {
    setShowAddInput(true);
  };

  const handleAddSubmit = () => {
    const trimmedName = newTypeName.trim();
    if (trimmedName && !availableTypes.includes(trimmedName)) {
      // Open availability modal for the new type
      setAvailabilityModal(trimmedName);
    }
    setShowAddInput(false);
    setNewTypeName('');
  };

  const handleAddCancel = () => {
    setShowAddInput(false);
    setNewTypeName('');
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddSubmit();
    } else if (e.key === 'Escape') {
      handleAddCancel();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-700">Activity:</span>
      <div className="flex items-center gap-1">
        {availableTypes.map((type) => {
          const isSelected = selectedTypes.has(type);
          const colors = ACTIVITY_COLOR_MAP[type] || DEFAULT_COLOR;

          return (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              onContextMenu={(e) => handleContextMenu(e, type)}
              className={`
                px-2 py-0.5 text-xs font-medium rounded border transition-all
                ${isSelected
                  ? `${colors.selectedBg} ${colors.border} text-gray-900`
                  : `${colors.bg} ${colors.border} text-gray-600 opacity-60 hover:opacity-100`
                }
              `}
              title={`${isSelected ? 'Hide' : 'Show'} ${type} (right-click for options)`}
            >
              {type}
            </button>
          );
        })}

        {/* Add new activity type */}
        {showAddInput ? (
          <div className="flex items-center gap-1">
            <input
              ref={addInputRef}
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyDown={handleAddKeyDown}
              onBlur={handleAddCancel}
              placeholder="Activity name"
              className="px-2 py-0.5 text-xs border border-gray-300 rounded w-24 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        ) : (
          <button
            onClick={handleAddClick}
            className="px-2 py-0.5 text-xs font-medium rounded border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all"
            title="Add new activity type"
          >
            +
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 ml-2 border-l border-gray-200 pl-2">
        <button
          onClick={onSelectAll}
          disabled={allSelected}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            allSelected
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-blue-600 hover:bg-blue-50'
          }`}
        >
          All
        </button>
        <button
          onClick={onClearAll}
          disabled={noneSelected}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            noneSelected
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-blue-600 hover:bg-blue-50'
          }`}
        >
          Clear
        </button>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <ActivityContextMenu
          activityType={contextMenu.activityType}
          position={contextMenu.position}
          onClose={handleCloseContextMenu}
          onConfigureAvailability={handleOpenAvailabilityModal}
        />
      )}

      {/* Availability configuration modal */}
      {availabilityModal && schoolId && (
        <AvailabilityModal
          activityType={availabilityModal}
          schoolId={schoolId}
          onClose={handleCloseAvailabilityModal}
          onSuccess={handleAvailabilitySuccess}
        />
      )}
    </div>
  );
}
