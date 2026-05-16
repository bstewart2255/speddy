'use client';

import { useState } from 'react';
import { Modal } from '@/app/components/ui/modal';
import { TeacherAutocomplete } from '@/app/components/teachers/teacher-autocomplete';
import { useSchool } from '@/app/components/providers/school-context';
import {
  CARE_CATEGORIES,
  CARE_REFERRAL_SOURCES,
  COMPLIANCE_LANE_SOURCES,
  CARE_AP_DUE_DAYS,
  GRADE_OPTIONS,
  type CareCategory,
  type CareReferralSource,
} from '@/lib/constants/care';
import type { NewReferralInput } from '@/lib/supabase/queries/care-referrals';

interface AddReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: NewReferralInput) => Promise<void>;
  /** When provided, the teacher field is locked to this value (for teacher users) */
  lockedTeacher?: {
    id: string;
    name: string;
  };
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

/** Today as a YYYY-MM-DD string in local time. */
function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** Format an ISO date + offset as a readable due-date hint. */
function formatDueHint(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  due.setDate(due.getDate() + days);
  return due.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function AddReferralModal({ isOpen, onClose, onSubmit, lockedTeacher }: AddReferralModalProps) {
  const { currentSchool } = useSchool();
  const [referralSource, setReferralSource] = useState<CareReferralSource | ''>('');
  const [studentName, setStudentName] = useState('');
  const [grade, setGrade] = useState('');
  const [teacherId, setTeacherId] = useState<string | null>(lockedTeacher?.id ?? null);
  const [teacherName, setTeacherName] = useState<string | null>(lockedTeacher?.name ?? null);
  const [requestReceivedDate, setRequestReceivedDate] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [privateSchoolName, setPrivateSchoolName] = useState('');
  const [referralReason, setReferralReason] = useState('');
  const [category, setCategory] = useState<CareCategory | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isComplianceLane =
    referralSource !== '' && COMPLIANCE_LANE_SOURCES.includes(referralSource);
  const isPrivateSchool = referralSource === 'private_school';
  const teacherRequired = referralSource !== '' && !isPrivateSchool;

  const apDueHint =
    isComplianceLane && requestReceivedDate
      ? formatDueHint(requestReceivedDate, CARE_AP_DUE_DAYS)
      : null;

  const resetForm = () => {
    setReferralSource('');
    setStudentName('');
    setGrade('');
    // Keep locked teacher values if teacher is locked
    if (!lockedTeacher) {
      setTeacherId(null);
      setTeacherName(null);
    }
    setRequestReceivedDate('');
    setRequestedBy('');
    setPrivateSchoolName('');
    setReferralReason('');
    setCategory('');
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSourceChange = (value: CareReferralSource | '') => {
    setReferralSource(value);
    // Default the clock-start date to today when entering a compliance-lane source
    if (value !== '' && COMPLIANCE_LANE_SOURCES.includes(value) && !requestReceivedDate) {
      setRequestReceivedDate(todayISO());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!referralSource) {
      setError('Referral source is required');
      return;
    }
    if (!studentName.trim()) {
      setError('Student name is required');
      return;
    }
    if (!grade) {
      setError('Grade is required');
      return;
    }
    if (teacherRequired && (!teacherId || !teacherName)) {
      setError('Teacher is required');
      return;
    }
    if (isPrivateSchool && !privateSchoolName.trim()) {
      setError('Private school name is required');
      return;
    }
    if (isComplianceLane && !requestReceivedDate) {
      setError('Date request received is required');
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
        teacher_id: isPrivateSchool ? undefined : teacherId ?? undefined,
        teacher_name: isPrivateSchool ? undefined : teacherName ?? undefined,
        referral_reason: referralReason.trim(),
        category: category || undefined,
        referral_source: referralSource,
        request_received_date: isComplianceLane ? requestReceivedDate : undefined,
        requested_by:
          isComplianceLane && requestedBy.trim() ? requestedBy.trim() : undefined,
        private_school_name: isPrivateSchool ? privateSchoolName.trim() : undefined,
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

        {/* Referral source drives the rest of the form and the entry lane */}
        <div>
          <label htmlFor="referralSource" className="block text-sm font-medium text-gray-700 mb-1">
            How did this come in? <span className="text-red-500">*</span>
          </label>
          <select
            id="referralSource"
            value={referralSource}
            onChange={(e) => handleSourceChange(e.target.value as CareReferralSource | '')}
            className={inputClass}
            disabled={loading}
          >
            <option value="">Select referral source...</option>
            {CARE_REFERRAL_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {isComplianceLane && (
            <p className="mt-1 text-xs text-blue-600">
              This referral has a compliance timeline and will be tracked in the Initial stage.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="studentName" className="block text-sm font-medium text-gray-700 mb-1">
            Student Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="studentName"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className={inputClass}
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
            className={inputClass}
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

        {/* Private school name replaces the teacher field for private-school referrals */}
        {isPrivateSchool && (
          <div>
            <label htmlFor="privateSchoolName" className="block text-sm font-medium text-gray-700 mb-1">
              Private School <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="privateSchoolName"
              value={privateSchoolName}
              onChange={(e) => setPrivateSchoolName(e.target.value)}
              className={inputClass}
              placeholder="Name of the private school the student attends"
              disabled={loading}
            />
          </div>
        )}

        {!isPrivateSchool && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teacher {teacherRequired && <span className="text-red-500">*</span>}
            </label>
            {lockedTeacher ? (
              // Display locked teacher (for teacher users)
              <div className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-700">
                {lockedTeacher.name}
              </div>
            ) : (
              <TeacherAutocomplete
                value={teacherId}
                teacherName={teacherName || undefined}
                onChange={(id, name) => {
                  setTeacherId(id);
                  setTeacherName(name);
                }}
                placeholder="Search for teacher..."
                schoolId={currentSchool?.school_id ?? undefined}
                disabled={loading}
                required={teacherRequired}
              />
            )}
          </div>
        )}

        {/* Compliance-lane intake: clock-start date + who requested it */}
        {isComplianceLane && (
          <>
            <div>
              <label
                htmlFor="requestReceivedDate"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Date Request Received <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="requestReceivedDate"
                value={requestReceivedDate}
                onChange={(e) => setRequestReceivedDate(e.target.value)}
                className={inputClass}
                disabled={loading}
              />
              {apDueHint && (
                <p className="mt-1 text-xs text-blue-600">
                  Assessment Plan due: {apDueHint}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="requestedBy" className="block text-sm font-medium text-gray-700 mb-1">
                Requested By
              </label>
              <input
                type="text"
                id="requestedBy"
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                className={inputClass}
                placeholder="Parent/guardian name and relationship"
                disabled={loading}
              />
            </div>
          </>
        )}

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as CareCategory | '')}
            className={inputClass}
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
            className={`${inputClass} resize-none`}
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
