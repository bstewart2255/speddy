'use client';

import { useEffect, useState, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { CheckCircle, XCircle, Users, Calendar } from 'lucide-react';

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
}

export function AttendanceWidget() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendanceSummary = useCallback(async () => {
    try {
      setLoading(true);
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

      const startDate = format(weekStart, 'yyyy-MM-dd');
      const endDate = format(weekEnd, 'yyyy-MM-dd');

      const response = await fetch(
        `/api/attendance/summary?start_date=${startDate}&end_date=${endDate}`
      );

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
  }, []);

  useEffect(() => {
    fetchAttendanceSummary();
  }, [fetchAttendanceSummary]);

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

  const markedCount = summary.presentCount + summary.absentCount;
  const attendanceRate = markedCount > 0 
    ? Math.round((summary.presentCount / markedCount) * 100) 
    : 0;

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

      {markedCount > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600">Attendance Rate</span>
            <span className="font-medium text-gray-900">{attendanceRate}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${attendanceRate}%` }}
            />
          </div>
        </div>
      )}

      {summary.absences.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Recent Absences</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {summary.absences.slice(0, 5).map((absence, index) => (
              <div key={index} className="flex items-start gap-3 p-2 bg-red-50 rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-red-700">{absence.studentInitials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{absence.studentName}</span>
                    <span className="text-xs text-gray-500">{format(parseISO(absence.date), 'EEE, MMM d')}</span>
                  </div>
                  <div className="text-xs text-gray-500">{absence.sessionTime}</div>
                  {absence.reason && (
                    <div className="text-xs text-red-600 mt-1">Reason: {absence.reason}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {summary.absences.length > 5 && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              +{summary.absences.length - 5} more absences
            </p>
          )}
        </div>
      )}

      {summary.absences.length === 0 && markedCount > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-4 text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No absences this week</p>
        </div>
      )}
    </div>
  );
}
