'use client';

import { useEffect, useState } from 'react';
import { getStudents, deleteStudent } from '../../../lib/supabase/queries/students';
import { TableSkeleton } from '../ui/skeleton';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/card';

interface Student {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string | null;
  sessions_per_week: number | null;
  minutes_per_session: number | null;
  created_at: string | null;
  provider_id: string | null;
  district_id?: string | null;
  school_district?: string | null;
  school_site?: string | null;
  school_id?: string | null;
  updated_at?: string | null;
}

export function StudentsList() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const data = await getStudents();
      setStudents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleDelete = async (studentId: string, studentInitials: string) => {
    if (!confirm(`Are you sure you want to remove ${studentInitials} from your caseload?`)) {
      return;
    }

    try {
      setDeletingId(studentId);
      await deleteStudent(studentId);
      // Remove from local state
      setStudents(students.filter(s => s.id !== studentId));
    } catch (err) {
      alert('Failed to delete student. Please try again.');
      console.error('Delete error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-8">
        <TableSkeleton rows={5} columns={5} showHeader={true} />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-600 text-center py-4">{error}</div>;
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No students yet. Click "Add student" to get started.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Student
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Grade
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Teacher
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Schedule
            </th>
            <th className="relative px-6 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {students.map((student) => (
            <tr key={student.id}>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{student.initials}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{student.grade_level}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{student.teacher_name}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {student.sessions_per_week}x/week, {student.minutes_per_session} min
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button className="text-blue-600 hover:text-blue-900 mr-4">Edit</button>
                <button 
                  onClick={() => handleDelete(student.id, student.initials)}
                  disabled={deletingId === student.id}
                  className="text-red-600 hover:text-red-900 disabled:opacity-50"
                >
                  {deletingId === student.id ? 'Deleting...' : 'Delete'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
