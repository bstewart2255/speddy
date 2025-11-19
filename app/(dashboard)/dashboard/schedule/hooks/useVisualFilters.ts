import { useCallback, useEffect, useRef, useState } from 'react';

import type { Teacher } from '../types/teacher';

export type VisualFilters = {
  bellScheduleGrade: string | null;
  specialActivityTeacher: string | null; // teacher_id (UUID)
};

const DEFAULT_VISUAL_FILTERS: VisualFilters = {
  bellScheduleGrade: null,
  specialActivityTeacher: null,
};

const VISUAL_FILTERS_KEY = 'speddy-visual-filters';

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

export const useVisualFilters = (
  schoolId: string | null | undefined,
  teachers: readonly Teacher[]
) => {
  const [visualFilters, setVisualFilters] = useState<VisualFilters>(() =>
    loadVisualFilters(schoolId)
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

  useEffect(() => {
    persistFilters(visualFilters, schoolId);
  }, [persistFilters, schoolId, visualFilters]);

  useEffect(() => {
    return () => {
      if (filterSaveTimeout.current) {
        clearTimeout(filterSaveTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!schoolId || !visualFilters.specialActivityTeacher) {
      return;
    }

    // Wait until teachers list is populated to avoid false negatives
    if (teachers.length === 0) {
      return;
    }

    // Check if teacher_id still exists in the teachers table
    const teacherExists = teachers.some(
      teacher => teacher.id === visualFilters.specialActivityTeacher
    );

    if (!teacherExists) {
      setVisualFilters(previous => ({
        ...previous,
        specialActivityTeacher: null,
      }));
    }
  }, [schoolId, teachers, visualFilters.specialActivityTeacher]);

  return { visualFilters, setVisualFilters } as const;
};
