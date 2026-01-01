import { useState, useCallback, useEffect } from 'react';
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
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set());

  // Initialize with all teachers selected when teachers load
  useEffect(() => {
    if (teachers.length > 0 && selectedTeacherIds.size === 0) {
      // Start with no teachers selected (show all)
      setSelectedTeacherIds(new Set());
    }
  }, [teachers, selectedTeacherIds.size]);

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
