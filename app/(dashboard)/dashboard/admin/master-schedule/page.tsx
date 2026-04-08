'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getCurrentAdminPermissions } from '../../../../../lib/supabase/queries/admin-accounts';
import { AdminScheduleGrid } from './components/admin-schedule-grid';
import { TeacherPanel } from './components/teacher-panel';
import { RotationGroupsPanel } from './components/rotation-groups-panel';
import { RotationGroupModal } from './components/rotation-group-modal';
import { GradeFilter } from './components/grade-filter';
import { ActivityTypeFilter } from './components/activity-type-filter';
import { useAdminScheduleData } from './hooks/use-admin-schedule-data';
import { useAdminScheduleState } from './hooks/use-admin-schedule-state';
import { getActivityAvailabilityWithTimeRanges, getConfiguredActivityTypes, FullDayAvailability } from '../../../../../lib/supabase/queries/activity-availability';
import { getRotationPairsWithGroups, type RotationPairWithGroups } from '../../../../../lib/supabase/queries/rotation-groups';
import { getCurrentSchoolYear, getNextSchoolYear } from '../../../../../lib/school-year';
import { checkYearActivated, activateSchoolYear, copyScheduleToNextYear } from '../../../../../lib/supabase/queries/school-year-copy';
import { SchoolYearToggle } from './components/school-year-toggle';
import { YearActivationDialog } from './components/year-activation-dialog';

type ViewFilter = 'all' | 'bell' | 'activities' | 'yard-duty';

export default function MasterSchedulePage() {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [activityAvailability, setActivityAvailability] = useState<Map<string, FullDayAvailability>>(new Map());
  const [configuredActivityTypes, setConfiguredActivityTypes] = useState<string[]>([]);

  // School year state
  const currentYear = getCurrentSchoolYear();
  const nextYear = getNextSchoolYear();
  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>(currentYear);
  const [nextYearActivated, setNextYearActivated] = useState(false);
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [activating, setActivating] = useState(false);

  // Rotation groups state
  const [rotationPairs, setRotationPairs] = useState<RotationPairWithGroups[]>([]);
  const [rotationPairsLoading, setRotationPairsLoading] = useState(false);
  const [showRotationModal, setShowRotationModal] = useState(false);
  const [editingPair, setEditingPair] = useState<RotationPairWithGroups | undefined>(undefined);

  // Fetch activity availability and configured types for the school
  const fetchActivityAvailability = useCallback(async () => {
    if (!schoolId) return;
    try {
      const [availability, configuredTypes] = await Promise.all([
        getActivityAvailabilityWithTimeRanges(schoolId, selectedSchoolYear),
        getConfiguredActivityTypes(schoolId, selectedSchoolYear),
      ]);
      setActivityAvailability(availability);
      setConfiguredActivityTypes(configuredTypes);
    } catch (err) {
      console.error('Error fetching activity availability:', err);
    }
  }, [schoolId, selectedSchoolYear]);

  // Fetch rotation pairs for the school
  const fetchRotationPairs = useCallback(async () => {
    if (!schoolId) return;
    setRotationPairsLoading(true);
    try {
      const pairs = await getRotationPairsWithGroups(schoolId, selectedSchoolYear);
      setRotationPairs(pairs);
    } catch (err) {
      console.error('Error fetching rotation pairs:', err);
    } finally {
      setRotationPairsLoading(false);
    }
  }, [schoolId, selectedSchoolYear]);

  // Fetch availability and rotation pairs when schoolId or school year changes
  useEffect(() => {
    if (schoolId) {
      fetchActivityAvailability();
      fetchRotationPairs();
    }
  }, [schoolId, fetchActivityAvailability, fetchRotationPairs]);

  // Check if next year has been activated when schoolId is available
  useEffect(() => {
    if (schoolId) {
      checkYearActivated(schoolId, nextYear)
        .then(setNextYearActivated)
        .catch((err) => {
          console.warn('Failed to check year activation status:', err);
          setNextYearActivated(false);
        });
    }
  }, [schoolId, nextYear]);

  // Handle clicking the next year button when not yet activated
  const handleNextYearClick = () => {
    setShowActivationDialog(true);
  };

  // Activate with copy: copy all items from current year, then activate
  const handleActivateWithCopy = async () => {
    if (!schoolId) return;
    setActivating(true);
    try {
      await copyScheduleToNextYear(schoolId, currentYear, nextYear);
      await activateSchoolYear(schoolId, nextYear);
      setNextYearActivated(true);
      setShowActivationDialog(false);
      setSelectedSchoolYear(nextYear);
    } catch (err: any) {
      console.error('Error activating with copy:', err);
      // If copy succeeded but activate failed, retry activation
      if (err.message?.includes('already has data')) {
        try {
          await activateSchoolYear(schoolId, nextYear);
          setNextYearActivated(true);
          setShowActivationDialog(false);
          setSelectedSchoolYear(nextYear);
          return;
        } catch (activateErr: any) {
          console.error('Error activating after partial copy:', activateErr);
        }
      }
      alert(err.message || 'Failed to copy schedule to next year');
    } finally {
      setActivating(false);
    }
  };

  // Activate blank: activate the year without copying items
  const handleActivateBlank = async () => {
    if (!schoolId) return;
    setActivating(true);
    try {
      await activateSchoolYear(schoolId, nextYear);
      setNextYearActivated(true);
      setShowActivationDialog(false);
      setSelectedSchoolYear(nextYear);
    } catch (err: any) {
      console.error('Error activating school year:', err);
      alert(err.message || 'Failed to activate school year');
    } finally {
      setActivating(false);
    }
  };

  // Handlers for rotation groups modal
  const handleCreateGroups = () => {
    setEditingPair(undefined);
    setShowRotationModal(true);
  };

  const handleEditPair = (pair: RotationPairWithGroups) => {
    // Always use the unfiltered pair so the edit modal sees all members
    const fullPair = rotationPairs.find(p => p.id === pair.id) || pair;
    setEditingPair(fullPair);
    setShowRotationModal(true);
  };

  const handleRotationModalClose = () => {
    setShowRotationModal(false);
    setEditingPair(undefined);
  };

  const handleRotationModalSuccess = () => {
    setShowRotationModal(false);
    setEditingPair(undefined);
    fetchRotationPairs();
  };

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
    yardDutyAssignments,
    staffMembers,
    loading: dataLoading,
    refreshData
  } = useAdminScheduleData(schoolId, selectedSchoolYear);

  // Derive available activity types from scheduled activities AND configured types
  const availableActivityTypes = useMemo(() => {
    const types = new Set<string>();
    // Add types from scheduled activities
    specialActivities.forEach(activity => {
      if (activity.activity_name) {
        types.add(activity.activity_name);
      }
    });
    // Add types that have availability configured (even if not scheduled yet)
    configuredActivityTypes.forEach(type => {
      types.add(type);
    });
    // Add types from rotation pairs
    rotationPairs.forEach(pair => {
      if (pair.activity_type_a) types.add(pair.activity_type_a);
      if (pair.activity_type_b) types.add(pair.activity_type_b);
    });
    return Array.from(types).sort();
  }, [specialActivities, configuredActivityTypes, rotationPairs]);

  // Track which activity types are currently in use (have scheduled activities)
  const inUseActivityTypes = useMemo(() => {
    const types = new Set<string>();
    specialActivities.forEach(activity => {
      if (activity.activity_name) {
        types.add(activity.activity_name);
      }
    });
    rotationPairs.forEach(pair => {
      if (pair.activity_type_a) types.add(pair.activity_type_a);
      if (pair.activity_type_b) types.add(pair.activity_type_b);
    });
    return types;
  }, [specialActivities, rotationPairs]);

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
  const filteredActivities = (viewFilter === 'bell' || viewFilter === 'yard-duty')
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
  const filteredBellSchedules = (viewFilter === 'activities' || viewFilter === 'yard-duty')
    ? []
    : bellSchedules.filter(schedule => {
        if (!schedule.grade_level) return false;
        // grade_level can be comma-separated like "K,1,2"
        const grades = schedule.grade_level.split(',').map(g => g.trim());

        // Must match selected grades filter
        if (!grades.some(g => selectedGrades.has(g))) {
          return false;
        }

        // If teachers are selected, filter by their grade levels
        // If selected teachers have no grade levels, hide bell schedules
        if (selectedTeacherIds.size > 0) {
          if (!selectedTeacherGrades) return false;
          return grades.some(g => selectedTeacherGrades.has(g));
        }

        return true;
      });

  // Filter rotation pairs by selected activity types, teacher selection, and view filter
  const filteredRotationPairs = (viewFilter === 'bell' || viewFilter === 'yard-duty')
    ? []
    : rotationPairs
        .filter(pair =>
          selectedActivityTypes.has(pair.activity_type_a) ||
          selectedActivityTypes.has(pair.activity_type_b)
        )
        .map(pair => {
          // If no teachers selected, show all members
          if (selectedTeacherIds.size === 0) return pair;
          // Filter groups to only include members matching selected teachers
          const filteredGroups = pair.groups
            .map(group => ({
              ...group,
              members: group.members.filter(member =>
                member.teacher_id && selectedTeacherIds.has(member.teacher_id)
              ),
            }))
            .filter(group => group.members.length > 0);
          return { ...pair, groups: filteredGroups };
        })
        .filter(pair => selectedTeacherIds.size === 0 || pair.groups.length > 0);

  // Filter yard duty assignments by selected teachers and view filter
  const filteredYardDuty = (viewFilter === 'bell' || viewFilter === 'activities')
    ? []
    : yardDutyAssignments.filter(yd => {
        if (selectedTeacherIds.size > 0) {
          return yd.teacher_id && selectedTeacherIds.has(yd.teacher_id);
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
                View and manage your school year calendars
              </p>
            </div>

            <div className="flex items-center gap-4">
            {/* School Year Toggle */}
            <SchoolYearToggle
              currentYear={currentYear}
              nextYear={nextYear}
              selectedYear={selectedSchoolYear}
              onSelectYear={setSelectedSchoolYear}
              nextYearActivated={nextYearActivated}
              onNextYearClick={handleNextYearClick}
            />

            {/* View Filter Toggle */}
            <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-1">
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
              <button
                onClick={() => setViewFilter('yard-duty')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  viewFilter === 'yard-duty'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Yard Duty
              </button>
            </div>
            </div>
          </div>

          {/* Secondary Filters */}
          <div className={`mt-4 pt-4 border-t border-gray-200 flex gap-6 ${
            viewFilter === 'all' ? 'flex-row flex-wrap items-center' : 'flex-col'
          }`}>
            {/* Grade Filter - for bell schedules */}
            {viewFilter !== 'activities' && viewFilter !== 'yard-duty' && (
              <GradeFilter
                selectedGrades={selectedGrades}
                onToggleGrade={toggleGrade}
                onClearAll={clearGrades}
                onSelectAll={selectAllGrades}
              />
            )}

            {/* Activity Type Filter - for special activities */}
            {viewFilter !== 'bell' && viewFilter !== 'yard-duty' && (
              <ActivityTypeFilter
                selectedTypes={selectedActivityTypes}
                availableTypes={availableActivityTypes}
                onToggleType={toggleActivityType}
                onClearAll={clearActivityTypes}
                onSelectAll={selectAllActivityTypes}
                schoolId={schoolId}
                onAvailabilityChange={fetchActivityAvailability}
                inUseActivityTypes={inUseActivityTypes}
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
              allSpecialActivities={specialActivities}
              schoolId={schoolId}
              onRefresh={refreshData}
              viewFilter={viewFilter}
              showDailyTimes={showDailyTimes}
              allBellSchedules={bellSchedules}
              activityAvailability={activityAvailability}
              availableActivityTypes={availableActivityTypes}
              rotationPairs={filteredRotationPairs}
              onEditRotationPair={handleEditPair}
              filterSelectedGrades={selectedGrades}
              teachers={teachers}
              staffMembers={staffMembers}
              yardDutyAssignments={filteredYardDuty}
              schoolYear={selectedSchoolYear}
            />
            {/* Daily Times Toggle */}
            <div className="flex items-center gap-2 mt-3">
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
            <RotationGroupsPanel
              rotationPairs={rotationPairs}
              onCreateGroups={handleCreateGroups}
              onEditPair={handleEditPair}
              onRefresh={fetchRotationPairs}
              loading={rotationPairsLoading}
            />
          </div>
        </div>
      </div>

      {/* Year Activation Dialog */}
      <YearActivationDialog
        open={showActivationDialog}
        onClose={() => setShowActivationDialog(false)}
        onActivateWithCopy={handleActivateWithCopy}
        onActivateBlank={handleActivateBlank}
        currentYear={currentYear}
        nextYear={nextYear}
        loading={activating}
      />

      {/* Rotation Group Modal */}
      {showRotationModal && schoolId && (
        <RotationGroupModal
          schoolId={schoolId}
          teachers={teachers}
          existingPair={editingPair}
          onClose={handleRotationModalClose}
          onSuccess={handleRotationModalSuccess}
          schoolYear={selectedSchoolYear}
        />
      )}
    </div>
  );
}
