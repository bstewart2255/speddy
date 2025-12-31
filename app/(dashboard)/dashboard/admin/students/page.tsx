'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getCurrentAdminPermissions,
  getSchoolStudents,
  deleteStudentAsAdmin,
  groupStudentsByIdentity,
  type GroupedStudent,
  type AdminStudentView
} from '@/lib/supabase/queries/admin-accounts';
import { Card } from '@/app/components/ui/card';
import { LongHoverTooltip } from '@/app/components/ui/long-hover-tooltip';
import { formatRoleLabel } from '@/lib/utils/role-utils';

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<AdminStudentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingGroupKey, setDeletingGroupKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [schoolId, setSchoolId] = useState<string | null>(null);

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

  // Group students by identity (initials + grade + teacher)
  const groupedStudents = useMemo(() => {
    return groupStudentsByIdentity(students);
  }, [students]);

  // Filter grouped students based on search term
  const filteredGroupedStudents = useMemo(() => {
    if (!searchTerm) return groupedStudents;

    const searchLower = searchTerm.toLowerCase();
    return groupedStudents.filter(student => {
      const initials = student.initials?.toLowerCase() || '';
      const grade = student.grade_level?.toLowerCase() || '';
      const teacher = student.teacher_name?.toLowerCase() || '';
      // Also search across all specialist names
      const specialists = student.providerRecords
        .map(r => r.specialist_name?.toLowerCase() || '')
        .join(' ');

      return initials.includes(searchLower) ||
             grade.includes(searchLower) ||
             teacher.includes(searchLower) ||
             specialists.includes(searchLower);
    });
  }, [groupedStudents, searchTerm]);

  const handleDeleteGrouped = async (student: GroupedStudent) => {
    if (!schoolId) return;

    const providerCount = student.providerRecords.length;
    const providerNames = student.providerRecords
      .map(r => formatRoleLabel(r.specialist_role))
      .join(', ');

    const confirmMessage = providerCount > 1
      ? `Are you sure you want to delete student "${student.initials}"? This will remove records for ${providerCount} providers (${providerNames}) and all their scheduled sessions. This action cannot be undone.`
      : `Are you sure you want to delete student "${student.initials}"? This will also delete all their scheduled sessions. This action cannot be undone.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setDeletingGroupKey(student.groupKey);

      // Delete all provider records for this student
      await Promise.all(
        student.providerRecords.map(r => deleteStudentAsAdmin(r.id, schoolId))
      );

      // Remove all related student records from local state
      const idsToRemove = new Set(student.providerRecords.map(r => r.id));
      setStudents(prev => prev.filter(s => !idsToRemove.has(s.id)));
    } catch (err) {
      console.error('Error deleting student:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete student');
    } finally {
      setDeletingGroupKey(null);
    }
  };

  // Calculate caseload totals across all provider records
  const totalSessionsPerWeek = filteredGroupedStudents.reduce((sum, student) =>
    sum + student.providerRecords.reduce((pSum, r) => pSum + (r.sessions_per_week || 0), 0),
    0
  );

  const totalMinutesPerWeek = filteredGroupedStudents.reduce((sum, student) =>
    sum + student.providerRecords.reduce((pSum, r) =>
      pSum + ((r.sessions_per_week || 0) * (r.minutes_per_session || 0)), 0
    ),
    0
  );

  // Count total provider records
  const totalProviderRecords = students.length;

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
              View students at your school
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
      {filteredGroupedStudents.length === 0 ? (
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
                  Specialists
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredGroupedStudents.map((student) => (
                <tr key={student.groupKey} className="hover:bg-gray-50">
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
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {student.providerRecords.map((record) => (
                        <LongHoverTooltip
                          key={record.id}
                          content={`${record.specialist_name || 'Unknown'}: ${record.sessions_per_week || 0} sessions/week, ${record.minutes_per_session || 0} min each`}
                        >
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                            {formatRoleLabel(record.specialist_role)}
                            <span className="ml-1 text-gray-500">
                              ({record.sessions_per_week || 0}x{record.minutes_per_session || 0})
                            </span>
                          </span>
                        </LongHoverTooltip>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <LongHoverTooltip
                      content={
                        student.providerRecords.length > 1
                          ? `Delete all ${student.providerRecords.length} provider records for this student`
                          : "Delete this student and all their scheduled sessions"
                      }
                    >
                      <button
                        onClick={() => handleDeleteGrouped(student)}
                        disabled={deletingGroupKey === student.groupKey}
                        className="text-red-600 hover:text-red-900 disabled:text-gray-400"
                      >
                        {deletingGroupKey === student.groupKey ? 'Deleting...' : 'Delete'}
                      </button>
                    </LongHoverTooltip>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary Row */}
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-6 py-3 text-sm font-medium text-gray-900">
                  Total Caseload
                </td>
                <td className="px-6 py-3 text-sm text-gray-600">
                  {totalSessionsPerWeek} sessions/wk ({totalMinutesPerWeek} min/wk)
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
          Showing {filteredGroupedStudents.length} unique students ({totalProviderRecords} provider records)
        </div>
      </div>
    </div>
  );
}
