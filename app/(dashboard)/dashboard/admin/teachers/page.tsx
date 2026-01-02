'use client';

import { useState, useEffect } from 'react';
import { getTeachersWithStudentCount, formatTeacherName } from '@/lib/supabase/queries/school-directory';
import { deleteTeacher } from '@/lib/supabase/queries/admin-accounts';
import Link from 'next/link';
import { Card } from '@/app/components/ui/card';
import { LongHoverTooltip } from '@/app/components/ui/long-hover-tooltip';
import { TeacherCredentialsModal } from '@/app/components/admin/teacher-credentials-modal';
import { TeacherEditModal } from '@/app/components/admin/teacher-edit-modal';

type TeacherWithCount = NonNullable<Awaited<ReturnType<typeof getTeachersWithStudentCount>>>[number];

export default function TeacherDirectoryPage() {
  const [teachers, setTeachers] = useState<TeacherWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{
    email: string;
    temporaryPassword: string;
    userName: string;
  } | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<TeacherWithCount | null>(null);

  const fetchTeachers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTeachersWithStudentCount();
      setTeachers(data || []);
    } catch (err) {
      console.error('Error loading teachers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load teachers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const handleDelete = async (teacherId: string, teacherName: string) => {
    if (!confirm(`Are you sure you want to delete ${teacherName}? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingId(teacherId);
      await deleteTeacher(teacherId);
      setTeachers(teachers.filter(t => t.id !== teacherId));
    } catch (err) {
      console.error('Error deleting teacher:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete teacher');
    } finally {
      setDeletingId(null);
    }
  };

  const handleResetPassword = async (accountId: string, teacherName: string) => {
    if (!confirm(`Are you sure you want to reset the password for ${teacherName}? They will need to use the new password to log in.`)) {
      return;
    }

    try {
      setResettingId(accountId);
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: accountId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      // Show the credentials modal
      setResetCredentials({
        email: data.credentials.email,
        temporaryPassword: data.credentials.temporaryPassword,
        userName: teacherName,
      });
    } catch (err) {
      console.error('Error resetting password:', err);
      alert(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setResettingId(null);
    }
  };

  const filteredTeachers = teachers.filter(teacher => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    const name = formatTeacherName(teacher).toLowerCase();
    const email = teacher.email?.toLowerCase() || '';
    const classroom = teacher.classroom_number?.toLowerCase() || '';
    return name.includes(searchLower) || email.includes(searchLower) || classroom.includes(searchLower);
  });

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading teachers...</p>
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
              <h3 className="text-sm font-medium text-red-800">Error loading teachers</h3>
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
            <h1 className="text-3xl font-bold text-gray-900">Teacher Directory</h1>
            <p className="mt-2 text-gray-600">
              Manage teacher accounts at your school
            </p>
          </div>
          <Link
            href="/dashboard/admin/create-account"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Teacher
          </Link>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="p-4 mb-6">
        <div className="relative">
          <label htmlFor="teacher-search" className="sr-only">
            Search teachers by name, email, or classroom number
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="teacher-search"
            type="text"
            placeholder="Search by name, email, or classroom number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </Card>

      {/* Teachers Table */}
      {filteredTeachers.length === 0 ? (
        <Card className="p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No teachers found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm ? 'Try adjusting your search criteria' : 'Get started by creating a teacher account'}
          </p>
          {!searchTerm && (
            <div className="mt-6">
              <Link
                href="/dashboard/admin/create-account"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Teacher
              </Link>
            </div>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Classroom
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grade
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Students
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Account
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTeachers.map((teacher) => (
                <tr key={teacher.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatTeacherName(teacher)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {teacher.email || (
                        <span className="text-gray-400 italic">No email</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {teacher.classroom_number || (
                        <span className="text-gray-400 italic">Not set</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {teacher.grade_level ? (
                        <span className="inline-flex items-center gap-1">
                          {teacher.grade_level.split(',').map((g, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700"
                            >
                              {g.trim()}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Not set</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {teacher.student_count} {teacher.student_count === 1 ? 'student' : 'students'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {teacher.account_id ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        No account
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    <button
                      onClick={() => setEditingTeacher(teacher)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Edit
                    </button>
                    {teacher.account_id && (
                      <LongHoverTooltip content="Reset a teacher's password by generating a new one. Then share the new one with them so they can access their account.">
                        <button
                          onClick={() => handleResetPassword(teacher.account_id!, formatTeacherName(teacher))}
                          disabled={resettingId === teacher.account_id}
                          className="text-blue-600 hover:text-blue-900 disabled:text-gray-400"
                        >
                          {resettingId === teacher.account_id ? (
                            <span className="inline-block animate-spin">⏳</span>
                          ) : (
                            'Reset Password'
                          )}
                        </button>
                      </LongHoverTooltip>
                    )}
                    <LongHoverTooltip content="Remove this teacher from the system. Note: Teachers with active accounts cannot be deleted.">
                      <button
                        onClick={() => handleDelete(teacher.id, formatTeacherName(teacher))}
                        disabled={!!teacher.account_id || deletingId === teacher.id}
                        className="text-red-600 hover:text-red-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        {deletingId === teacher.id ? (
                          <span className="inline-block animate-spin">⏳</span>
                        ) : (
                          'Delete'
                        )}
                      </button>
                    </LongHoverTooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="mt-6 text-sm text-gray-600">
        Showing {filteredTeachers.length} of {teachers.length} teachers
      </div>

      {/* Password Reset Credentials Modal */}
      <TeacherCredentialsModal
        isOpen={!!resetCredentials}
        onClose={() => setResetCredentials(null)}
        credentials={resetCredentials || { email: '', temporaryPassword: '' }}
        userName={resetCredentials?.userName}
        mode="reset"
      />

      {/* Teacher Edit Modal */}
      <TeacherEditModal
        isOpen={!!editingTeacher}
        onClose={() => setEditingTeacher(null)}
        onSuccess={() => {
          setEditingTeacher(null);
          fetchTeachers();
        }}
        teacher={editingTeacher}
      />
    </div>
  );
}
