'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '@/app/components/providers/school-context';
import { useToast } from '@/app/contexts/toast-context';
import { buildSchoolFilter } from '@/lib/school-helpers';
import { AddServiceTimeModal } from '@/app/components/schedule/add-service-time-modal';
import {
  deleteStudentServiceTime,
  getMyServiceTimesForSchool,
  getSchoolPeriodGrid,
  type StudentServiceTimeWithJoins,
} from '@/lib/supabase/queries/student-service-times';
import type { Student } from '@/src/types';

const DAYS = [
  { id: 1, label: 'Monday' },
  { id: 2, label: 'Tuesday' },
  { id: 3, label: 'Wednesday' },
  { id: 4, label: 'Thursday' },
  { id: 5, label: 'Friday' },
];

/**
 * SPE-513: the Schedule surface for a RESOURCE provider at a secondary site —
 * a periods × days week of their service-time entries ("my room" and
 * push-in), NOT the drag-and-drop time grid. Secondary resource service is a
 * weekly minutes bucket embedded in class periods (SPE-424), so there are no
 * discrete sessions to drag; the grid's machinery (unscheduled counts,
 * auto-schedule, clock slots) would all be noise here.
 */
export function ResourceWeekView() {
  const { currentSchool } = useSchool();
  const { showToast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [gridPeriods, setGridPeriods] = useState<string[]>([]);
  const [serviceTimes, setServiceTimes] = useState<StudentServiceTimeWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const schoolId = currentSchool?.school_id || null;

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    try {
      const [grid, times] = await Promise.all([
        getSchoolPeriodGrid(schoolId),
        getMyServiceTimesForSchool(schoolId),
      ]);
      setGridPeriods(grid.map(p => p.name));
      setServiceTimes(times);
    } catch (err) {
      console.error('[resource-week-view] load failed:', err);
      showToast('Failed to load your week', 'error');
    }
  }, [schoolId, showToast]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // No school selected: nothing to load, but never strand the spinner.
      if (!currentSchool) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (cancelled) return;
        const uid = auth?.user?.id ?? null;
        setCurrentUserId(uid);

        if (uid) {
          // Own caseload at the active school — the modal's student picker.
          let query = supabase.from('students').select('*').eq('provider_id', uid);
          query = buildSchoolFilter(query, currentSchool);
          const { data: rows } = await query;
          if (!cancelled) setStudents((rows as Student[]) ?? []);
        }

        await refresh();
      } catch (err) {
        console.error('[resource-week-view] load failed:', err);
        if (!cancelled) showToast('Failed to load your week', 'error');
      } finally {
        // The reset must survive a rejected auth/students call, or the page
        // sits on "Loading your week…" forever (CodeRabbit, PR #878).
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [currentSchool, refresh, showToast]);

  // Rows: the school's period grid in bell order, plus any period an entry
  // names that the grid doesn't know (grid edited later, or no grid yet).
  const periods = useMemo(() => {
    const rows = [...gridPeriods];
    const known = new Set(rows.map(p => p.trim().toLowerCase()));
    const extras = Array.from(
      new Set(
        serviceTimes
          .map(t => t.period_name.trim())
          .filter(p => !known.has(p.toLowerCase()))
      )
    ).sort((a, b) => a.localeCompare(b));
    return [...rows, ...extras];
  }, [gridPeriods, serviceTimes]);

  const entriesFor = useCallback(
    (period: string, day: number) =>
      serviceTimes.filter(
        t =>
          t.day_of_week === day &&
          t.period_name.trim().toLowerCase() === period.trim().toLowerCase()
      ),
    [serviceTimes]
  );

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

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading your week…</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Schedule</h1>
            <p className="text-gray-600">
              Where you see your students, by period — in your room or pushing
              into their classes.
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
          >
            Add Service Time
          </button>
        </div>

        {periods.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-700 font-medium mb-1">No service times yet</p>
            <p className="text-sm text-gray-500">
              Use “Add Service Time” to record when you see each student. Tip:
              entering your school&apos;s period grid under Bell Schedules first
              gives you the school&apos;s real periods to pick from.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 w-32">
                    Period
                  </th>
                  {DAYS.map(day => (
                    <th
                      key={day.id}
                      className="text-left px-4 py-3 font-semibold text-gray-700"
                    >
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map(period => (
                  <tr key={period} className="border-b border-gray-100 align-top">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {period}
                    </td>
                    {DAYS.map(day => {
                      const entries = entriesFor(period, day.id);
                      return (
                        <td key={day.id} className="px-2 py-2">
                          <div className="flex flex-col gap-1">
                            {entries.map(entry => (
                              <div
                                key={entry.id}
                                className={`group rounded-md px-2 py-1.5 text-xs border ${
                                  entry.setting === 'push_in'
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                    : 'bg-blue-50 border-blue-200 text-blue-900'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-semibold">
                                    {entry.students?.initials ?? 'Student'}
                                  </span>
                                  <button
                                    onClick={() => handleDelete(entry.id)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity"
                                    aria-label="Remove service time"
                                    title="Remove"
                                  >
                                    ×
                                  </button>
                                </div>
                                <div className="text-[11px] leading-tight">
                                  {entry.setting === 'push_in'
                                    ? `Push-in${
                                        entry.teachers
                                          ? ` · ${[entry.teachers.first_name, entry.teachers.last_name]
                                              .filter(Boolean)
                                              .join(' ')}`
                                          : ''
                                      }`
                                    : 'My room'}
                                </div>
                                {entry.note && (
                                  <div className="text-[11px] text-gray-500 leading-tight">
                                    {entry.note}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-gray-500">
          Push-in entries warn other providers before they schedule a pull-out
          over your in-class support. Service minutes stay on each student as a
          weekly total.
        </p>

        <AddServiceTimeModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            showToast('Service time added', 'success');
            refresh();
          }}
          students={students}
          currentUserId={currentUserId}
          schoolId={schoolId}
        />
      </div>
    </div>
  );
}
