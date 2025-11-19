'use client';

import React, { useMemo } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { formatTeacherName } from '@/lib/utils/teacher-utils';
import type { BellSchedule, SpecialActivity, Student } from '@/src/types/database';
import type { Teacher } from '../types/teacher';

interface ConflictFilterPanelProps {
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  students: Student[];
  teachers?: Teacher[];
  selectedFilters: {
    bellScheduleGrade: string | null;
    specialActivityTeacher: string | null;
  };
  onFilterChange: (filters: {
    bellScheduleGrade: string | null;
    specialActivityTeacher: string | null;
  }) => void;
}

export function ConflictFilterPanel({
  bellSchedules,
  specialActivities,
  students,
  teachers: teachersFromTable,
  selectedFilters,
  onFilterChange,
}: ConflictFilterPanelProps) {
  // Get unique grade levels from bell schedules
  const gradeLevels = Array.from(new Set(bellSchedules.map(bs => bs.grade_level))).filter(Boolean).sort();
  
  // Use teachers from the teachers table, with fallback to legacy teacher names
  const teachers = useMemo(() => {
    if (teachersFromTable && teachersFromTable.length > 0) {
      // Use teachers table when available
      return [...teachersFromTable].sort((a, b) => {
        const lastNameA = (a.last_name || '').toLowerCase();
        const lastNameB = (b.last_name || '').toLowerCase();
        if (lastNameA !== lastNameB) {
          return lastNameA.localeCompare(lastNameB);
        }
        const firstNameA = (a.first_name || '').toLowerCase();
        const firstNameB = (b.first_name || '').toLowerCase();
        return firstNameA.localeCompare(firstNameB);
      });
    }

    // Fallback: Extract unique teacher names from students and special activities
    const teacherNames = new Set<string>();

    // Collect from students
    students.forEach(s => {
      if (s.teacher_name && s.teacher_name.trim()) {
        teacherNames.add(s.teacher_name.trim());
      }
    });

    // Collect from special activities
    specialActivities.forEach(sa => {
      if (sa.teacher_name && sa.teacher_name.trim()) {
        teacherNames.add(sa.teacher_name.trim());
      }
    });

    // Create synthetic Teacher objects from legacy names
    // Use the teacher_name as the ID for fallback mode
    return Array.from(teacherNames)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(name => ({
        id: `legacy_${name}`, // Synthetic ID
        first_name: null,
        last_name: name, // Store full name in last_name
        email: null,
        school_id: null,
        created_at: null,
        updated_at: null,
      } as Teacher));
  }, [teachersFromTable, students, specialActivities]);
  
  // Map teacher IDs to their primary grade - memoized for performance
  const teacherGrades = useMemo(() => {
    const grades = new Map<string, string>();

    teachers.forEach(teacher => {
      let teacherStudents: Student[];

      if (teacher.id.startsWith('legacy_')) {
        // For legacy synthetic IDs, match by teacher_name
        const teacherName = teacher.last_name; // We stored the full name here
        teacherStudents = students.filter(s => s.teacher_name === teacherName);
      } else {
        // For real teacher IDs, match by teacher_id with fallback to teacher_name
        const teacherName = formatTeacherName(teacher);
        teacherStudents = students.filter(s =>
          s.teacher_id === teacher.id ||
          (teacherName && s.teacher_name === teacherName)
        );
      }

      if (teacherStudents.length > 0) {
        // Use the most common grade level for this teacher
        const gradeCounts: Record<string, number> = teacherStudents.reduce((acc, s) => {
          acc[s.grade_level] = (acc[s.grade_level] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const primaryGrade = Object.entries(gradeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (primaryGrade) {
          grades.set(teacher.id, primaryGrade);
        }
      }
    });

    return grades;
  }, [teachers, students]);

  const handleGradeChange = (grade: string | null) => {
    onFilterChange({
      ...selectedFilters,
      bellScheduleGrade: grade,
    });
  };

  const handleTeacherChange = (teacherId: string | null) => {
    // Validate teacher_id exists in current school's teacher list
    if (teacherId && !teachers.some(t => t.id === teacherId)) {
      // Teacher not found in current school, clear selection
      console.log('[ConflictFilterPanel] Teacher not found in current school, clearing selection:', teacherId);
      teacherId = null;
    }

    onFilterChange({
      ...selectedFilters,
      specialActivityTeacher: teacherId,
    });
  };


  const handleClear = () => {
    onFilterChange({
      bellScheduleGrade: null,
      specialActivityTeacher: null,
    });
  };

  const hasActiveFilters = 
    selectedFilters.bellScheduleGrade ||
    selectedFilters.specialActivityTeacher;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Visual Availability Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={handleClear}
            className="text-xs px-2 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          >
            Clear All
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Bell Schedule Filter */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Bell Schedule
          </label>
          <div className="relative">
            <select
              value={selectedFilters.bellScheduleGrade || ''}
              onChange={(e) => handleGradeChange(e.target.value || null)}
              className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
            >
              <option value="">All Grades</option>
              {gradeLevels.map((grade) => (
                <option key={grade} value={grade}>
                  {grade === 'K' ? 'Kindergarten' : `Grade ${grade}`}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Special Activities Filter */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Special Activities
          </label>
          <div className="relative">
            <select
              value={selectedFilters.specialActivityTeacher || ''}
              onChange={(e) => handleTeacherChange(e.target.value || null)}
              className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
            >
              <option value="">All Teachers</option>
              {teachers.map((teacher) => {
                const grade = teacherGrades.get(teacher.id);
                const displayName = formatTeacherName(teacher) || 'Unknown Teacher';
                return (
                  <option key={teacher.id} value={teacher.id}>
                    {displayName} {grade ? `(${grade})` : ''}
                  </option>
                );
              })}
            </select>
            <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedFilters.bellScheduleGrade && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
              Bell: {selectedFilters.bellScheduleGrade === 'K' ? 'Kindergarten' : `Grade ${selectedFilters.bellScheduleGrade}`}
            </span>
          )}
          {selectedFilters.specialActivityTeacher && (() => {
            const teacher = teachers.find(t => t.id === selectedFilters.specialActivityTeacher);
            const teacherName = teacher ? (formatTeacherName(teacher) || 'Unknown Teacher') : selectedFilters.specialActivityTeacher;
            return (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
                Activity: {teacherName}
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}