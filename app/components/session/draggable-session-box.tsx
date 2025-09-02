'use client';

import React, { useState } from 'react';
import { ScheduleSession } from '@/src/types/database';
import { cn } from '@/src/utils/cn';

export interface DraggableSessionBoxProps {
  session: ScheduleSession;
  student: {
    initials: string;
    grade_level: string;
    id: string;
  };
  isSeaSession: boolean;
  canEdit: boolean;
  onDragStart?: (session: ScheduleSession, event: DragEvent) => void;
  onDragEnd?: () => void;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
  variant?: 'box' | 'pill';
  hasConflict?: boolean;
}

export function DraggableSessionBox({
  session,
  student,
  isSeaSession,
  canEdit,
  onDragStart,
  onDragEnd,
  onClick,
  size = 'medium',
  variant = 'box',
  hasConflict = false
}: DraggableSessionBoxProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit) return;

    setIsDragging(true);

    // Set drag data
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({
      sessionId: session.id,
      session: session,
      student: student
    }));

    // Call parent handler if provided
    if (onDragStart) {
      onDragStart(session, event.nativeEvent);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (onDragEnd) {
      onDragEnd();
    }
  };

  // Size-based classes for box variant
  const sizeClasses = {
    small: 'w-12 h-12 text-xs',
    medium: 'w-16 h-16 text-sm',
    large: 'w-20 h-20 text-base'
  };

  // Base classes based on variant
  const baseClasses = variant === 'pill' 
    ? cn(
        'inline-flex items-center px-2 py-0.5 mx-1 rounded-full text-xs font-medium transition-all duration-200',
        {
          // Conflict styling takes precedence
          'bg-red-100 border border-red-300': hasConflict,
          // SEA session styling for pills (when no conflict)
          'bg-green-100 border border-green-300': isSeaSession && !hasConflict,
          // Regular session styling for pills (when no conflict)
          'bg-gray-100 border border-gray-300': !isSeaSession && !hasConflict,
          // Draggable styling for pills
          'cursor-grab hover:cursor-grabbing hover:shadow-sm': canEdit,
          'hover:bg-red-200': canEdit && hasConflict,
          'hover:bg-green-200': canEdit && isSeaSession && !hasConflict,
          'hover:bg-gray-200': canEdit && !isSeaSession && !hasConflict,
          'cursor-default': !canEdit,
          // Dragging state
          'opacity-50': isDragging,
        }
      )
    : cn(
        'flex items-center justify-center rounded-md border-2 font-medium transition-all duration-200',
        sizeClasses[size],
        {
          // Conflict styling takes precedence
          'bg-red-100 border-red-300': hasConflict,
          // SEA session styling for boxes (when no conflict)
          'bg-green-100 border-green-300': isSeaSession && !hasConflict,
          // Regular session styling for boxes (when no conflict)
          'bg-gray-100 border-gray-300': !isSeaSession && !hasConflict,
          // Draggable styling for boxes
          'cursor-move hover:shadow-md hover:scale-105': canEdit,
          'cursor-default': !canEdit,
          // Dragging state
          'opacity-50': isDragging,
        }
      );

  return (
    <div
      className={baseClasses}
      draggable={canEdit}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onClick}
      role="button"
      tabIndex={canEdit ? 0 : -1}
      aria-label={`${isSeaSession ? 'SEA' : 'Provider'} session for ${student.initials}, grade ${student.grade_level}, ${session.service_type} from ${session.start_time} to ${session.end_time}`}
      aria-grabbed={isDragging}
      aria-disabled={!canEdit}
      title={`${student.initials} - ${session.service_type} (${session.start_time}-${session.end_time})`}
      style={{ cursor: onClick ? 'pointer' : (canEdit ? 'grab' : 'default') }}
    >
      <span className="select-none">
        {student.initials}
      </span>
    </div>
  );
}