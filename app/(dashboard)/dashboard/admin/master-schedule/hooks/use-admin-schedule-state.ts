import { useState, useCallback, useEffect, useRef } from 'react';
import type { Teacher } from '@/src/types/database';

const ALL_GRADES = ['TK', 'K', '1', '2', '3', '4', '5'];

interface UseAdminScheduleStateReturn {
  selectedTeacherIds: Set<string>;
  selectedGrades: Set<string>;
  selectedActivityTypes: Set<string>;
  showDailyTimes: boolean;
  toggleTeacher: (teacherId: string) => void;
  selectAllTeachers: () => void;
  deselectAllTeachers: () => void;
  toggleGrade: (grade: string) => void;
  selectAllGrades: () => void;
  clearGrades: () => void;
  toggleActivityType: (type: string) => void;
  selectAllActivityTypes: () => void;
  clearActivityTypes: () => void;
  toggleDailyTimes: () => void;
}

export function useAdminScheduleState(
  teachers: Teacher[],
  availableActivityTypes: string[] = []
): UseAdminScheduleStateReturn {
  // Start with no teachers selected (show all activities)
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());
  // Start with all grades selected (show all bell schedules)
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set(ALL_GRADES));
  // Start with all available activity types selected
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<Set<string>>(
    new Set(availableActivityTypes)
  );

  // Daily times visibility toggle - initialize from localStorage
  const [showDailyTimes, setShowDailyTimes] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('masterSchedule.showDailyTimes');
      return stored === 'true';
    }
    return false;
  });

  // Track previous available types to detect actual changes
  const prevAvailableTypesRef = useRef<string[]>(availableActivityTypes);

  // Update selected activity types when available types actually change
  useEffect(() => {
    const prev = prevAvailableTypesRef.current;
    const changed = availableActivityTypes.length !== prev.length ||
      availableActivityTypes.some((type, i) => type !== prev[i]);

    if (changed) {
      setSelectedActivityTypes(new Set(availableActivityTypes));
      prevAvailableTypesRef.current = availableActivityTypes;
    }
  }, [availableActivityTypes]);

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
    setSelectedActivityTypes(new Set(availableActivityTypes));
  }, [availableActivityTypes]);

  const clearActivityTypes = useCallback(() => {
    setSelectedActivityTypes(new Set());
  }, []);

  const toggleDailyTimes = useCallback(() => {
    setShowDailyTimes(prev => {
      const newValue = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('masterSchedule.showDailyTimes', String(newValue));
      }
      return newValue;
    });
  }, []);

  return {
    selectedTeacherIds,
    selectedGrades,
    selectedActivityTypes,
    showDailyTimes,
    toggleTeacher,
    selectAllTeachers,
    deselectAllTeachers,
    toggleGrade,
    selectAllGrades,
    clearGrades,
    toggleActivityType,
    selectAllActivityTypes,
    clearActivityTypes,
    toggleDailyTimes
  };
}
