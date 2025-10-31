'use client';

import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import type { ScheduleSession, Student } from '@/src/types/database';

const GRADE_COLOR_MAP: { [key: string]: string } = {
  K: 'bg-purple-400 hover:bg-purple-500',
  '1': 'bg-sky-400 hover:bg-sky-500',
  '2': 'bg-cyan-400 hover:bg-cyan-500',
  '3': 'bg-emerald-400 hover:bg-emerald-500',
  '4': 'bg-amber-400 hover:bg-amber-500',
  '5': 'bg-rose-400 hover:bg-rose-500',
};

interface StudentSessionGroupProps {
  student: Student;
  sessions: ScheduleSession[];
  onDragStart: (e: React.DragEvent, session: ScheduleSession) => void;
  onDragEnd: () => void;
  draggedSessionId: string | null;
  onSessionClick?: (session: ScheduleSession, triggerRect: DOMRect) => void;
}

export function StudentSessionGroup({
  student,
  sessions,
  onDragStart,
  onDragEnd,
  draggedSessionId,
  onSessionClick,
}: StudentSessionGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const totalMinutes = sessions.reduce((acc, session) => {
    return acc + (student.minutes_per_session || 0);
  }, 0);

  const gradeColor = GRADE_COLOR_MAP[student.grade_level] || 'bg-gray-400';

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-gray-600" />
          )}
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-900">
              {student.initials}
            </span>
            <span className="text-xs text-gray-500">
              (Grade {student.grade_level})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} • {totalMinutes} min total
          </span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full text-white ${gradeColor.split(' ')[0]}`}>
            {student.initials}
          </span>
        </div>
      </button>

      {/* Sessions */}
      {isExpanded && (
        <div className="p-3 bg-white">
          <div className="flex flex-wrap gap-2">
            {sessions.map((session) => {
              const hasConflict = session.status === 'needs_attention' || session.status === 'conflict';
              const isNeedsAttention = session.status === 'needs_attention';
              const isConflict = session.status === 'conflict';

              const assignmentClass =
                session.delivered_by === 'sea' ? 'border-2 border-orange-400' :
                session.delivered_by === 'specialist' ? 'border-2 border-purple-400' : '';

              const conflictClass = isConflict
                ? 'border-2 border-red-600 bg-red-50'
                : isNeedsAttention
                  ? 'border-2 border-yellow-600 bg-yellow-50'
                  : '';

              return (
                <div
                  key={session.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, session)}
                  onDragEnd={onDragEnd}
                  onClick={(e) => {
                    if (onSessionClick) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      onSessionClick(session, rect);
                    }
                  }}
                  className={`relative ${gradeColor} text-white rounded shadow-sm transition-all hover:shadow-md ${assignmentClass} ${conflictClass} ${
                    draggedSessionId === session.id ? 'opacity-50 cursor-grabbing' : 'cursor-grab hover:cursor-pointer'
                  }`}
                  style={{
                    width: '60px',
                    height: '60px',
                    padding: '6px',
                  }}
                  title={hasConflict ? session.conflict_reason || 'Session needs attention' : `${student.minutes_per_session}min session - ${session.service_type}`}
                >
                  <div className="flex flex-col h-full relative overflow-hidden items-center justify-center">
                    <div className="font-medium text-xs">{student.initials}</div>
                    <div className="text-[10px] opacity-90">{student.minutes_per_session}m</div>

                    {/* Assignment indicator */}
                    {session.delivered_by === 'sea' && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                        <span className="text-[8px] font-bold text-white">S</span>
                      </div>
                    )}
                    {session.delivered_by === 'specialist' && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-[8px] font-bold text-white">P</span>
                      </div>
                    )}

                    {/* Conflict indicator */}
                    {hasConflict && (
                      <div className="absolute -top-1 -left-1 w-4 h-4 flex items-center justify-center">
                        <ExclamationTriangleIcon
                          className={`w-4 h-4 ${isConflict ? 'text-red-600' : 'text-yellow-600'}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
