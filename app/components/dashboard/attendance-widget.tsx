'use client';

import { useEffect, useState, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { CheckCircle, XCircle, Users, Calendar, Clock, Loader2, ArrowLeft } from 'lucide-react';
import { useSchool } from '../providers/school-context';
import { useToast } from '@/app/contexts/toast-context';

interface UnmarkedSession {
  sessionId: string;
  studentId: string;
  studentName: string;
  studentInitials: string;
  date: string;
  sessionTime: string;
}

interface AttendanceSummary {
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  unmarkedCount: number;
  absences: {
    studentName: string;
    studentInitials: string;
    date: string;
    reason: string | null;
    sessionTime: string;
  }[];
  unmarkedSessions: UnmarkedSession[];
}

export function AttendanceWidget() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markingSession, setMarkingSession] = useState<string | null>(null);
  const [reasonEntrySession, setReasonEntrySession] = useState<string | null>(null);
  const [absenceReason, setAbsenceReason] = useState('');
  const { currentSchool, loading: schoolLoading } = useSchool();
  const { showToast } = useToast();

  const fetchAttendanceSummary = useCallback(async () => {
    if (schoolLoading) return;
    
    try {
      setLoading(true);
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

      const startDate = format(weekStart, 'yyyy-MM-dd');
      const endDate = format(weekEnd, 'yyyy-MM-dd');

      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate
      });
      
      if (currentSchool?.school_id) {
        params.append('school_id', currentSchool.school_id);
      }

      const response = await fetch(`/api/attendance/summary?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch attendance summary');
      }

      const data = await response.json();
      setSummary(data);
    } catch (err) {
      console.error('Error fetching attendance summary:', err);
      setError('Unable to load attendance data');
    } finally {
      setLoading(false);
    }
  }, [schoolLoading, currentSchool?.school_id]);

  useEffect(() => {
    if (!schoolLoading) {
      fetchAttendanceSummary();
    }
  }, [fetchAttendanceSummary, schoolLoading]);

  const handleQuickMark = async (session: UnmarkedSession, present: boolean, reason?: string) => {
    const sessionKey = `${session.sessionId}|${session.date}|${session.studentId}`;
    setMarkingSession(sessionKey);
    try {
      const response = await fetch(`/api/sessions/${session.sessionId}/attendance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: session.studentId,
          session_date: session.date,
          present,
          absence_reason: present ? null : (reason || null)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to mark attendance');
      }

      showToast(`Marked ${session.studentInitials} as ${present ? 'present' : 'absent'}`, 'success');
      setReasonEntrySession(null);
      setAbsenceReason('');
      fetchAttendanceSummary();
    } catch (err) {
      console.error('Error marking attendance:', err);
      showToast('Failed to mark attendance. Please try again.', 'error');
    } finally {
      setMarkingSession(null);
    }
  };

  const handleStartReasonEntry = (sessionKey: string) => {
    setReasonEntrySession(sessionKey);
    setAbsenceReason('');
  };

  const handleCancelReasonEntry = () => {
    setReasonEntrySession(null);
    setAbsenceReason('');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">This Week's Attendance</h2>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">This Week's Attendance</h2>
        </div>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return null;
  }


  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">This Week's Attendance</h2>
        </div>
        <span className="text-xs text-gray-500">
          {format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d')} - {format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d')}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
            <CheckCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-green-700">{summary.presentCount}</div>
          <div className="text-xs text-green-600">Present</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-red-600 mb-1">
            <XCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-red-700">{summary.absentCount}</div>
          <div className="text-xs text-red-600">Absent</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-gray-600 mb-1">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-gray-700">{summary.unmarkedCount}</div>
          <div className="text-xs text-gray-600">Unmarked</div>
        </div>
      </div>


      {summary.unmarkedSessions.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            Unmarked Sessions
          </h3>
          <div className="space-y-2">
            {summary.unmarkedSessions.map((session) => {
              const sessionKey = `${session.sessionId}|${session.date}|${session.studentId}`;
              const isMarking = markingSession === sessionKey;
              const isEnteringReason = reasonEntrySession === sessionKey;

              return (
                <div key={sessionKey} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium text-gray-600">{session.studentInitials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{session.studentName}</div>
                    <div className="text-xs text-gray-500">
                      {format(parseISO(session.date), 'EEE, MMM d')} · {session.sessionTime}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1">
                    {isMarking ? (
                      <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                    ) : isEnteringReason ? (
                      <>
                        <button
                          onClick={handleCancelReasonEntry}
                          className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
                          title="Back"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <input
                          type="text"
                          value={absenceReason}
                          onChange={(e) => setAbsenceReason(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleQuickMark(session, false, absenceReason);
                            } else if (e.key === 'Escape') {
                              handleCancelReasonEntry();
                            }
                          }}
                          placeholder="Reason (optional)"
                          className="w-24 sm:w-32 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleQuickMark(session, false, absenceReason)}
                          className="p-1.5 rounded-full hover:bg-blue-100 text-blue-600 transition-colors"
                          title="Confirm Absent"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleQuickMark(session, true)}
                          className="p-1.5 rounded-full hover:bg-green-100 text-green-600 transition-colors"
                          title="Mark Present"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleStartReasonEntry(sessionKey)}
                          className="p-1.5 rounded-full hover:bg-red-100 text-red-600 transition-colors"
                          title="Mark Absent"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                      </>
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
