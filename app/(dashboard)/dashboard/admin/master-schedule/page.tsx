'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCurrentAdminPermissions } from '../../../../../lib/supabase/queries/admin-accounts';
import { AdminScheduleGrid } from './components/admin-schedule-grid';
import { TeacherPanel } from './components/teacher-panel';
import { useAdminScheduleData } from './hooks/use-admin-schedule-data';
import { useAdminScheduleState } from './hooks/use-admin-schedule-state';

export default function MasterSchedulePage() {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

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
    toggleTeacher,
    selectAllTeachers,
    deselectAllTeachers,
    toggleGrade,
  } = useAdminScheduleState(teachers);

  // Filter special activities by selected teachers
  const filteredActivities = selectedTeacherIds.size === 0
    ? specialActivities
    : specialActivities.filter(activity =>
        activity.teacher_id && selectedTeacherIds.has(activity.teacher_id)
      );

  // Filter bell schedules by selected grades
  const filteredBellSchedules = selectedGrades.size === 0
    ? bellSchedules
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Master Schedule</h1>
          <p className="text-gray-600">
            View and manage bell schedules and special activities for your school
          </p>
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
