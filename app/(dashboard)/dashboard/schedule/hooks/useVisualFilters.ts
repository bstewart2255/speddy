import { useCallback, useEffect, useRef, useState } from 'react';

import type { Teacher } from '../types/teacher';
import type { Student } from '@/src/types';

export type VisualFilters = {
  grade: string | null;
  teacherId: string | null; // teacher_id (UUID)
  studentId: string | null; // student_id (UUID)
};

// Frozen because a disabled hook hands this very object to its caller (one
// stable reference, so consumers don't re-render on every tick) — nothing
// downstream may reach back through it and mutate the default.
const DEFAULT_VISUAL_FILTERS: VisualFilters = Object.freeze({
  grade: null,
  teacherId: null,
  studentId: null,
});

// Use v2 key to force clean migration from old format
const VISUAL_FILTERS_KEY = 'speddy-visual-filters-v2';

const getSchoolSpecificKey = (key: string, schoolId?: string | null) =>
  schoolId ? `${key}-${schoolId}` : key;

const loadVisualFilters = (schoolId?: string | null): VisualFilters => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_VISUAL_FILTERS };
  }

  const savedFilters = localStorage.getItem(
    getSchoolSpecificKey(VISUAL_FILTERS_KEY, schoolId)
  );

  if (!savedFilters) {
    return { ...DEFAULT_VISUAL_FILTERS };
  }

  try {
    const parsed = JSON.parse(savedFilters);
    return {
      ...DEFAULT_VISUAL_FILTERS,
      ...(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {})
    } as VisualFilters;
  } catch {
    return { ...DEFAULT_VISUAL_FILTERS };
  }
};

/**
 * @param enabled Whether the Visual Availability Filters panel is offered at
 *   all. False at secondary sites (SPE-588), where the panel is hidden: with no
 *   control on screen, a filter left in storage — set here before the panel was
 *   hidden, or carried over from another school — would shade the grid with no
 *   way to clear it. Disabled means defaults in, nothing out: storage is not
 *   written, and it is re-read when the panel comes back, so an elementary
 *   school's saved selections survive a trip through a secondary site.
 */
export const useVisualFilters = (
  schoolId: string | null | undefined,
  teachers: readonly Teacher[],
  students: readonly Student[],
  enabled = true
) => {
  const [visualFilters, setVisualFilters] = useState<VisualFilters>(() =>
    enabled ? loadVisualFilters(schoolId) : DEFAULT_VISUAL_FILTERS
  );
  const filterSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistFilters = useCallback(
    (filters: VisualFilters, currentSchoolId: string | null | undefined) => {
      if (filterSaveTimeout.current) {
        clearTimeout(filterSaveTimeout.current);
      }

      filterSaveTimeout.current = setTimeout(() => {
        if (typeof window !== 'undefined') {
          const key = getSchoolSpecificKey(VISUAL_FILTERS_KEY, currentSchoolId);
          localStorage.setItem(key, JSON.stringify(filters));
        }
      }, 300);
    },
    []
  );

  // Re-entering an enabled school reloads its stored filters. Without this the
  // state carried in from the disabled stretch — defaults — would be persisted
  // straight over the destination's saved selection by the effect below. The
  // disabled stretch is easy to reach: switching to a secondary site unmounts
  // MainSchedule while SchedulePage fetches the role, so the hook remounts
  // disabled and its useState initializer never runs again on the way back.
  // Deliberately keyed on the enabled transition only, not on schoolId: two
  // enabled schools keep today's carry-over behavior, which is SPE-591's call
  // to make, not this change's.
  const wasEnabled = useRef(enabled);
  useEffect(() => {
    const reEnabled = enabled && !wasEnabled.current;
    wasEnabled.current = enabled;
    if (reEnabled) {
      setVisualFilters(loadVisualFilters(schoolId));
    }
  }, [enabled, schoolId]);

  useEffect(() => {
    if (!enabled) return;
    persistFilters(visualFilters, schoolId);
  }, [enabled, persistFilters, schoolId, visualFilters]);

  useEffect(() => {
    return () => {
      if (filterSaveTimeout.current) {
        clearTimeout(filterSaveTimeout.current);
      }
    };
  }, []);

  // Validate teacherId still exists
  useEffect(() => {
    // Disabled means this school's lists say nothing about the retained
    // selection — it belongs to the school the provider came FROM. Validating
    // it here would null it out as "missing", and re-enabling on the way back
    // would then persist that emptied state over their saved filters.
    if (!enabled || !schoolId || !visualFilters.teacherId) {
      return;
    }

    // Wait until teachers list is populated to avoid false negatives
    if (teachers.length === 0) {
      return;
    }

    // Check if teacher_id still exists in the teachers table
    const teacherExists = teachers.some(
      teacher => teacher.id === visualFilters.teacherId
    );

    if (!teacherExists) {
      setVisualFilters(previous => ({
        ...previous,
        teacherId: null,
      }));
    }
  }, [enabled, schoolId, teachers, visualFilters.teacherId]);

  // Validate studentId still exists
  useEffect(() => {
    // Skipped while disabled for the same reason as the teacher check above.
    if (!enabled || !schoolId || !visualFilters.studentId) {
      return;
    }

    // Wait until students list is populated to avoid false negatives
    if (students.length === 0) {
      return;
    }

    // Check if student_id still exists
    const studentExists = students.some(
      student => student.id === visualFilters.studentId
    );

    if (!studentExists) {
      setVisualFilters(previous => ({
        ...previous,
        studentId: null,
      }));
    }
  }, [enabled, schoolId, students, visualFilters.studentId]);

  // Held at defaults while disabled rather than trusted: switching schools does
  // not remount this hook, so the state can still carry what the provider chose
  // at an elementary site, and that must not shade a grid whose panel is gone.
  return {
    visualFilters: enabled ? visualFilters : DEFAULT_VISUAL_FILTERS,
    setVisualFilters,
  } as const;
};
