'use client';

import { useState, useEffect, useMemo } from 'react';
import { getProviderScheduleSessions, type ScheduleSession } from '@/lib/supabase/queries/admin-accounts';
import { formatRoleLabel } from '@/lib/utils/role-utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/app/components/ui/tabs';

interface ProviderScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerName: string;
  providerId: string;
  schoolId: string;
}

const DAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function ProviderScheduleModal({
  isOpen,
  onClose,
  providerName,
  providerId,
  schoolId,
}: ProviderScheduleModalProps) {
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState('1'); // Default to Monday

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const fetchSessions = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getProviderScheduleSessions(providerId, schoolId);
        setSessions(data);
      } catch (err) {
        console.error('Error loading schedule:', err);
        setError(err instanceof Error ? err.message : 'Failed to load schedule');
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [isOpen, providerId, schoolId]);

  // Group sessions by day (Monday=1 through Friday=5)
  const sessionsByDay = useMemo(() => {
    const grouped: Record<number, ScheduleSession[]> = {};
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

  // Count sessions per day for tab badges
  const sessionCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let day = 1; day <= 5; day++) {
      counts[day] = sessionsByDay[day]?.length || 0;
    }
    return counts;
  }, [sessionsByDay]);

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
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">
            Schedule for "{providerName}"
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
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="m-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>No sessions scheduled at this school</p>
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {/* Day tabs on the left */}
              <Tabs value={selectedDay} onValueChange={setSelectedDay} className="flex flex-1">
                <TabsList className="flex-col h-auto w-24 rounded-none bg-gray-50 border-r border-gray-200 p-2 space-y-1 shrink-0">
                  {[1, 2, 3, 4, 5].map(day => (
                    <TabsTrigger
                      key={day}
                      value={day.toString()}
                      className="w-full justify-between px-3 py-2 text-left data-[state=active]:bg-white"
                    >
                      <span>{DAY_ABBREVIATIONS[day]}</span>
                      {sessionCounts[day] > 0 && (
                        <span className="ml-1 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5">
                          {sessionCounts[day]}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Session content for selected day */}
                <div className="flex-1 overflow-y-auto p-4">
                  {[1, 2, 3, 4, 5].map(day => (
                    <TabsContent key={day} value={day.toString()} className="m-0">
                      <h3 className="font-medium text-gray-900 mb-3">{DAY_NAMES[day]}</h3>
                      {sessionsByDay[day].length === 0 ? (
                        <p className="text-gray-400 italic text-sm">No sessions scheduled</p>
                      ) : (
                        <ul className="space-y-2">
                          {sessionsByDay[day].map(session => (
                            <li
                              key={session.id}
                              className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm"
                            >
                              <span className="font-medium text-gray-900 w-24 shrink-0">
                                {formatTime(session.start_time)}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {session.student_initials || '??'}
                              </span>
                              <span className="text-gray-500 text-xs">
                                ({session.student_grade || 'N/A'})
                              </span>
                              <span className="text-gray-400">-</span>
                              <span className="text-gray-700">
                                {formatRoleLabel(session.service_type)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TabsContent>
                  ))}
                </div>
              </Tabs>
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
