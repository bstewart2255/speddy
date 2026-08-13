'use client';

import React, { useMemo, useState } from 'react';
import { addStudentBlockedTimes } from '@/lib/supabase/queries/student-blocked-times';
import { ConflictResolver } from '@/lib/scheduling/conflict-resolver';
import { generateActivityTimeOptions } from '@/lib/utils/time-options';
import type { Student, StudentBlockedTime } from '@/src/types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful add; `sessionsFlagged` = own sessions newly marked as sitting on the protected time. */
  onSuccess: (sessionsFlagged: number) => void;
  students: Student[];
  /** School-wide protected times already on the calendar, for the duplicate pre-check. */
  existingBlockedTimes: StudentBlockedTime[];
  currentUserId: string | null;
  schoolId: string | null;
};

const DAY_NAMES: Record<number, string> = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' };

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  aStart < bEnd.substring(0, 5) && aEnd > bStart.substring(0, 5);

const DAYS_OF_WEEK = [
  { id: 1, shortName: 'Mon' },
  { id: 2, shortName: 'Tue' },
  { id: 3, shortName: 'Wed' },
  { id: 4, shortName: 'Thu' },
  { id: 5, shortName: 'Fri' },
];

/**
 * SPE-492: record a recurring protected time for a student — "don't pull
 * during PE". Rendered from the Main Schedule header; every provider at the
 * school gets a warning before scheduling a session over it. The sibling of
 * AddMainstreamingBlockModal, minus the destination classroom.
 */
export function AddBlockedTimeModal({
  isOpen,
  onClose,
  onSuccess,
  students,
  existingBlockedTimes,
  currentUserId,
  schoolId,
}: Props) {
  const [studentId, setStudentId] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only the caller's own caseload: the insert policy requires
  // students.provider_id = auth.uid(), so assigned-session extras in the
  // page's student list would fail at the database anyway.
  const caseloadStudents = useMemo(
    () => students.filter(s => s.provider_id === currentUserId),
    [students, currentUserId]
  );

  const timeOptions = useMemo(() => generateActivityTimeOptions(), []);

  const handleDayToggle = (dayId: number) => {
    setSelectedDays(prev =>
      prev.includes(dayId) ? prev.filter(id => id !== dayId) : [...prev, dayId]
    );
  };

  const resetForm = () => {
    setStudentId('');
    setSelectedDays([]);
    setStartTime('');
    setEndTime('');
    setLabel('');
    setError('');
  };

  // The modal stays mounted in the page, so Cancel/X must clear state too —
  // otherwise the next open shows the previous student and a stale error.
  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!schoolId) {
      setError('No school selected. Please select a school first.');
      return;
    }
    if (selectedDays.length === 0) {
      setError('Please select at least one day.');
      return;
    }
    if (startTime >= endTime) {
      setError('End time must be after start time.');
      return;
    }
    if (!label.trim()) {
      setError('Please name the activity (e.g. PE) — other providers see this in warnings.');
      return;
    }

    // Surface an existing overlapping protected time before writing a
    // duplicate-in-spirit (matched by shared child as well as caseload row —
    // a co-served child's blocks may carry another provider's row id).
    const selectedStudent = caseloadStudents.find(s => s.id === studentId);
    const clash = existingBlockedTimes.find(b =>
      selectedDays.includes(b.day_of_week) &&
      (b.student_id === studentId ||
        (selectedStudent?.child_id != null && b.child_id === selectedStudent.child_id)) &&
      overlaps(startTime, endTime, b.start_time, b.end_time)
    );
    if (clash) {
      setError(
        `This student already has protected time ${clash.start_time.slice(0, 5)}–${clash.end_time.slice(0, 5)} on ${DAY_NAMES[clash.day_of_week]} (${clash.label}). Adjust the time or remove that one first.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await addStudentBlockedTimes(
        {
          student_id: studentId,
          school_id: schoolId,
          start_time: startTime,
          end_time: endTime,
          label: label.trim(),
        },
        selectedDays
      );

      // Mirror the mainstreaming modal: sessions of OURS already sitting on
      // the new protected time get flagged needs_attention right away.
      let flagged = 0;
      if (currentUserId) {
        const resolver = new ConflictResolver(currentUserId);
        const result = await resolver.resolveStudentBlockedTimeConflicts(created);
        flagged = result.marked;
      }

      resetForm();
      onSuccess(flagged);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add protected time';
      setError(
        /duplicate key|student_blocked_times_no_exact_dupes/i.test(message)
          ? 'This exact protected time already exists for that student, day and time.'
          : message
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add Protected Time</h2>
            <p className="text-sm text-gray-500">
              Mark a time this student should not be pulled (PE, an elective…)
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm whitespace-pre-line">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Student
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select student</option>
              {caseloadStudents.map(s => (
                <option key={s.id} value={s.id}>
                  {s.initials} (Grade {s.grade_level})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Activity
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder="e.g. PE, Band, Robotics"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Days
            </label>
            <div className="grid grid-cols-5 gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <label
                  key={day.id}
                  className={`
                    flex flex-col items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all
                    focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1
                    ${selectedDays.includes(day.id)
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={selectedDays.includes(day.id)}
                    onChange={() => handleDayToggle(day.id)}
                    className="sr-only"
                  />
                  <div className="text-sm font-semibold">{day.shortName}</div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select time</option>
                {timeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time
              </label>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select time</option>
                {timeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Protected time warns every provider at the school before they
            schedule a session over it — yours included.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {submitting ? 'Adding…' : 'Add Protected Time'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
