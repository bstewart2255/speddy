import { useCallback, useEffect, useRef, useState } from 'react';

import type { Teacher } from '../types/teacher';
import type { Student } from '@/src/types/database';

export type VisualFilters = {
  grade: string | null;
  teacherId: string | null; // teacher_id (UUID)
  studentId: string | null; // student_id (UUID)
};

const DEFAULT_VISUAL_FILTERS: VisualFilters = {
  grade: null,
  teacherId: null,
  studentId: null,
};

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

export const useVisualFilters = (
  schoolId: string | null | undefined,
  teachers: readonly Teacher[],
  students: readonly Student[]
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

  // Validate teacherId still exists
  useEffect(() => {
    if (!schoolId || !visualFilters.teacherId) {
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
  }, [schoolId, teachers, visualFilters.teacherId]);

  // Validate studentId still exists
  useEffect(() => {
    if (!schoolId || !visualFilters.studentId) {
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
  }, [schoolId, students, visualFilters.studentId]);

  return { visualFilters, setVisualFilters } as const;
};
