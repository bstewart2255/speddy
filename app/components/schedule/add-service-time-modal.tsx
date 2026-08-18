'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  addStudentServiceTimes,
  getMyServiceTimesForStudent,
  getSchoolPeriodGrid,
  type ServiceTimeSetting,
  type StudentServiceTime,
} from '@/lib/supabase/queries/student-service-times';
import {
  getTeacherLinksForStudent,
  sortTeachersByPeriod,
  type EditableTeacherLink,
} from '@/lib/supabase/queries/student-teachers';
import { SECONDARY_BELL_SCHEDULE_ACTIVITIES } from '@/lib/constants/activity-types';
import { resolvePeriodLabel } from '@/lib/scheduling/period-times';
import type { Student } from '@/src/types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful add; the parent refreshes its list. */
  onSuccess: () => void;
  students: Student[];
  /** Pre-select a student (opened from their record). */
  initialStudentId?: string;
  currentUserId: string | null;
  schoolId: string | null;
};

const DAY_NAMES: Record<number, string> = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' };

const DAYS_OF_WEEK = [
  { id: 1, shortName: 'Mon' },
  { id: 2, shortName: 'Tue' },
  { id: 3, shortName: 'Wed' },
  { id: 4, shortName: 'Thu' },
  { id: 5, shortName: 'Fri' },
];

/** Sentinel for "pick a teacher by hand" in the class dropdown. */
const MANUAL_CLASS = '__manual__';

interface DirectoryTeacher {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

const teacherDisplayName = (t: { first_name: string | null; last_name: string | null }) =>
  [t.first_name, t.last_name].filter(Boolean).join(' ') || 'Unnamed teacher';

/**
 * SPE-513: record where/when a secondary resource provider sees a student —
 * their own room (the academic-support period) or pushing into the student's
 * gen-ed class. Period-anchored, no clock times: the school's period grid
 * (SPE-491) supplies times wherever they are needed. Sibling of
 * AddBlockedTimeModal in rhythm; opened from the period week view and the
 * student details modal.
 */
export function AddServiceTimeModal({
  isOpen,
  onClose,
  onSuccess,
  students,
  initialStudentId,
  currentUserId,
  schoolId,
}: Props) {
  const [studentId, setStudentId] = useState('');
  const [setting, setSetting] = useState<ServiceTimeSetting>('own_room');
  /** Teacher id from the student's class list, or MANUAL_CLASS. */
  const [classChoice, setClassChoice] = useState('');
  const [manualTeacherId, setManualTeacherId] = useState('');
  const [periodName, setPeriodName] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [periodOptions, setPeriodOptions] = useState<string[]>([]);
  const [classLinks, setClassLinks] = useState<EditableTeacherLink[]>([]);
  const [directoryTeachers, setDirectoryTeachers] = useState<DirectoryTeacher[]>([]);
  const [existingTimes, setExistingTimes] = useState<StudentServiceTime[]>([]);

  // Only the caller's own caseload: the insert policy requires
  // students.provider_id = auth.uid(), so anything else would fail at the
  // database anyway.
  const caseloadStudents = useMemo(
    () => students.filter(s => s.provider_id === currentUserId),
    [students, currentUserId]
  );

  // Adopt the pre-selected student each time the modal opens.
  useEffect(() => {
    if (isOpen && initialStudentId) {
      setStudentId(initialStudentId);
    }
  }, [isOpen, initialStudentId]);

  // The school's period grid, falling back to the standard secondary picklist
  // when nobody has entered bell schedules yet (the entry stays usable; only
  // time-resolved warnings need the grid).
  useEffect(() => {
    if (!isOpen || !schoolId) return;
    let cancelled = false;
    getSchoolPeriodGrid(schoolId)
      .then(grid => {
        if (cancelled) return;
        setPeriodOptions(
          grid.length > 0 ? grid.map(p => p.name) : [...SECONDARY_BELL_SCHEDULE_ACTIVITIES]
        );
      })
      .catch(() => {
        if (!cancelled) setPeriodOptions([...SECONDARY_BELL_SCHEDULE_ACTIVITIES]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, schoolId]);

  // The selected student's classes (their teacher set, subject/period labels
  // included) + the provider's existing entries for the duplicate pre-check.
  useEffect(() => {
    if (!isOpen || !studentId) {
      setClassLinks([]);
      setExistingTimes([]);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    getTeacherLinksForStudent(supabase, studentId)
      .then(links => {
        if (!cancelled) setClassLinks(links);
      })
      .catch(() => {
        if (!cancelled) setClassLinks([]);
      });
    getMyServiceTimesForStudent(studentId)
      .then(rows => {
        if (!cancelled) setExistingTimes(rows);
      })
      .catch(() => {
        if (!cancelled) setExistingTimes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, studentId]);

  // School teacher directory, for the manual fallback picker.
  useEffect(() => {
    if (!isOpen || !schoolId) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('teachers')
      .select('id, first_name, last_name')
      .eq('school_id', schoolId)
      .order('last_name', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setDirectoryTeachers((data as DirectoryTeacher[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, schoolId]);

  const handleDayToggle = (dayId: number) => {
    setSelectedDays(prev =>
      prev.includes(dayId) ? prev.filter(id => id !== dayId) : [...prev, dayId]
    );
  };

  const handleClassChoice = (value: string) => {
    setClassChoice(value);
    if (value && value !== MANUAL_CLASS) {
      // Picking a labeled class auto-fills the period when the label
      // resolves — and CLEARS it when it doesn't, so switching classes can
      // never silently keep the previous class's auto-filled period.
      const link = classLinks.find(l => l.teacherId === value);
      setPeriodName(resolvePeriodLabel(link?.period, periodOptions) ?? '');
    }
  };

  const resetForm = () => {
    setStudentId('');
    setSetting('own_room');
    setClassChoice('');
    setManualTeacherId('');
    setPeriodName('');
    setSelectedDays([]);
    setNote('');
    setError('');
  };

  // The modal stays mounted in the page, so Cancel/X must clear state too —
  // otherwise the next open shows the previous student and a stale error.
  const handleClose = () => {
    resetForm();
    onClose();
  };

  const effectiveTeacherId =
    setting === 'push_in'
      ? classChoice === MANUAL_CLASS
        ? manualTeacherId
        : classChoice
      : null;

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
    if (!periodName) {
      setError('Please pick a period.');
      return;
    }
    if (setting === 'push_in' && !effectiveTeacherId) {
      setError('Please pick which class you push into.');
      return;
    }

    // Surface an existing entry before the unique constraint does: one entry
    // per student/day/period (a student is in one place during a period).
    const clash = existingTimes.find(
      t =>
        selectedDays.includes(t.day_of_week) &&
        t.period_name.trim().toLowerCase() === periodName.trim().toLowerCase()
    );
    if (clash) {
      setError(
        `You already have ${clash.period_name} on ${DAY_NAMES[clash.day_of_week]} for this student. Remove that entry first if it changed.`
      );
      return;
    }

    setSubmitting(true);
    try {
      await addStudentServiceTimes(
        {
          student_id: studentId,
          school_id: schoolId,
          setting,
          period_name: periodName,
          teacher_id: effectiveTeacherId,
          note,
        },
        selectedDays
      );
      resetForm();
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add service time';
      setError(
        /duplicate key|student_service_times_no_exact_dupes/i.test(message)
          ? 'This exact entry already exists for that student, day and period.'
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
            <h2 className="text-lg font-semibold text-gray-900">Add Service Time</h2>
            <p className="text-sm text-gray-500">
              Record when you see this student — in your room or in their class
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
              onChange={(e) => {
                setStudentId(e.target.value);
                setClassChoice('');
              }}
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Setting
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'own_room', label: 'My room', hint: 'Student comes to me' },
                  { value: 'push_in', label: 'Push-in', hint: 'I join their class' },
                ] as const
              ).map(option => (
                <label
                  key={option.value}
                  className={`
                    flex flex-col items-start justify-center p-3 rounded-lg border-2 cursor-pointer transition-all
                    focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1
                    ${setting === option.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="service-time-setting"
                    checked={setting === option.value}
                    onChange={() => setSetting(option.value)}
                    className="sr-only"
                  />
                  <div className="text-sm font-semibold">{option.label}</div>
                  <div className="text-xs text-gray-500">{option.hint}</div>
                </label>
              ))}
            </div>
          </div>

          {setting === 'push_in' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Class
              </label>
              <select
                value={classChoice}
                onChange={(e) => handleClassChoice(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">
                  {classLinks.length > 0 ? "Select the student's class" : 'Select a class'}
                </option>
                {/* Period order — the day the student walks through, which is
                    how they name the class they want ("third period"). */}
                {sortTeachersByPeriod(classLinks).map(link => (
                  <option key={link.teacherId} value={link.teacherId}>
                    {[link.subject, link.name, link.period].filter(Boolean).join(' — ') || 'Unnamed class'}
                  </option>
                ))}
                <option value={MANUAL_CLASS}>Another teacher…</option>
              </select>
              {classChoice === MANUAL_CLASS && (
                <select
                  value={manualTeacherId}
                  onChange={(e) => setManualTeacherId(e.target.value)}
                  className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select teacher</option>
                  {directoryTeachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {teacherDisplayName(t)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Period
            </label>
            <select
              value={periodName}
              onChange={(e) => setPeriodName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select period</option>
              {periodOptions.map(p => (
                <option key={p} value={p}>
                  {p}
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
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
              placeholder="e.g. Test support, writing block"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <p className="text-xs text-gray-500">
            Push-in periods warn other providers before they schedule a
            pull-out on top of your in-class support. Minutes are unaffected —
            the weekly service total stays as entered on the student.
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
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {submitting ? 'Adding…' : 'Add Service Time'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
