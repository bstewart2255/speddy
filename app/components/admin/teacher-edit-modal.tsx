'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { updateTeacher, deleteTeacher, type UpdateTeacherData } from '@/lib/supabase/queries/admin-accounts';

const GRADES = ['TK', 'K', '1', '2', '3', '4', '5'];

interface Teacher {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  classroom_number: string | null;
  phone_number: string | null;
  grade_level: string | null;
  account_id: string | null;
  student_count?: number;
}

interface TeacherEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onResetPassword?: (accountId: string, teacherName: string) => void;
  teacher: Teacher | null;
}

export function TeacherEditModal({
  isOpen,
  onClose,
  onSuccess,
  onResetPassword,
  teacher,
}: TeacherEditModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [classroomNumber, setClassroomNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when teacher changes
  useEffect(() => {
    if (teacher) {
      setFirstName(teacher.first_name || '');
      setLastName(teacher.last_name || '');
      setEmail(teacher.email || '');
      setClassroomNumber(teacher.classroom_number || '');
      setPhoneNumber(teacher.phone_number || '');
      setSelectedGrades(
        teacher.grade_level ? teacher.grade_level.split(',').map(g => g.trim()) : []
      );
      setError(null);
      setDeleting(false);
    }
  }, [teacher]);

  const getTeacherName = () => {
    if (!teacher) return '';
    return `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || 'this teacher';
  };

  const handleDelete = async () => {
    if (!teacher) return;

    const teacherName = getTeacherName();
    const hasStudents = (teacher.student_count || 0) > 0;

    let warningMessage = `Are you sure you want to delete ${teacherName}? This action cannot be undone.`;
    if (hasStudents) {
      warningMessage = `Warning: ${teacherName} has ${teacher.student_count} student(s) assigned. Deleting will unassign these students. Continue?`;
    }

    if (!confirm(warningMessage)) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      await deleteTeacher(teacher.id);
      onSuccess();
    } catch (err) {
      console.error('Error deleting teacher:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete teacher');
      setDeleting(false);
    }
  };

  const handleResetPassword = () => {
    if (!teacher?.account_id || !onResetPassword) return;
    onResetPassword(teacher.account_id, getTeacherName());
  };

  if (!isOpen || !teacher) return null;

  const handleGradeToggle = (grade: string) => {
    setSelectedGrades(prev =>
      prev.includes(grade)
        ? prev.filter(g => g !== grade)
        : [...prev, grade]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!firstName.trim()) {
      setError('First name is required');
      return;
    }
    if (!lastName.trim()) {
      setError('Last name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    try {
      setLoading(true);

      // Sort grades by GRADES array order for consistent storage
      const sortedGrades = [...selectedGrades].sort(
        (a, b) => GRADES.indexOf(a) - GRADES.indexOf(b)
      );

      const updates: UpdateTeacherData = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        classroom_number: classroomNumber.trim() || null,
        phone_number: phoneNumber.trim() || null,
        grade_level: sortedGrades.length > 0 ? sortedGrades.join(',') : null,
      };

      await updateTeacher(teacher.id, updates);
      onSuccess();
    } catch (err) {
      console.error('Error updating teacher:', err);
      setError(err instanceof Error ? err.message : 'Failed to update teacher');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 m-4 max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Edit Teacher</h2>
          <p className="text-sm text-gray-500 mt-1">
            Update teacher information
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Classroom */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Classroom Number
            </label>
            <input
              type="text"
              value={classroomNumber}
              onChange={(e) => setClassroomNumber(e.target.value)}
              placeholder="e.g., Room 101"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g., (555) 123-4567"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Grade Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Grade Level(s)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Select all grades this teacher teaches (for combo classes, select multiple)
            </p>
            <div className="flex flex-wrap gap-2">
              {GRADES.map((grade) => (
                <button
                  key={grade}
                  type="button"
                  onClick={() => handleGradeToggle(grade)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    selectedGrades.includes(grade)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {grade}
                </button>
              ))}
            </div>
          </div>

          {/* Save Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading || deleting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading || deleting}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>

        {/* Account & Danger Zone */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Account Actions</h3>
          <div className="space-y-3">
            {/* Reset Password - only show if teacher has an account */}
            {teacher.account_id && onResetPassword && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">Reset Password</p>
                  <p className="text-xs text-gray-500">Generate a new temporary password</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleResetPassword}
                  disabled={loading || deleting}
                >
                  Reset
                </Button>
              </div>
            )}

            {/* Delete Teacher */}
            <div className={`flex items-center justify-between p-3 rounded-lg border ${
              teacher.account_id
                ? 'bg-gray-50 border-gray-200'
                : 'bg-red-50 border-red-100'
            }`}>
              <div>
                <p className={`text-sm font-medium ${teacher.account_id ? 'text-gray-700' : 'text-red-900'}`}>
                  Delete Teacher
                </p>
                <p className={`text-xs ${teacher.account_id ? 'text-gray-500' : 'text-red-600'}`}>
                  {teacher.account_id
                    ? 'Cannot delete - has active account'
                    : (teacher.student_count || 0) > 0
                    ? `${teacher.student_count} student(s) will be unassigned`
                    : 'Permanently remove this teacher'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading || deleting || !!teacher.account_id}
                className={`px-4 py-2 text-sm font-medium rounded-md ${
                  teacher.account_id
                    ? 'text-gray-600 bg-gray-200 cursor-not-allowed'
                    : 'text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed'
                }`}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
