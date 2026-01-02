import { useState, useCallback } from 'react';
import type { Teacher } from '@/src/types/database';
import { SPECIAL_ACTIVITY_TYPES } from '../../../../../../lib/constants/activity-types';

const ALL_GRADES = ['TK', 'K', '1', '2', '3', '4', '5'];

interface UseAdminScheduleStateReturn {
  selectedTeacherIds: Set<string>;
  selectedGrades: Set<string>;
  selectedActivityTypes: Set<string>;
  toggleTeacher: (teacherId: string) => void;
  selectAllTeachers: () => void;
  deselectAllTeachers: () => void;
  toggleGrade: (grade: string) => void;
  selectAllGrades: () => void;
  clearGrades: () => void;
  toggleActivityType: (type: string) => void;
  selectAllActivityTypes: () => void;
  clearActivityTypes: () => void;
}

export function useAdminScheduleState(teachers: Teacher[]): UseAdminScheduleStateReturn {
  // Start with no teachers selected (show all activities)
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());
  // Start with all grades selected (show all bell schedules)
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set(ALL_GRADES));
  // Start with all activity types selected (show all special activities)
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<Set<string>>(
    new Set(SPECIAL_ACTIVITY_TYPES)
  );

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

  const selectAllGrades = useCallback(() => {
    setSelectedGrades(new Set(ALL_GRADES));
  }, []);

  const clearGrades = useCallback(() => {
    setSelectedGrades(new Set());
  }, []);

  const toggleActivityType = useCallback((type: string) => {
    setSelectedActivityTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const selectAllActivityTypes = useCallback(() => {
    setSelectedActivityTypes(new Set(SPECIAL_ACTIVITY_TYPES));
  }, []);

  const clearActivityTypes = useCallback(() => {
    setSelectedActivityTypes(new Set());
  }, []);

  return {
    selectedTeacherIds,
    selectedGrades,
    selectedActivityTypes,
    toggleTeacher,
    selectAllTeachers,
    deselectAllTeachers,
    toggleGrade,
    selectAllGrades,
    clearGrades,
    toggleActivityType,
    selectAllActivityTypes,
    clearActivityTypes
  };
}
