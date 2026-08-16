'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/app/contexts/toast-context';
import { AddServiceTimeModal } from '@/app/components/schedule/add-service-time-modal';
import {
  deleteStudentServiceTime,
  getMyServiceTimesForStudent,
  type StudentServiceTimeWithJoins,
} from '@/lib/supabase/queries/student-service-times';
import type { Student } from '@/src/types';

const DAY_SHORT: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };

/**
 * SPE-513: "Where I see this student" — a secondary resource provider's
 * service-time entries for one student (their room + push-ins), listed on the
 * student's record. Lives outside the form's save cycle: entries persist as
 * they are added or removed, like protected times do on the schedule.
 */
export function StudentServiceTimesSection({
  studentId,
  readOnly = false,
}: {
  studentId: string;
  readOnly?: boolean;
}) {
  const { showToast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [studentRow, setStudentRow] = useState<Student | null>(null);
  const [entries, setEntries] = useState<StudentServiceTimeWithJoins[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEntries(await getMyServiceTimesForStudent(studentId));
    } catch (err) {
      console.error('[service-times-section] load failed:', err);
    }
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled) return;
      setCurrentUserId(auth?.user?.id ?? null);

      // The modal needs the full caseload row (provider_id, school_id); the
      // details modal only carries a partial student shape.
      const { data: row } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();
      if (!cancelled) setStudentRow((row as Student) ?? null);

      await refresh();
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [studentId, refresh]);

  // Entries are the caller's own service plan — only the owning provider
  // writes them, so someone else's student gets no section at all.
  const ownStudent = !!studentRow && !!currentUserId && studentRow.provider_id === currentUserId;
  if (!ownStudent) return null;

  const handleDelete = async (id: string) => {
    try {
      await deleteStudentServiceTime(id);
      showToast('Service time removed', 'success');
      await refresh();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to remove service time',
        'error'
      );
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Where I see this student
        </label>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            + Add
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">
          No service times recorded yet — add the period they come to you, and
          any classes you push into.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {entries.map(entry => (
            <li
              key={entry.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium text-gray-900">
                  {DAY_SHORT[entry.day_of_week]} · {entry.period_name}
                </span>{' '}
                <span
                  className={
                    entry.setting === 'push_in' ? 'text-indigo-700' : 'text-blue-700'
                  }
                >
                  {entry.setting === 'push_in'
                    ? `Push-in${
                        entry.teachers
                          ? ` — ${[entry.teachers.first_name, entry.teachers.last_name]
                              .filter(Boolean)
                              .join(' ')}`
                          : ''
                      }`
                    : 'My room'}
                </span>
                {entry.note && (
                  <span className="text-gray-500"> · {entry.note}</span>
                )}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDelete(entry.id)}
                  className="text-gray-400 hover:text-red-600 ml-3"
                  aria-label="Remove service time"
                  title="Remove"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500">
        Saved immediately, separate from the weekly minutes above. Push-in
        periods warn other providers before they schedule over them.
      </p>

      {studentRow && (
        <AddServiceTimeModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            showToast('Service time added', 'success');
            refresh();
          }}
          students={[studentRow]}
          initialStudentId={studentRow.id}
          currentUserId={currentUserId}
          schoolId={studentRow.school_id ?? null}
        />
      )}
    </div>
  );
}
