'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '../../../../../components/ui/button';
import { SPECIAL_ACTIVITY_TYPES } from '../../../../../../lib/constants/activity-types';
import type { Teacher } from '@/src/types/database';
import {
  createRotationPair,
  createRotationGroup,
  bulkAddRotationGroupMembers,
  getSchoolYearConfig,
  upsertSchoolYearConfig,
  bulkUpsertWeekAssignments,
  generateWeekDates,
  formatWeekRange,
  type RotationPairWithGroups,
  type CreateRotationGroupMemberInput,
  type CreateWeekAssignmentInput,
} from '../../../../../../lib/supabase/queries/rotation-groups';

interface RotationGroupModalProps {
  schoolId: string;
  teachers: Teacher[];
  existingPair?: RotationPairWithGroups;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

interface TeacherAssignment {
  teacherId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface GroupData {
  name: string;
  teacherIds: string[];
  assignments: TeacherAssignment[];
}

interface WeekAssignment {
  weekStartDate: string;
  groupAActivity: string | null;
  groupBActivity: string | null;
}

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
];

export function RotationGroupModal({
  schoolId,
  teachers,
  existingPair,
  onClose,
  onSuccess,
}: RotationGroupModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Activity pair selection
  const [activityA, setActivityA] = useState<string>(existingPair?.activity_type_a || '');
  const [activityB, setActivityB] = useState<string>(existingPair?.activity_type_b || '');

  // Step 2: Group and teacher assignment
  const [groupA, setGroupA] = useState<GroupData>({
    name: 'Group A',
    teacherIds: [],
    assignments: [],
  });
  const [groupB, setGroupB] = useState<GroupData>({
    name: 'Group B',
    teacherIds: [],
    assignments: [],
  });

  // Step 4: School year dates
  const [schoolYearStart, setSchoolYearStart] = useState<string>('');
  const [schoolYearEnd, setSchoolYearEnd] = useState<string>('');

  // Step 5: Week assignments
  const [weekAssignments, setWeekAssignments] = useState<WeekAssignment[]>([]);

  const modalRef = useRef<HTMLDivElement>(null);
  const headingId = 'rotation-group-modal-heading';

  // Load school year config on mount
  useEffect(() => {
    async function loadSchoolYearConfig() {
      try {
        const config = await getSchoolYearConfig(schoolId);
        if (config) {
          setSchoolYearStart(config.start_date);
          setSchoolYearEnd(config.end_date);
        } else {
          // Set defaults: current September to next June
          const now = new Date();
          const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
          setSchoolYearStart(`${year}-09-01`);
          setSchoolYearEnd(`${year + 1}-06-15`);
        }
      } catch (err) {
        console.error('Error loading school year config:', err);
      }
    }
    loadSchoolYearConfig();
  }, [schoolId]);

  // Load existing pair data if editing
  useEffect(() => {
    if (existingPair) {
      setActivityA(existingPair.activity_type_a);
      setActivityB(existingPair.activity_type_b);

      const groupAData = existingPair.groups.find(g => g.name === 'Group A');
      const groupBData = existingPair.groups.find(g => g.name === 'Group B');

      if (groupAData) {
        setGroupA({
          name: groupAData.name,
          teacherIds: groupAData.members.map(m => m.teacher_id),
          assignments: groupAData.members.map(m => ({
            teacherId: m.teacher_id,
            dayOfWeek: m.day_of_week,
            startTime: m.start_time.substring(0, 5),
            endTime: m.end_time.substring(0, 5),
          })),
        });
      }

      if (groupBData) {
        setGroupB({
          name: groupBData.name,
          teacherIds: groupBData.members.map(m => m.teacher_id),
          assignments: groupBData.members.map(m => ({
            teacherId: m.teacher_id,
            dayOfWeek: m.day_of_week,
            startTime: m.start_time.substring(0, 5),
            endTime: m.end_time.substring(0, 5),
          })),
        });
      }
    }
  }, [existingPair]);

  // Generate week assignments when dates change (not when activities change to preserve user edits)
  useEffect(() => {
    if (schoolYearStart && schoolYearEnd) {
      const weeks = generateWeekDates(schoolYearStart, schoolYearEnd);
      setWeekAssignments(prev => {
        // Preserve existing assignments where possible
        const existingMap = new Map(prev.map(w => [w.weekStartDate, w]));
        return weeks.map((weekStart, index) => {
          if (existingMap.has(weekStart)) {
            return existingMap.get(weekStart)!;
          }
          // Default: alternate weeks - A gets activityA on odd weeks, activityB on even
          const isOddWeek = index % 2 === 0;
          return {
            weekStartDate: weekStart,
            groupAActivity: isOddWeek ? activityA : activityB,
            groupBActivity: isOddWeek ? activityB : activityA,
          };
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolYearStart, schoolYearEnd]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  // Focus management
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  // Initialize missing assignments when entering Step 3
  // This ensures validation passes even if user accepts default values without interaction
  useEffect(() => {
    if (step === 3) {
      setGroupA(prev => {
        const missingTeachers = prev.teacherIds.filter(
          id => !prev.assignments.some(a => a.teacherId === id)
        );
        if (missingTeachers.length === 0) return prev;
        return {
          ...prev,
          assignments: [
            ...prev.assignments,
            ...missingTeachers.map(teacherId => ({
              teacherId,
              dayOfWeek: 1,
              startTime: '09:00',
              endTime: '10:00',
            })),
          ],
        };
      });
      setGroupB(prev => {
        const missingTeachers = prev.teacherIds.filter(
          id => !prev.assignments.some(a => a.teacherId === id)
        );
        if (missingTeachers.length === 0) return prev;
        return {
          ...prev,
          assignments: [
            ...prev.assignments,
            ...missingTeachers.map(teacherId => ({
              teacherId,
              dayOfWeek: 1,
              startTime: '09:00',
              endTime: '10:00',
            })),
          ],
        };
      });
    }
  }, [step]);

  // Available activity types (excluding already selected)
  const availableActivitiesA = SPECIAL_ACTIVITY_TYPES.filter(
    type => type !== activityB
  );
  const availableActivitiesB = SPECIAL_ACTIVITY_TYPES.filter(
    type => type !== activityA
  );

  // Teachers not assigned to either group
  const unassignedTeachers = useMemo(() => {
    return teachers.filter(
      t => !groupA.teacherIds.includes(t.id) && !groupB.teacherIds.includes(t.id)
    );
  }, [teachers, groupA.teacherIds, groupB.teacherIds]);

  // Validation for each step
  const canProceed = (currentStep: Step): boolean => {
    switch (currentStep) {
      case 1:
        return activityA !== '' && activityB !== '';
      case 2:
        return groupA.teacherIds.length > 0 && groupB.teacherIds.length > 0;
      case 3:
        return (
          groupA.assignments.length === groupA.teacherIds.length &&
          groupB.assignments.length === groupB.teacherIds.length
        );
      case 4:
        return schoolYearStart !== '' && schoolYearEnd !== '' &&
               new Date(schoolYearEnd) > new Date(schoolYearStart);
      case 5:
        return true; // Week assignments have defaults
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < 5 && canProceed(step)) {
      setStep((step + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const toggleTeacherInGroup = (teacherId: string, group: 'A' | 'B') => {
    const setGroup = group === 'A' ? setGroupA : setGroupB;
    const otherGroup = group === 'A' ? groupB : groupA;
    const setOtherGroup = group === 'A' ? setGroupB : setGroupA;

    setGroup(prev => {
      if (prev.teacherIds.includes(teacherId)) {
        // Uncheck - remove teacher
        return {
          ...prev,
          teacherIds: prev.teacherIds.filter(id => id !== teacherId),
          assignments: prev.assignments.filter(a => a.teacherId !== teacherId),
        };
      } else {
        // Check - add teacher
        // Remove from other group if present
        if (otherGroup.teacherIds.includes(teacherId)) {
          setOtherGroup(other => ({
            ...other,
            teacherIds: other.teacherIds.filter(id => id !== teacherId),
            assignments: other.assignments.filter(a => a.teacherId !== teacherId),
          }));
        }
        return { ...prev, teacherIds: [...prev.teacherIds, teacherId] };
      }
    });
  };

  const updateTeacherAssignment = (
    group: 'A' | 'B',
    teacherId: string,
    field: 'dayOfWeek' | 'startTime' | 'endTime',
    value: number | string
  ) => {
    const setGroup = group === 'A' ? setGroupA : setGroupB;
    setGroup(prev => {
      const existingIndex = prev.assignments.findIndex(a => a.teacherId === teacherId);
      const newAssignments = [...prev.assignments];

      if (existingIndex >= 0) {
        newAssignments[existingIndex] = {
          ...newAssignments[existingIndex],
          [field]: value,
        };
      } else {
        // Create new assignment with defaults
        newAssignments.push({
          teacherId,
          dayOfWeek: field === 'dayOfWeek' ? (value as number) : 1,
          startTime: field === 'startTime' ? (value as string) : '09:00',
          endTime: field === 'endTime' ? (value as string) : '10:00',
        });
      }

      return { ...prev, assignments: newAssignments };
    });
  };

  const toggleWeekAssignment = (
    weekIndex: number,
    group: 'A' | 'B',
    activity: string
  ) => {
    setWeekAssignments(prev => {
      const newAssignments = [...prev];
      const week = newAssignments[weekIndex];
      const field = group === 'A' ? 'groupAActivity' : 'groupBActivity';

      // Toggle: if already set to this activity, clear it; otherwise set it
      if (week[field] === activity) {
        newAssignments[weekIndex] = { ...week, [field]: null };
      } else {
        newAssignments[weekIndex] = { ...week, [field]: activity };
      }

      return newAssignments;
    });
  };

  const handleSave = async () => {
    setError(null);
    setLoading(true);

    try {
      // Step 1: Save school year config
      await upsertSchoolYearConfig(schoolId, schoolYearStart, schoolYearEnd);

      // Step 2: Create rotation pair
      const pair = await createRotationPair({
        school_id: schoolId,
        activity_type_a: activityA,
        activity_type_b: activityB,
      });

      // Step 3: Create groups
      const [createdGroupA, createdGroupB] = await Promise.all([
        createRotationGroup({ pair_id: pair.id, name: groupA.name }),
        createRotationGroup({ pair_id: pair.id, name: groupB.name }),
      ]);

      // Step 4: Add members to groups
      const groupAMembers: CreateRotationGroupMemberInput[] = groupA.assignments.map(a => ({
        group_id: createdGroupA.id,
        teacher_id: a.teacherId,
        day_of_week: a.dayOfWeek,
        start_time: a.startTime,
        end_time: a.endTime,
      }));

      const groupBMembers: CreateRotationGroupMemberInput[] = groupB.assignments.map(a => ({
        group_id: createdGroupB.id,
        teacher_id: a.teacherId,
        day_of_week: a.dayOfWeek,
        start_time: a.startTime,
        end_time: a.endTime,
      }));

      await Promise.all([
        groupAMembers.length > 0 ? bulkAddRotationGroupMembers(groupAMembers) : Promise.resolve([]),
        groupBMembers.length > 0 ? bulkAddRotationGroupMembers(groupBMembers) : Promise.resolve([]),
      ]);

      // Step 5: Save week assignments
      const weekAssignmentInputs: CreateWeekAssignmentInput[] = [];
      for (const week of weekAssignments) {
        if (week.groupAActivity) {
          weekAssignmentInputs.push({
            pair_id: pair.id,
            week_start_date: week.weekStartDate,
            group_id: createdGroupA.id,
            activity_type: week.groupAActivity,
          });
        }
        if (week.groupBActivity) {
          weekAssignmentInputs.push({
            pair_id: pair.id,
            week_start_date: week.weekStartDate,
            group_id: createdGroupB.id,
            activity_type: week.groupBActivity,
          });
        }
      }

      if (weekAssignmentInputs.length > 0) {
        await bulkUpsertWeekAssignments(weekAssignmentInputs);
      }

      onSuccess();
    } catch (err) {
      console.error('Error saving rotation group:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save rotation group';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatTeacherName = (teacher: Teacher): string => {
    if (teacher.first_name && teacher.last_name) {
      return `${teacher.first_name} ${teacher.last_name}`;
    }
    return teacher.last_name || teacher.first_name || 'Unknown';
  };

  const getTeacherById = (id: string): Teacher | undefined => {
    return teachers.find(t => t.id === id);
  };

  const getAssignment = (group: GroupData, teacherId: string): TeacherAssignment | undefined => {
    return group.assignments.find(a => a.teacherId === teacherId);
  };

  const stepTitles: Record<Step, string> = {
    1: 'Select Activities',
    2: 'Assign Teachers',
    3: 'Set Schedules',
    4: 'School Year',
    5: 'Weekly Calendar',
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <h2 id={headingId} className="text-lg font-semibold text-gray-900">
            {existingPair ? 'Edit Rotation Group' : 'Create Rotation Group'}
          </h2>
          <div className="flex items-center gap-2 mt-2">
            {([1, 2, 3, 4, 5] as Step[]).map(s => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    s === step
                      ? 'bg-blue-600 text-white'
                      : s < step
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {s < step ? '✓' : s}
                </div>
                {s < 5 && (
                  <div
                    className={`w-8 h-0.5 ${
                      s < step ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
            <span className="ml-2 text-sm text-gray-600">{stepTitles[step]}</span>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-4">
              {error}
            </div>
          )}

          {/* Step 1: Activity Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Select two activities that will rotate between teacher groups each week.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Activity A
                  </label>
                  <select
                    value={activityA}
                    onChange={e => setActivityA(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select activity...</option>
                    {availableActivitiesA.map(type => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Activity B
                  </label>
                  <select
                    value={activityB}
                    onChange={e => setActivityB(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select activity...</option>
                    {availableActivitiesB.map(type => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activityA && activityB && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                  Teachers in Group A and Group B will rotate between {activityA} and {activityB} on a weekly basis.
                </div>
              )}
            </div>
          )}

          {/* Step 2: Teacher Assignment */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Assign teachers to Group A and Group B.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Group A */}
                <div className="border border-gray-200 rounded-lg p-3">
                  <h3 className="font-medium text-gray-900 mb-2">
                    Group A ({groupA.teacherIds.length} teachers)
                  </h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {teachers.map(teacher => (
                      <label
                        key={teacher.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                          groupA.teacherIds.includes(teacher.id)
                            ? 'bg-blue-50'
                            : groupB.teacherIds.includes(teacher.id)
                            ? 'opacity-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={groupA.teacherIds.includes(teacher.id)}
                          onChange={() => toggleTeacherInGroup(teacher.id, 'A')}
                          disabled={groupB.teacherIds.includes(teacher.id)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm">{formatTeacherName(teacher)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Group B */}
                <div className="border border-gray-200 rounded-lg p-3">
                  <h3 className="font-medium text-gray-900 mb-2">
                    Group B ({groupB.teacherIds.length} teachers)
                  </h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {teachers.map(teacher => (
                      <label
                        key={teacher.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                          groupB.teacherIds.includes(teacher.id)
                            ? 'bg-green-50'
                            : groupA.teacherIds.includes(teacher.id)
                            ? 'opacity-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={groupB.teacherIds.includes(teacher.id)}
                          onChange={() => toggleTeacherInGroup(teacher.id, 'B')}
                          disabled={groupA.teacherIds.includes(teacher.id)}
                          className="w-4 h-4 text-green-600"
                        />
                        <span className="text-sm">{formatTeacherName(teacher)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {unassignedTeachers.length > 0 && (
                <p className="text-xs text-gray-500">
                  {unassignedTeachers.length} teacher{unassignedTeachers.length !== 1 ? 's' : ''} not assigned
                </p>
              )}
            </div>
          )}

          {/* Step 3: Schedule Assignment */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Set the day and time each teacher attends the rotation activity.
              </p>

              {/* Group A Schedules */}
              <div className="border border-gray-200 rounded-lg p-3">
                <h3 className="font-medium text-gray-900 mb-3">Group A Schedules</h3>
                <div className="space-y-3">
                  {[...groupA.teacherIds].map(teacherId => {
                    const teacher = getTeacherById(teacherId);
                    const assignment = getAssignment(groupA, teacherId);
                    return (
                      <div key={teacherId} className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-medium w-32 truncate">
                          {teacher ? formatTeacherName(teacher) : 'Unknown'}
                        </span>
                        <select
                          value={assignment?.dayOfWeek || 1}
                          onChange={e => updateTeacherAssignment('A', teacherId, 'dayOfWeek', parseInt(e.target.value))}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          {DAYS.map(day => (
                            <option key={day.value} value={day.value}>
                              {day.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="time"
                          value={assignment?.startTime || '09:00'}
                          onChange={e => updateTeacherAssignment('A', teacherId, 'startTime', e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <span className="text-gray-500">-</span>
                        <input
                          type="time"
                          value={assignment?.endTime || '10:00'}
                          onChange={e => updateTeacherAssignment('A', teacherId, 'endTime', e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Group B Schedules */}
              <div className="border border-gray-200 rounded-lg p-3">
                <h3 className="font-medium text-gray-900 mb-3">Group B Schedules</h3>
                <div className="space-y-3">
                  {[...groupB.teacherIds].map(teacherId => {
                    const teacher = getTeacherById(teacherId);
                    const assignment = getAssignment(groupB, teacherId);
                    return (
                      <div key={teacherId} className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-medium w-32 truncate">
                          {teacher ? formatTeacherName(teacher) : 'Unknown'}
                        </span>
                        <select
                          value={assignment?.dayOfWeek || 1}
                          onChange={e => updateTeacherAssignment('B', teacherId, 'dayOfWeek', parseInt(e.target.value))}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          {DAYS.map(day => (
                            <option key={day.value} value={day.value}>
                              {day.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="time"
                          value={assignment?.startTime || '09:00'}
                          onChange={e => updateTeacherAssignment('B', teacherId, 'startTime', e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <span className="text-gray-500">-</span>
                        <input
                          type="time"
                          value={assignment?.endTime || '10:00'}
                          onChange={e => updateTeacherAssignment('B', teacherId, 'endTime', e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: School Year Dates */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Set the school year dates. This will be used to generate the weekly calendar.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    School Year Start
                  </label>
                  <input
                    type="date"
                    value={schoolYearStart}
                    onChange={e => setSchoolYearStart(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    School Year End
                  </label>
                  <input
                    type="date"
                    value={schoolYearEnd}
                    onChange={e => setSchoolYearEnd(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {schoolYearStart && schoolYearEnd && (
                <p className="text-sm text-gray-600">
                  {generateWeekDates(schoolYearStart, schoolYearEnd).length} weeks in school year
                </p>
              )}
            </div>
          )}

          {/* Step 5: Weekly Calendar */}
          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Assign activities to each group for each week. Check the boxes to indicate which group has which activity.
              </p>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Week</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-700">{activityA}</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-700">{activityB}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {weekAssignments.map((week, index) => (
                      <tr key={week.weekStartDate} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-900">
                          {formatWeekRange(week.weekStartDate)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-center gap-2">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={week.groupAActivity === activityA}
                                onChange={() => toggleWeekAssignment(index, 'A', activityA)}
                                className="w-3 h-3 text-blue-600"
                              />
                              <span className="text-xs text-gray-600">A</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={week.groupBActivity === activityA}
                                onChange={() => toggleWeekAssignment(index, 'B', activityA)}
                                className="w-3 h-3 text-green-600"
                              />
                              <span className="text-xs text-gray-600">B</span>
                            </label>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-center gap-2">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={week.groupAActivity === activityB}
                                onChange={() => toggleWeekAssignment(index, 'A', activityB)}
                                className="w-3 h-3 text-blue-600"
                              />
                              <span className="text-xs text-gray-600">A</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={week.groupBActivity === activityB}
                                onChange={() => toggleWeekAssignment(index, 'B', activityB)}
                                className="w-3 h-3 text-green-600"
                              />
                              <span className="text-xs text-gray-600">B</span>
                            </label>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between flex-shrink-0">
          <Button
            variant="secondary"
            onClick={step === 1 ? onClose : handleBack}
            disabled={loading}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          <div className="flex gap-2">
            {step < 5 ? (
              <Button
                variant="primary"
                onClick={handleNext}
                disabled={!canProceed(step)}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
