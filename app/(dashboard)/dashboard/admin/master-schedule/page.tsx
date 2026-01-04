'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getCurrentAdminPermissions } from '../../../../../lib/supabase/queries/admin-accounts';
import { AdminScheduleGrid } from './components/admin-schedule-grid';
import { TeacherPanel } from './components/teacher-panel';
import { GradeFilter } from './components/grade-filter';
import { ActivityTypeFilter } from './components/activity-type-filter';
import { useAdminScheduleData } from './hooks/use-admin-schedule-data';
import { useAdminScheduleState } from './hooks/use-admin-schedule-state';
import { getActivityAvailability, DayAvailability } from '../../../../../lib/supabase/queries/activity-availability';

type ViewFilter = 'all' | 'bell' | 'activities';

export default function MasterSchedulePage() {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [activityAvailability, setActivityAvailability] = useState<Map<string, DayAvailability>>(new Map());

  // Fetch activity availability for the school
  const fetchActivityAvailability = useCallback(async () => {
    if (!schoolId) return;
    try {
      const availability = await getActivityAvailability(schoolId);
      setActivityAvailability(availability);
    } catch (err) {
      console.error('Error fetching activity availability:', err);
    }
  }, [schoolId]);

  // Fetch availability when schoolId changes
  useEffect(() => {
    if (schoolId) {
      fetchActivityAvailability();
    }
  }, [schoolId, fetchActivityAvailability]);

  // Fetch site admin permissions and school ID
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const permissions = await getCurrentAdminPermissions();
        const siteAdminPerm = permissions?.find(p => p.role === 'site_admin');

        if (!siteAdminPerm?.school_id) {
          setError('Site admin access required');
          setPermissionsLoading(false);
          return;
        }

        setSchoolId(siteAdminPerm.school_id);
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError('Failed to verify permissions');
      } finally {
        setPermissionsLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  // Data fetching hook
  const {
    bellSchedules,
    specialActivities,
    teachers,
    loading: dataLoading,
    refreshData
  } = useAdminScheduleData(schoolId);

  // Derive available activity types from the data
  const availableActivityTypes = useMemo(() => {
    const types = new Set<string>();
    specialActivities.forEach(activity => {
      if (activity.activity_name) {
        types.add(activity.activity_name);
      }
    });
    return Array.from(types).sort();
  }, [specialActivities]);

  // UI state management hook
  const {
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
    toggleDailyTimes,
  } = useAdminScheduleState(teachers, availableActivityTypes);

  // Get grade levels from selected teachers (for filtering bell schedules)
  const selectedTeacherGrades = useMemo(() => {
    if (selectedTeacherIds.size === 0) return null;

    const grades = new Set<string>();
    teachers.forEach(teacher => {
      if (selectedTeacherIds.has(teacher.id) && teacher.grade_level) {
        teacher.grade_level.split(',').forEach(g => grades.add(g.trim()));
      }
    });
    return grades.size > 0 ? grades : null;
  }, [selectedTeacherIds, teachers]);

  // Filter special activities by selected teachers, activity types, and view filter
  const filteredActivities = viewFilter === 'bell'
    ? []
    : specialActivities.filter(activity => {
        // Filter by activity type
        if (!activity.activity_name || !selectedActivityTypes.has(activity.activity_name)) {
          return false;
        }
        // Filter by teacher (if any teachers are selected)
        if (selectedTeacherIds.size > 0) {
          return activity.teacher_id && selectedTeacherIds.has(activity.teacher_id);
        }
        return true;
      });

  // Filter bell schedules by selected grades and view filter
  // When teachers are selected, also filter by their grade levels
  const filteredBellSchedules = viewFilter === 'activities'
    ? []
    : bellSchedules.filter(schedule => {
        if (!schedule.grade_level) return false;
        // grade_level can be comma-separated like "K,1,2"
        const grades = schedule.grade_level.split(',').map(g => g.trim());

        // Must match selected grades filter
        if (!grades.some(g => selectedGrades.has(g))) {
          return false;
        }

        // If teachers are selected, also filter by their grade levels
        if (selectedTeacherGrades) {
          return grades.some(g => selectedTeacherGrades.has(g));
        }

        return true;
      });

  const loading = permissionsLoading || dataLoading;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading master schedule...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center py-12">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Master Schedule</h1>
              <p className="text-gray-600">
                View and manage bell schedules and special activities for your school
              </p>
            </div>

            {/* View Filter Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewFilter('all')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  viewFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setViewFilter('bell')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  viewFilter === 'bell'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Bell Schedules
              </button>
              <button
                onClick={() => setViewFilter('activities')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  viewFilter === 'activities'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Special Activities
              </button>
            </div>
          </div>

          {/* Secondary Filters */}
          <div className={`mt-4 pt-4 border-t border-gray-200 flex gap-6 ${
            viewFilter === 'all' ? 'flex-row flex-wrap items-center' : 'flex-col'
          }`}>
            {/* Daily Times Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="show-daily-times"
                checked={showDailyTimes}
                onChange={toggleDailyTimes}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <label htmlFor="show-daily-times" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                Show Daily Times
              </label>
            </div>

            {/* Grade Filter - for bell schedules */}
            {viewFilter !== 'activities' && (
              <GradeFilter
                selectedGrades={selectedGrades}
                onToggleGrade={toggleGrade}
                onClearAll={clearGrades}
                onSelectAll={selectAllGrades}
              />
            )}

            {/* Activity Type Filter - for special activities */}
            {viewFilter !== 'bell' && (
              <ActivityTypeFilter
                selectedTypes={selectedActivityTypes}
                availableTypes={availableActivityTypes}
                onToggleType={toggleActivityType}
                onClearAll={clearActivityTypes}
                onSelectAll={selectAllActivityTypes}
                schoolId={schoolId}
                onAvailabilityChange={fetchActivityAvailability}
              />
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex gap-6">
          {/* Schedule Grid */}
          <div className="flex-1 min-w-0">
            <AdminScheduleGrid
              bellSchedules={filteredBellSchedules}
              specialActivities={filteredActivities}
              schoolId={schoolId}
              onRefresh={refreshData}
              viewFilter={viewFilter}
              showDailyTimes={showDailyTimes}
              allBellSchedules={bellSchedules}
              activityAvailability={activityAvailability}
            />
          </div>

          {/* Teacher Panel Sidebar */}
          <div className="w-64 flex-shrink-0">
            <TeacherPanel
              teachers={teachers}
              selectedTeacherIds={selectedTeacherIds}
              onToggleTeacher={toggleTeacher}
              onSelectAll={selectAllTeachers}
              onDeselectAll={deselectAllTeachers}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
