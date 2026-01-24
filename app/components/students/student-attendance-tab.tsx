'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Calendar } from 'lucide-react';

interface AttendanceRecord {
  id: string;
  sessionId: string;
  date: string;
  present: boolean | null;
  absenceReason: string | null;
  sessionTime: string;
}

interface AttendanceSummary {
  presentCount: number;
  absentCount: number;
  totalMarked: number;
  attendanceRate: number;
}

interface StudentAttendanceTabProps {
  studentId: string;
}

export function StudentAttendanceTab({ studentId }: StudentAttendanceTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/students/${studentId}/attendance`);

        if (!response.ok) {
          throw new Error('Failed to fetch attendance');
        }

        const data = await response.json();
        setSummary(data.summary);
        setRecords(data.records);
      } catch (err) {
        console.error('Error fetching attendance:', err);
        setError('Unable to load attendance data');
      } finally {
        setLoading(false);
      }
    };

    if (studentId) {
      fetchAttendance();
    }
  }, [studentId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-gray-900">Attendance History</h3>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold text-green-700">{summary.presentCount}</div>
            <div className="text-xs text-green-600">Present</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-red-600 mb-1">
              <XCircle className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold text-red-700">{summary.absentCount}</div>
            <div className="text-xs text-red-600">Absent</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold text-blue-700">{summary.attendanceRate}%</div>
            <div className="text-xs text-blue-600">Rate</div>
          </div>
        </div>
      )}

      {/* Session List */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Sessions</h4>

        {records.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-4 text-center bg-gray-50 rounded-md">
            No attendance records yet
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {records.map((record) => (
              <div
                key={record.id}
                className={`flex items-center gap-3 p-2 rounded-lg ${
                  record.present === true
                    ? 'bg-green-50'
                    : record.present === false
                    ? 'bg-red-50'
                    : 'bg-gray-50'
                }`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  record.present === true
                    ? 'bg-green-100'
                    : record.present === false
                    ? 'bg-red-100'
                    : 'bg-gray-200'
                }`}>
                  {record.present === true ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : record.present === false ? (
                    <XCircle className="w-4 h-4 text-red-600" />
                  ) : (
                    <span className="text-xs text-gray-500">?</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {formatDate(record.date)}
                  </div>
                  <div className="text-xs text-gray-500">{record.sessionTime}</div>
                  {record.present === false && record.absenceReason && (
                    <div className="text-xs text-red-600 mt-0.5">
                      Reason: {record.absenceReason}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    record.present === true
                      ? 'bg-green-100 text-green-700'
                      : record.present === false
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {record.present === true ? 'Present' : record.present === false ? 'Absent' : 'Unmarked'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
