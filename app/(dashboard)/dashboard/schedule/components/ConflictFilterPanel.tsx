'use client';

import React from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

interface ConflictFilterPanelProps {
  bellSchedules: any[];
  specialActivities: any[];
  students: any[];
  selectedFilters: {
    bellScheduleGrade: string | null;
    specialActivityTeacher: string | null;
    showProviderSchedule: boolean;
    showSchoolHours: boolean;
  };
  onFilterChange: (filters: {
    bellScheduleGrade: string | null;
    specialActivityTeacher: string | null;
    showProviderSchedule: boolean;
    showSchoolHours: boolean;
  }) => void;
}

export function ConflictFilterPanel({
  bellSchedules,
  specialActivities,
  students,
  selectedFilters,
  onFilterChange,
}: ConflictFilterPanelProps) {
  // Get unique grade levels from bell schedules
  const gradeLevels = Array.from(new Set(bellSchedules.map(bs => bs.grade_level))).filter(Boolean).sort();
  
  // Get unique teachers from special activities
  const teachers = Array.from(new Set(specialActivities.map(sa => sa.teacher))).filter(Boolean).sort();
  
  // Map teachers to their primary grade
  const teacherGrades = new Map<string, string>();
  teachers.forEach(teacher => {
    const teacherStudents = students.filter(s => s.teacher_name === teacher);
    if (teacherStudents.length > 0) {
      // Use the most common grade level for this teacher
      const gradeCounts = teacherStudents.reduce((acc, s) => {
        acc[s.grade_level] = (acc[s.grade_level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const primaryGrade = Object.entries(gradeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (primaryGrade) {
        teacherGrades.set(teacher, primaryGrade);
      }
    }
  });

  const handleGradeChange = (grade: string | null) => {
    onFilterChange({
      ...selectedFilters,
      bellScheduleGrade: grade,
    });
  };

  const handleTeacherChange = (teacher: string | null) => {
    onFilterChange({
      ...selectedFilters,
      specialActivityTeacher: teacher,
    });
  };

  const handleProviderScheduleToggle = () => {
    onFilterChange({
      ...selectedFilters,
      showProviderSchedule: !selectedFilters.showProviderSchedule,
    });
  };

  const handleSchoolHoursToggle = () => {
    onFilterChange({
      ...selectedFilters,
      showSchoolHours: !selectedFilters.showSchoolHours,
    });
  };

  const handleClear = () => {
    onFilterChange({
      bellScheduleGrade: null,
      specialActivityTeacher: null,
      showProviderSchedule: false,
      showSchoolHours: false,
    });
  };

  const hasActiveFilters = 
    selectedFilters.bellScheduleGrade ||
    selectedFilters.specialActivityTeacher ||
    selectedFilters.showProviderSchedule ||
    selectedFilters.showSchoolHours;

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
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
              {gradeLevels.map((grade, index) => (
                <option key={`grade-${grade}-${index}`} value={grade}>
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
              {teachers.map((teacher, index) => {
                const grade = teacherGrades.get(teacher);
                return (
                  <option key={`teacher-${teacher}-${index}`} value={teacher}>
                    {teacher} {grade ? `(${grade})` : ''}
                  </option>
                );
              })}
            </select>
            <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Provider Schedule Toggle */}
        <div className="flex items-center sm:items-end">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={selectedFilters.showProviderSchedule}
              onChange={handleProviderScheduleToggle}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
            />
            <span className="text-sm text-gray-700">Provider Schedule</span>
          </label>
        </div>

        {/* School Hours Toggle */}
        <div className="flex items-center sm:items-end">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={selectedFilters.showSchoolHours}
              onChange={handleSchoolHoursToggle}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
            />
            <span className="text-sm text-gray-700">School Hours</span>
          </label>
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
          {selectedFilters.specialActivityTeacher && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
              Activity: {selectedFilters.specialActivityTeacher}
            </span>
          )}
          {selectedFilters.showProviderSchedule && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
              Provider Schedule
            </span>
          )}
          {selectedFilters.showSchoolHours && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800">
              School Hours
            </span>
          )}
        </div>
      )}
    </div>
  );
}