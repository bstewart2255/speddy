'use client';

import { useState, useEffect } from 'react';
import {
  getCurrentAdminPermissions,
  getSchoolStudents,
  updateStudentAsAdmin,
  deleteStudentAsAdmin,
  type AdminStudentView
} from '@/lib/supabase/queries/admin-accounts';
import { Card } from '@/app/components/ui/card';
import { LongHoverTooltip } from '@/app/components/ui/long-hover-tooltip';

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<AdminStudentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    sessions_per_week: number;
    minutes_per_session: number;
  } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get admin permissions to find the school ID
      const permissions = await getCurrentAdminPermissions();
      const siteAdminPermission = permissions.find(p => p.role === 'site_admin');

      if (!siteAdminPermission?.school_id) {
        setError('No school found for your admin account');
        return;
      }

      setSchoolId(siteAdminPermission.school_id);
      const data = await getSchoolStudents(siteAdminPermission.school_id);
      setStudents(data || []);
    } catch (err) {
      console.error('Error loading students:', err);
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleDelete = async (studentId: string, studentInitials: string) => {
    if (!schoolId) return;

    if (!confirm(`Are you sure you want to delete student "${studentInitials}"? This will also delete all their scheduled sessions. This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingId(studentId);
      await deleteStudentAsAdmin(studentId, schoolId);
      setStudents(students.filter(s => s.id !== studentId));
    } catch (err) {
      console.error('Error deleting student:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete student');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (student: AdminStudentView) => {
    setEditingId(student.id);
    setEditFormData({
      sessions_per_week: student.sessions_per_week || 0,
      minutes_per_session: student.minutes_per_session || 0,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData(null);
  };

  const handleSaveEdit = async (studentId: string) => {
    if (!schoolId || !editFormData) return;

    try {
      setSavingId(studentId);
      await updateStudentAsAdmin(studentId, schoolId, editFormData);

      // Update local state
      setStudents(students.map(s =>
        s.id === studentId
          ? { ...s, ...editFormData }
          : s
      ));

      setEditingId(null);
      setEditFormData(null);
    } catch (err) {
      console.error('Error updating student:', err);
      alert(err instanceof Error ? err.message : 'Failed to update student');
    } finally {
      setSavingId(null);
    }
  };

  const filteredStudents = students.filter(student => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    const initials = student.initials?.toLowerCase() || '';
    const grade = student.grade_level?.toLowerCase() || '';
    const teacher = student.teacher_name?.toLowerCase() || '';
    const specialist = student.specialist_name?.toLowerCase() || '';
    return initials.includes(searchLower) || grade.includes(searchLower) ||
           teacher.includes(searchLower) || specialist.includes(searchLower);
  });

  // Calculate caseload totals
  const totalSessionsPerWeek = filteredStudents.reduce((sum, s) => sum + (s.sessions_per_week || 0), 0);
  const totalMinutesPerWeek = filteredStudents.reduce((sum, s) =>
    sum + ((s.sessions_per_week || 0) * (s.minutes_per_session || 0)), 0);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading students...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading students</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Students</h1>
            <p className="mt-2 text-gray-600">
              View and manage students at your school
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="p-4 mb-6">
        <div className="relative">
          <label htmlFor="student-search" className="sr-only">
            Search students by initials, grade, teacher, or specialist
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="student-search"
            type="text"
            placeholder="Search by initials, grade, teacher, or specialist..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </Card>

      {/* Students Table */}
      {filteredStudents.length === 0 ? (
        <Card className="p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No students found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm ? 'Try adjusting your search criteria' : 'No students have been added to this school yet'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grade
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Teacher
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Specialist
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sessions/Wk
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Min/Session
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {student.initials}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {student.grade_level || (
                        <span className="text-gray-400 italic">Not set</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {student.teacher_name || (
                        <span className="text-gray-400 italic">Not set</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {student.specialist_name || (
                        <span className="text-gray-400 italic">Not assigned</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingId === student.id ? (
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={editFormData?.sessions_per_week || 0}
                        onChange={(e) => setEditFormData(prev => prev ? {
                          ...prev,
                          sessions_per_week: parseInt(e.target.value) || 0
                        } : null)}
                        className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <div className="text-sm text-gray-900">
                        {student.sessions_per_week ?? '-'}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingId === student.id ? (
                      <input
                        type="number"
                        min="0"
                        max="120"
                        value={editFormData?.minutes_per_session || 0}
                        onChange={(e) => setEditFormData(prev => prev ? {
                          ...prev,
                          minutes_per_session: parseInt(e.target.value) || 0
                        } : null)}
                        className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <div className="text-sm text-gray-900">
                        {student.minutes_per_session ?? '-'}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    {editingId === student.id ? (
                      <>
                        <button
                          onClick={() => handleSaveEdit(student.id)}
                          disabled={savingId === student.id}
                          className="text-green-600 hover:text-green-900 disabled:text-gray-400"
                        >
                          {savingId === student.id ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          disabled={savingId === student.id}
                          className="text-gray-600 hover:text-gray-900 disabled:text-gray-400"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <LongHoverTooltip content="Edit the student's session requirements">
                          <button
                            onClick={() => handleEdit(student)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Edit
                          </button>
                        </LongHoverTooltip>
                        <LongHoverTooltip content="Delete this student and all their scheduled sessions. This cannot be undone.">
                          <button
                            onClick={() => handleDelete(student.id, student.initials)}
                            disabled={deletingId === student.id}
                            className="text-red-600 hover:text-red-900 disabled:text-gray-400"
                          >
                            {deletingId === student.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </LongHoverTooltip>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary Row */}
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-6 py-3 text-sm font-medium text-gray-900">
                  Total Caseload
                </td>
                <td className="px-6 py-3 text-sm font-bold text-gray-900">
                  {totalSessionsPerWeek}
                </td>
                <td className="px-6 py-3 text-sm text-gray-600">
                  ({totalMinutesPerWeek} min/wk)
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="mt-6 flex justify-between items-center text-sm text-gray-600">
        <div>
          Showing {filteredStudents.length} of {students.length} students
        </div>
      </div>
    </div>
  );
}
