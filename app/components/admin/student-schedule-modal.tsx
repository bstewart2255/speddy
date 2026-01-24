'use client';

import { useState, useEffect, useMemo } from 'react';
import { getStudentScheduleSessions, type ScheduleSession } from '@/lib/supabase/queries/admin-accounts';
import { formatRoleLabel } from '@/lib/utils/role-utils';

interface StudentScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentInitials: string;
  studentIds: string[];
  schoolId: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

export function StudentScheduleModal({
  isOpen,
  onClose,
  studentInitials,
  studentIds,
  schoolId,
}: StudentScheduleModalProps) {
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || studentIds.length === 0) {
      return;
    }

    const fetchSessions = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getStudentScheduleSessions(studentIds, schoolId);
        setSessions(data);
      } catch (err) {
        console.error('Error loading schedule:', err);
        setError(err instanceof Error ? err.message : 'Failed to load schedule');
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [isOpen, studentIds, schoolId]);

  // Group sessions by day (Monday=1 through Friday=5)
  const sessionsByDay = useMemo(() => {
    const grouped: Record<number, ScheduleSession[]> = {};
    // Initialize days Monday (1) through Friday (5)
    for (let day = 1; day <= 5; day++) {
      grouped[day] = [];
    }
    for (const session of sessions) {
      if (session.day_of_week >= 1 && session.day_of_week <= 5) {
        grouped[session.day_of_week].push(session);
      }
    }
    return grouped;
  }, [sessions]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full m-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">
            Schedule for "{studentInitials}"
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>No sessions scheduled</p>
            </div>
          ) : (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(day => (
                <div key={day}>
                  <h3 className="font-medium text-gray-900 mb-2">{DAY_NAMES[day]}</h3>
                  {sessionsByDay[day].length === 0 ? (
                    <p className="text-gray-400 italic text-sm ml-4">(No sessions)</p>
                  ) : (
                    <ul className="ml-4 space-y-1">
                      {sessionsByDay[day].map(session => (
                        <li key={session.id} className="flex items-start text-sm">
                          <span className="text-gray-400 mr-2">-</span>
                          <span className="text-gray-600">
                            {formatTimeRange(session.start_time, session.end_time)}
                          </span>
                          <span className="mx-2 text-gray-400">|</span>
                          <span className="text-gray-900">
                            {formatRoleLabel(session.service_type)}
                          </span>
                          <span className="mx-1 text-gray-400">-</span>
                          <span className="text-gray-600">
                            {session.provider_name || 'Unknown'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
