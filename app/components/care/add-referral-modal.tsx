'use client';

import { useState } from 'react';
import { Modal } from '@/app/components/ui/modal';
import { CARE_CATEGORIES, GRADE_OPTIONS, type CareCategory } from '@/lib/constants/care';

interface AddReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    student_name: string;
    grade: string;
    referral_reason: string;
    category?: CareCategory;
  }) => Promise<void>;
}

export function AddReferralModal({ isOpen, onClose, onSubmit }: AddReferralModalProps) {
  const [studentName, setStudentName] = useState('');
  const [grade, setGrade] = useState('');
  const [referralReason, setReferralReason] = useState('');
  const [category, setCategory] = useState<CareCategory | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resetForm = () => {
    setStudentName('');
    setGrade('');
    setReferralReason('');
    setCategory('');
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!studentName.trim()) {
      setError('Student name is required');
      return;
    }
    if (!grade) {
      setError('Grade is required');
      return;
    }
    if (!referralReason.trim()) {
      setError('Referral reason is required');
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        student_name: studentName.trim(),
        grade,
        referral_reason: referralReason.trim(),
        category: category || undefined,
      });
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit referral');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add CARE Referral">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="studentName" className="block text-sm font-medium text-gray-700 mb-1">
            Student Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="studentName"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter student's full name"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-1">
            Grade <span className="text-red-500">*</span>
          </label>
          <select
            id="grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          >
            <option value="">Select grade...</option>
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g === 'TK' ? 'Transitional Kindergarten' : g === 'K' ? 'Kindergarten' : `Grade ${g}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as CareCategory | '')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          >
            <option value="">Select category (optional)...</option>
            {CARE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
            Referral Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            id="reason"
            value={referralReason}
            onChange={(e) => setReferralReason(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder="Describe the concerns and reasons for this referral..."
            disabled={loading}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? 'Submitting...' : 'Submit Referral'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
