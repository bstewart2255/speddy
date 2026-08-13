'use client';

import React, { useMemo, useState } from 'react';
import { addMainstreamingBlocks } from '@/lib/supabase/queries/mainstreaming-blocks';
import { ConflictResolver } from '@/lib/scheduling/conflict-resolver';
import { generateActivityTimeOptions } from '@/lib/utils/time-options';
import { formatTeacherName } from '@/lib/utils/teacher-utils';
import type { MainstreamingBlock, Student, Teacher } from '@/src/types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful add; `sessionsFlagged` = own sessions newly marked as sitting on the block. */
  onSuccess: (sessionsFlagged: number) => void;
  students: Student[];
  teachers: Teacher[];
  /** School-wide blocks already on the calendar, for the overlap pre-check. */
  existingBlocks: MainstreamingBlock[];
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
 * SPE-478: create recurring mainstreaming blocks — this student joins that
 * gen-ed class on these days at this time. Rendered from the Main Schedule
 * header for providers with a linked classroom (the SDC dual-role marker).
 */
export function AddMainstreamingBlockModal({
  isOpen,
  onClose,
  onSuccess,
  students,
  teachers,
  existingBlocks,
  currentUserId,
  schoolId,
}: Props) {
  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState('');
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
  // A student can't mainstream into the SDC teacher's own room.
  const destinationTeachers = useMemo(
    () => teachers.filter(t => !currentUserId || t.account_id !== currentUserId),
    [teachers, currentUserId]
  );

  const timeOptions = useMemo(() => generateActivityTimeOptions(), []);

  const handleDayToggle = (dayId: number) => {
    setSelectedDays(prev =>
      prev.includes(dayId) ? prev.filter(id => id !== dayId) : [...prev, dayId]
    );
  };

  const resetForm = () => {
    setStudentId('');
    setTeacherId('');
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

    // One student can't be in two classrooms at once: block any overlap with
    // the student's existing mainstreaming time (matched by shared child as
    // well as caseload row — a co-served child's blocks may carry another
    // provider's row id).
    const selectedStudent = caseloadStudents.find(s => s.id === studentId);
    const clash = existingBlocks.find(b =>
      selectedDays.includes(b.day_of_week) &&
      (b.student_id === studentId ||
        (selectedStudent?.child_id != null && b.child_id === selectedStudent.child_id)) &&
      overlaps(startTime, endTime, b.start_time, b.end_time)
    );
    if (clash) {
      const where = teachers.find(t => t.id === clash.teacher_id);
      setError(
        `This student already mainstreams ${clash.start_time.slice(0, 5)}–${clash.end_time.slice(0, 5)} on ${DAY_NAMES[clash.day_of_week]}` +
        `${where ? ` (${formatTeacherName(where)}'s class)` : ''}. Adjust the time or remove that block first.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await addMainstreamingBlocks(
        {
          student_id: studentId,
          teacher_id: teacherId,
          school_id: schoolId,
          start_time: startTime,
          end_time: endTime,
          label: label.trim() || null,
        },
        selectedDays
      );

      // Mirror the bell-schedule form: sessions of OURS already sitting on the
      // new protected time get flagged needs_attention right away. Best-effort.
      let flagged = 0;
      if (currentUserId) {
        const resolver = new ConflictResolver(currentUserId);
        const result = await resolver.resolveMainstreamingBlockConflicts(created);
        flagged = result.marked;
      }

      resetForm();
      onSuccess(flagged);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add mainstreaming block';
      setError(
        /duplicate key|mainstreaming_blocks_no_exact_dupes/i.test(message)
          ? 'This exact block already exists for that student, class, day and time.'
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
            <h2 className="text-lg font-semibold text-gray-900">Add Mainstreaming Block</h2>
            <p className="text-sm text-gray-500">
              Schedule a student to join a general-ed class
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
              Joins
            </label>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select classroom teacher</option>
              {destinationTeachers.map(t => (
                <option key={t.id} value={t.id}>
                  {formatTeacherName(t)}{t.grade_level ? ` — Grade ${t.grade_level}` : ''}
                </option>
              ))}
            </select>
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
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder="e.g. Math, PE, Morning circle"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <p className="text-xs text-gray-500">
            Mainstreaming time is protected: other providers get a warning
            before scheduling a session over it. Tip: filter the grid by the
            destination teacher to see their class&apos;s day while you pick a time.
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
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {submitting ? 'Adding…' : 'Add to Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
