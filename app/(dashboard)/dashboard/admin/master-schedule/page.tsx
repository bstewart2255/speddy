'use client';

import { useState, useEffect } from 'react';
import { getCurrentAdminPermissions } from '../../../../../lib/supabase/queries/admin-accounts';
import { AdminScheduleGrid } from './components/admin-schedule-grid';
import { TeacherPanel } from './components/teacher-panel';
import { GradeFilter } from './components/grade-filter';
import { ActivityTypeFilter } from './components/activity-type-filter';
import { useAdminScheduleData } from './hooks/use-admin-schedule-data';
import { useAdminScheduleState } from './hooks/use-admin-schedule-state';

type ViewFilter = 'all' | 'bell' | 'activities';

export default function MasterSchedulePage() {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');

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

  // UI state management hook
  const {
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
    clearActivityTypes,
  } = useAdminScheduleState(teachers);

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
  const filteredBellSchedules = viewFilter === 'activities'
    ? []
    : bellSchedules.filter(schedule => {
        if (!schedule.grade_level) return false;
        // grade_level can be comma-separated like "K,1,2"
        const grades = schedule.grade_level.split(',').map(g => g.trim());
        return grades.some(g => selectedGrades.has(g));
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
            viewFilter === 'all' ? 'flex-row flex-wrap' : 'flex-col'
          }`}>
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
                onToggleType={toggleActivityType}
                onClearAll={clearActivityTypes}
                onSelectAll={selectAllActivityTypes}
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
