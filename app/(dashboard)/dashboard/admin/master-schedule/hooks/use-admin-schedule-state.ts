import { useState, useCallback } from 'react';
import type { Teacher } from '@/src/types/database';

interface UseAdminScheduleStateReturn {
  selectedTeacherIds: Set<string>;
  selectedGrades: Set<string>;
  toggleTeacher: (teacherId: string) => void;
  selectAllTeachers: () => void;
  deselectAllTeachers: () => void;
  toggleGrade: (grade: string) => void;
  clearGrades: () => void;
}

export function useAdminScheduleState(teachers: Teacher[]): UseAdminScheduleStateReturn {
  // Start with no teachers selected (show all activities)
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set());

  const toggleTeacher = useCallback((teacherId: string) => {
    setSelectedTeacherIds(prev => {
      const next = new Set(prev);
      if (next.has(teacherId)) {
        next.delete(teacherId);
      } else {
        next.add(teacherId);
      }
      return next;
    });
  }, []);

  const selectAllTeachers = useCallback(() => {
    setSelectedTeacherIds(new Set(teachers.map(t => t.id)));
  }, [teachers]);

  const deselectAllTeachers = useCallback(() => {
    setSelectedTeacherIds(new Set());
  }, []);

  const toggleGrade = useCallback((grade: string) => {
    setSelectedGrades(prev => {
      const next = new Set(prev);
      if (next.has(grade)) {
        next.delete(grade);
      } else {
        next.add(grade);
      }
      return next;
    });
  }, []);

  const clearGrades = useCallback(() => {
    setSelectedGrades(new Set());
  }, []);

  return {
    selectedTeacherIds,
    selectedGrades,
    toggleTeacher,
    selectAllTeachers,
    deselectAllTeachers,
    toggleGrade,
    clearGrades
  };
}
