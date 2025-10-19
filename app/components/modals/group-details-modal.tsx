'use client';

import { useEffect, useState } from 'react';
import type { Database } from '../../../src/types/database';
import { GroupLessonPanel } from './group-lesson-panel';
import { GroupDocumentsPanel } from './group-documents-panel';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

interface GroupDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  sessions: ScheduleSession[];
  students: Map<string, { initials: string; grade_level?: string }>;
}

type TabType = 'lesson' | 'documents' | 'details';

export function GroupDetailsModal({
  isOpen,
  onClose,
  groupId,
  groupName,
  sessions,
  students
}: GroupDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('lesson');

  // Add escape key handler and body scroll prevention
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Reset to lesson tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('lesson');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTime = (time: string) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">{groupName}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} in this group
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl font-light w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 px-6">
          <button
            onClick={() => setActiveTab('lesson')}
            className={`py-3 px-4 font-medium text-sm transition-colors relative ${
              activeTab === 'lesson'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📚 Lesson Plan
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`py-3 px-4 font-medium text-sm transition-colors relative ${
              activeTab === 'documents'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📎 Documents
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={`py-3 px-4 font-medium text-sm transition-colors relative ${
              activeTab === 'details'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            ℹ️ Session Details
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'lesson' && (
            <GroupLessonPanel
              groupId={groupId}
              groupName={groupName}
              sessions={sessions}
              students={students}
            />
          )}

          {activeTab === 'documents' && (
            <GroupDocumentsPanel groupId={groupId} />
          )}

          {activeTab === 'details' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Sessions in this group</h3>
              <div className="space-y-3">
                {sessions.length === 0 ? (
                  <p className="text-gray-500 text-sm">No sessions in this group</p>
                ) : (
                  sessions.map((session) => {
                    const student = students.get(session.student_id);
                    return (
                      <div
                        key={session.id}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="text-sm font-medium text-gray-900">
                              {formatTime(session.start_time)} - {formatTime(session.end_time)}
                            </div>
                            <div className="text-sm font-semibold text-gray-900">
                              {student?.initials || '?'}
                            </div>
                            {student?.grade_level && (
                              <div className="text-xs text-gray-500">
                                Grade {student.grade_level}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-1 rounded ${
                              session.delivered_by === 'sea'
                                ? 'bg-green-100 text-green-700'
                                : session.delivered_by === 'specialist'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-blue-100 text-blue-700'
                            }`}>
                              {session.delivered_by === 'sea'
                                ? 'SEA'
                                : session.delivered_by === 'specialist'
                                  ? 'Specialist'
                                  : 'Provider'}
                            </span>
                          </div>
                        </div>
                        {session.service_type && (
                          <div className="mt-2 text-xs text-gray-600">
                            Service: {session.service_type}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
