'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { StudentSessionGroup } from './student-session-group';
import type { ScheduleSession, Student } from '@/src/types/database';

interface UnscheduledSessionsPanelProps {
  unscheduledSessions: ScheduleSession[];
  students: Student[];
  onDragStart: (e: React.DragEvent, session: ScheduleSession) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onHeaderDragOver: (e: React.DragEvent) => void;
  onHeaderDrop: (e: React.DragEvent) => void;
  onHeaderDragLeave: (e: React.DragEvent) => void;
  draggedSessionId: string | null;
  isDragOver: boolean;
  isDragOverHeader: boolean;
  onSessionClick?: (session: ScheduleSession, triggerRect: DOMRect) => void;
}

export function UnscheduledSessionsPanel({
  unscheduledSessions,
  students,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onHeaderDragOver,
  onHeaderDrop,
  onHeaderDragLeave,
  draggedSessionId,
  isDragOver,
  isDragOverHeader,
  onSessionClick,
}: UnscheduledSessionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Group sessions by student
  const sessionsByStudent = useMemo(() => {
    const grouped = new Map<string, ScheduleSession[]>();

    unscheduledSessions.forEach((session) => {
      if (!session.student_id) return;
      const existing = grouped.get(session.student_id) || [];
      grouped.set(session.student_id, [...existing, session]);
    });

    return grouped;
  }, [unscheduledSessions]);

  // Get students who have unscheduled sessions, sorted by initials
  const studentsWithSessions = useMemo(() => {
    return Array.from(sessionsByStudent.keys())
      .map((studentId) => students.find((s) => s.id === studentId))
      .filter((s): s is Student => s !== undefined)
      .sort((a, b) => a.initials.localeCompare(b.initials));
  }, [sessionsByStudent, students]);

  const totalSessions = unscheduledSessions.length;
  const totalStudents = studentsWithSessions.length;

  if (totalSessions === 0) {
    return null;
  }

  return (
    <div className="border-t-4 border-gray-300 bg-white shadow-lg">
      {/* Toggle Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        onDragOver={onHeaderDragOver}
        onDrop={onHeaderDrop}
        onDragLeave={onHeaderDragLeave}
        aria-expanded={isExpanded}
        aria-controls="unscheduled-panel-content"
        className={`w-full px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 flex items-center justify-between transition-all border-b border-gray-200 ${
          isDragOverHeader ? 'bg-blue-100 border-2 border-blue-500 shadow-lg' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronUpIcon className="w-5 h-5 text-gray-700" />
          ) : (
            <ChevronDownIcon className="w-5 h-5 text-gray-700" />
          )}
          <h3 className="text-lg font-semibold text-gray-900">Unscheduled Sessions</h3>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
              {totalSessions} {totalSessions === 1 ? 'session' : 'sessions'}
            </span>
            <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm font-medium rounded-full">
              {totalStudents} {totalStudents === 1 ? 'student' : 'students'}
            </span>
          </div>
        </div>
        <div className="text-sm text-gray-600">
          {isDragOverHeader
            ? 'Drop to unschedule'
            : isExpanded
              ? 'Click to collapse'
              : 'Click to expand and manage unscheduled sessions'}
        </div>
      </button>

      {/* Panel Content */}
      {isExpanded && (
        <div
          id="unscheduled-panel-content"
          role="region"
          aria-label="Unscheduled sessions panel"
          className={`p-6 bg-gray-50 max-h-96 overflow-y-auto transition-all ${
            isDragOver ? 'bg-blue-50 border-2 border-blue-400 border-dashed' : ''
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {totalSessions === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">No unscheduled sessions</p>
              <p className="text-sm mt-2">Drag sessions here to unschedule them</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  Drag sessions from below back onto the schedule grid to reschedule them
                </p>
              </div>

              {/* Student Groups */}
              <div className="space-y-3">
                {studentsWithSessions.map((student) => {
                  const sessions = sessionsByStudent.get(student.id) || [];
                  return (
                    <StudentSessionGroup
                      key={student.id}
                      student={student}
                      sessions={sessions}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      draggedSessionId={draggedSessionId}
                      onSessionClick={onSessionClick}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
