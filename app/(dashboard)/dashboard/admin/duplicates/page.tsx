'use client';

import { useState, useEffect } from 'react';
import { findPotentialDuplicates, deleteTeacher } from '@/lib/supabase/queries/admin-accounts';
import { formatTeacherName, getCurrentUserSchoolId } from '@/lib/supabase/queries/school-directory';
import Link from 'next/link';
import { Card } from '@/app/components/ui/card';

type Teacher = Awaited<ReturnType<typeof findPotentialDuplicates>>[number][number];

export default function DuplicatesPage() {
  const [duplicateGroups, setDuplicateGroups] = useState<Teacher[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDuplicates = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current user's school ID
      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId) {
        throw new Error('Could not determine your school. Please try again.');
      }

      const groups = await findPotentialDuplicates(schoolId);
      setDuplicateGroups(groups);
    } catch (err) {
      console.error('Error loading duplicates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load duplicates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const handleDelete = async (teacherId: string, teacherName: string) => {
    if (!confirm(`Are you sure you want to delete ${teacherName}? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingId(teacherId);
      await deleteTeacher(teacherId);

      // Refresh duplicates list
      await fetchDuplicates();
    } catch (err) {
      console.error('Error deleting teacher:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete teacher');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Scanning for duplicates...</p>
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
              <h3 className="text-sm font-medium text-red-800">Error loading duplicates</h3>
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
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Potential Duplicate Teachers</h1>
        <p className="mt-2 text-gray-600">
          Review and clean up duplicate teacher records at your school
        </p>
      </div>

      {/* No Duplicates Found */}
      {duplicateGroups.length === 0 ? (
        <Card className="p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No duplicates found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Your teacher directory looks good! No potential duplicates were detected.
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard/admin/teachers"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              View Teacher Directory
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex">
              <svg className="h-5 w-5 text-yellow-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Found {duplicateGroups.length} group{duplicateGroups.length === 1 ? '' : 's'} of potential duplicates
                </h3>
                <p className="mt-1 text-sm text-yellow-700">
                  Review each group carefully. You can delete duplicate entries, but teachers with active accounts cannot be deleted.
                </p>
              </div>
            </div>
          </div>

          {/* Duplicate Groups */}
          <div className="space-y-6">
            {duplicateGroups.map((group, groupIndex) => (
              <Card key={groupIndex} className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Duplicate Group {groupIndex + 1}
                  </h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {group.length} similar records
                  </span>
                </div>

                <div className="space-y-4">
                  {group.map((teacher) => (
                    <div
                      key={teacher.id}
                      className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="text-base font-medium text-gray-900">
                            {formatTeacherName(teacher)}
                          </h4>
                          {teacher.account_id && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              Has Account
                            </span>
                          )}
                          {teacher.created_by_admin && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Admin Created
                            </span>
                          )}
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Email:</span>{' '}
                            <span className="text-gray-900">
                              {teacher.email || <span className="italic text-gray-400">Not set</span>}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Classroom:</span>{' '}
                            <span className="text-gray-900">
                              {teacher.classroom_number || <span className="italic text-gray-400">Not set</span>}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Created:</span>{' '}
                            <span className="text-gray-900">
                              {new Date(teacher.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Last Updated:</span>{' '}
                            <span className="text-gray-900">
                              {new Date(teacher.updated_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="ml-4 flex-shrink-0">
                        <button
                          onClick={() => handleDelete(teacher.id, formatTeacherName(teacher))}
                          disabled={!!teacher.account_id || deletingId === teacher.id}
                          className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                          title={teacher.account_id ? 'Cannot delete teacher with active account' : 'Delete this record'}
                        >
                          {deletingId === teacher.id ? (
                            <span className="flex items-center">
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Deleting...
                            </span>
                          ) : (
                            'Delete'
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    <strong>Recommendation:</strong> Keep the record with the most complete information and active account. Delete duplicates without accounts.
                  </p>
                </div>
              </Card>
            ))}
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-between items-center">
            <Link
              href="/dashboard/admin/teachers"
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              ← Back to Teacher Directory
            </Link>
            <button
              onClick={fetchDuplicates}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Scan
            </button>
          </div>
        </>
      )}
    </div>
  );
}
