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
    grade: string | null;
    teacherId: string | null;
    studentId: string | null;
  };
  onFilterChange: (filters: {
    grade: string | null;
    teacherId: string | null;
    studentId: string | null;
  }) => void;
  hasOtherProviderSessions?: boolean;
}

export function ConflictFilterPanel({
  bellSchedules,
  specialActivities,
  students,
  teachers: teachersFromTable,
  selectedFilters,
  onFilterChange,
  hasOtherProviderSessions = false,
}: ConflictFilterPanelProps) {
  // Get unique grade levels from bell schedules, sorted in logical grade order (TK, K, 1, 2, 3...)
  const gradeLevels = Array.from(new Set(bellSchedules.map(bs => bs.grade_level)))
    .filter(Boolean)
    .sort((a, b) => {
      const gradeOrder: Record<string, number> = { 'TK': 0, 'K': 1 };
      const orderA = gradeOrder[a] ?? (parseInt(a, 10) + 2);
      const orderB = gradeOrder[b] ?? (parseInt(b, 10) + 2);
      return orderA - orderB;
    });
  
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
  
  // Map teacher IDs to their special activity count - memoized for performance
  const teacherActivityCounts = useMemo(() => {
    const counts = new Map<string, number>();

    teachers.forEach(teacher => {
      let activityCount: number;

      if (teacher.id.startsWith('legacy_')) {
        // For legacy synthetic IDs, match by teacher_name
        const teacherName = teacher.last_name; // We stored the full name here
        activityCount = specialActivities.filter(sa => sa.teacher_name === teacherName).length;
      } else {
        // For real teacher IDs, match by teacher_id with fallback to teacher_name
        const teacherName = formatTeacherName(teacher);
        activityCount = specialActivities.filter(sa =>
          sa.teacher_id === teacher.id ||
          (teacherName && sa.teacher_name === teacherName)
        ).length;
      }

      counts.set(teacher.id, activityCount);
    });

    return counts;
  }, [teachers, specialActivities]);

  // Sort students by initials for dropdown
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const initialsA = (a.initials || '').toLowerCase();
      const initialsB = (b.initials || '').toLowerCase();
      return initialsA.localeCompare(initialsB);
    });
  }, [students]);

  const handleGradeChange = (grade: string | null) => {
    onFilterChange({
      ...selectedFilters,
      grade,
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
      teacherId,
    });
  };

  const handleStudentChange = (studentId: string | null) => {
    if (studentId) {
      // When a student is selected, RESET grade and teacher (they become inferred)
      onFilterChange({
        grade: null,
        teacherId: null,
        studentId,
      });
    } else {
      onFilterChange({
        ...selectedFilters,
        studentId: null,
      });
    }
  };

  const handleClear = () => {
    onFilterChange({
      grade: null,
      teacherId: null,
      studentId: null,
    });
  };

  const hasActiveFilters =
    selectedFilters.grade ||
    selectedFilters.teacherId ||
    selectedFilters.studentId;

  // Get inferred grade and teacher when student is selected
  const selectedStudent = selectedFilters.studentId
    ? students.find(s => s.id === selectedFilters.studentId)
    : null;
  const inferredGrade = selectedStudent?.grade_level || null;
  const inferredTeacher = selectedStudent?.teacher_id
    ? teachers.find(t => t.id === selectedStudent.teacher_id)
    : null;

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
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Grade Filter */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Grade
          </label>
          <div className="relative">
            <select
              value={selectedFilters.grade || ''}
              onChange={(e) => handleGradeChange(e.target.value || null)}
              disabled={!!selectedFilters.studentId}
              aria-label={selectedFilters.studentId ? 'Grade filter (disabled - inferred from selected student)' : 'Grade filter'}
              title={selectedFilters.studentId ? 'Grade is automatically inferred from the selected student' : undefined}
              className={`w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white ${selectedFilters.studentId ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value="">None</option>
              {gradeLevels.map((grade) => (
                <option key={grade} value={grade}>
                  {grade === 'TK' ? 'TK' : grade === 'K' ? 'K' : grade}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Teacher Filter */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Teacher
          </label>
          <div className="relative">
            <select
              value={selectedFilters.teacherId || ''}
              onChange={(e) => handleTeacherChange(e.target.value || null)}
              disabled={!!selectedFilters.studentId}
              aria-label={selectedFilters.studentId ? 'Teacher filter (disabled - inferred from selected student)' : 'Teacher filter'}
              title={selectedFilters.studentId ? 'Teacher is automatically inferred from the selected student' : undefined}
              className={`w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white ${selectedFilters.studentId ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value="">None</option>
              {teachers.map((teacher) => {
                const activityCount = teacherActivityCounts.get(teacher.id) || 0;
                const displayName = formatTeacherName(teacher) || 'Unknown Teacher';
                return (
                  <option key={teacher.id} value={teacher.id}>
                    {displayName} ({activityCount})
                  </option>
                );
              })}
            </select>
            <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Student Filter */}
        <div className="relative">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Student
          </label>
          <div className="relative">
            <select
              value={selectedFilters.studentId || ''}
              onChange={(e) => handleStudentChange(e.target.value || null)}
              className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
            >
              <option value="">None</option>
              {sortedStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.initials} ({student.grade_level || 'No grade'})
                </option>
              ))}
            </select>
            <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Show selected student */}
          {selectedFilters.studentId && selectedStudent && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-800">
              Student: {selectedStudent.initials}
            </span>
          )}
          {/* Show inferred grade (dimmed/italic) when student is selected */}
          {selectedFilters.studentId && inferredGrade && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-600 italic">
              Grade: {inferredGrade}
            </span>
          )}
          {/* Show inferred teacher (dimmed/italic) when student is selected */}
          {selectedFilters.studentId && inferredTeacher && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-600 italic">
              Teacher: {formatTeacherName(inferredTeacher) || 'Unknown'}
            </span>
          )}
          {/* Show explicit grade selection (when no student selected) */}
          {!selectedFilters.studentId && selectedFilters.grade && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
              Grade: {selectedFilters.grade}
            </span>
          )}
          {/* Show explicit teacher selection (when no student selected) */}
          {!selectedFilters.studentId && selectedFilters.teacherId && (() => {
            const teacher = teachers.find(t => t.id === selectedFilters.teacherId);
            const teacherName = teacher ? (formatTeacherName(teacher) || 'Unknown Teacher') : selectedFilters.teacherId;
            return (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
                Teacher: {teacherName}
              </span>
            );
          })()}
          {/* Show indicator for other provider sessions when student is selected AND sessions exist */}
          {selectedFilters.studentId && hasOtherProviderSessions && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
              + Other Provider Sessions
            </span>
          )}
        </div>
      )}
    </div>
  );
}