import { useCallback, useEffect, useRef, useState } from 'react';

import { getTeacherDisplayName } from '../utils/getTeacherDisplayName';

export type VisualFilters = {
  bellScheduleGrade: string | null;
  specialActivityTeacher: string | null;
};

const DEFAULT_VISUAL_FILTERS: VisualFilters = {
  bellScheduleGrade: null,
  specialActivityTeacher: null,
};

const getSchoolSpecificKey = (key: string, schoolId?: string | null) =>
  schoolId ? `${key}-${schoolId}` : key;

const loadVisualFilters = (schoolId?: string | null): VisualFilters => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_VISUAL_FILTERS };
  }

  const savedFilters = localStorage.getItem(
    getSchoolSpecificKey('speddy-visual-filters', schoolId)
  );

  if (!savedFilters) {
    return { ...DEFAULT_VISUAL_FILTERS };
  }

  try {
    return JSON.parse(savedFilters) as VisualFilters;
  } catch {
    return { ...DEFAULT_VISUAL_FILTERS };
  }
};

export const useVisualFilters = (
  schoolId: string | null | undefined,
  teachers: readonly any[]
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
          const key = getSchoolSpecificKey(
            'speddy-visual-filters',
            currentSchoolId
          );
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

    const teacherExists = teachers.some(
      teacher =>
        getTeacherDisplayName(teacher) === visualFilters.specialActivityTeacher
    );

    if (!teacherExists) {
      console.log(
        '[SchedulePage] Clearing teacher filter - teacher not found in current school:',
        visualFilters.specialActivityTeacher
      );
      setVisualFilters(previous => ({
        ...previous,
        specialActivityTeacher: null,
      }));
    }
  }, [schoolId, teachers, visualFilters.specialActivityTeacher]);

  return { visualFilters, setVisualFilters } as const;
};
