'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '../../../../../components/ui/button';
import { deleteBellScheduleAsAdmin, updateBellScheduleAsAdmin } from '../../../../../../lib/supabase/queries/bell-schedules';
import { deleteSpecialActivityAsAdmin, updateSpecialActivityAsAdmin } from '../../../../../../lib/supabase/queries/special-activities';
import { updateYardDutyAssignment, deleteYardDutyAssignment } from '../../../../../../lib/supabase/queries/yard-duty';
import { SPECIAL_ACTIVITY_TYPES, BELL_SCHEDULE_ACTIVITIES } from '../../../../../../lib/constants/activity-types';
import { TeacherAutocomplete } from '../../../../../components/teachers/teacher-autocomplete';
import type { SpecialActivity, Teacher, YardDutyAssignment } from '@/src/types/database';
import type { StaffWithHours, ProviderOption } from '../../../../../../lib/supabase/queries/staff';
import type { BellScheduleWithCreator } from '../types';

interface EditItemModalProps {
  type: 'bell' | 'activity' | 'yard-duty';
  item: BellScheduleWithCreator | SpecialActivity | YardDutyAssignment;
  schoolId: string;
  onClose: () => void;
  onSuccess: () => void;
  availableActivityTypes?: string[];
  bellSchedules?: BellScheduleWithCreator[];
  teachers?: Teacher[];
  staffMembers?: StaffWithHours[];
  providers?: ProviderOption[];
  yardDutyAssignments?: YardDutyAssignment[];
  specialActivities?: SpecialActivity[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAILY_TIME_PERIOD_NAMES = ['School Start', 'Dismissal', 'Early Dismissal'] as const;

// Helper to add minutes to a time string
const addMinutesToTime = (time: string, minutes: number): string => {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + minutes;
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
};

export function EditItemModal({
  type,
  item,
  schoolId,
  onClose,
  onSuccess,
  availableActivityTypes = [],
  bellSchedules = [],
  teachers = [],
  staffMembers = [],
  providers = [],
  yardDutyAssignments = [],
  specialActivities = []
}: EditItemModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const headingId = 'edit-modal-heading';

  // Form state for activities
  const activity = type === 'activity' ? item as SpecialActivity : null;
  const [activityName, setActivityName] = useState(activity?.activity_name || '');
  const [startTime, setStartTime] = useState(activity?.start_time || '');
  const [endTime, setEndTime] = useState(activity?.end_time || '');

  // Form state for bell schedules
  const bellSchedule = type === 'bell' ? item as BellScheduleWithCreator : null;
  const [bellPeriodName, setBellPeriodName] = useState(bellSchedule?.period_name || '');
  const [bellStartTime, setBellStartTime] = useState(bellSchedule?.start_time || '');
  const [bellEndTime, setBellEndTime] = useState(bellSchedule?.end_time || '');

  // Form state for yard duty
  const yardDuty = type === 'yard-duty' ? item as YardDutyAssignment : null;
  const [ydPeriodName, setYdPeriodName] = useState(yardDuty?.period_name || '');
  const [ydZoneName, setYdZoneName] = useState(yardDuty?.zone_name || '');
  const [ydStartTime, setYdStartTime] = useState(yardDuty?.start_time || '');
  const [ydEndTime, setYdEndTime] = useState(yardDuty?.end_time || '');

  // Yard duty assignee state
  const initialAssigneeType = yardDuty?.teacher_id ? 'teacher' : yardDuty?.staff_id ? 'staff' : yardDuty?.provider_id ? 'provider' : '';
  const [ydAssigneeType, setYdAssigneeType] = useState<'teacher' | 'staff' | 'provider' | ''>(initialAssigneeType);
  const [ydTeacherId, setYdTeacherId] = useState<string | null>(yardDuty?.teacher_id || null);
  const [ydTeacherName, setYdTeacherName] = useState(yardDuty?.teacher_id ? (yardDuty?.assignee_name || '') : '');
  const [ydStaffId, setYdStaffId] = useState<string | null>(yardDuty?.staff_id || null);
  const [ydStaffName, setYdStaffName] = useState(yardDuty?.staff_id ? (yardDuty?.assignee_name || '') : '');
  const [ydProviderId, setYdProviderId] = useState<string | null>(yardDuty?.provider_id || null);
  const [ydProviderName, setYdProviderName] = useState(yardDuty?.provider_id ? (yardDuty?.assignee_name || '') : '');

  // Get existing period/zone names for datalist suggestions
  const existingPeriodNames = useMemo(() => {
    const names = new Set<string>();
    yardDutyAssignments.forEach(yd => names.add(yd.period_name));
    return Array.from(names).sort();
  }, [yardDutyAssignments]);

  const existingZoneNames = useMemo(() => {
    const names = new Set<string>();
    yardDutyAssignments.forEach(yd => {
      if (yd.zone_name) names.add(yd.zone_name);
    });
    return Array.from(names).sort();
  }, [yardDutyAssignments]);

  // Conflict detection: yard duty teacher vs their special activities
  const ydConflictWarning = useMemo(() => {
    if (type !== 'yard-duty' || !ydTeacherId || !ydStartTime || !ydEndTime) return null;

    const normTime = (t: string) => t.substring(0, 5);
    const start = normTime(ydStartTime);
    const end = normTime(ydEndTime);
    const dayOfWeek = item.day_of_week;

    const conflicts = specialActivities.filter(a => {
      if (a.teacher_id !== ydTeacherId || !a.start_time || !a.end_time) return false;
      if (a.day_of_week !== dayOfWeek) return false;
      const aStart = normTime(a.start_time);
      const aEnd = normTime(a.end_time);
      return start < aEnd && aStart < end;
    });

    if (conflicts.length === 0) return null;

    const descriptions = conflicts.map(c =>
      `${c.activity_name} (${normTime(c.start_time!)}–${normTime(c.end_time!)})`
    );
    return `This overlaps with: ${descriptions.join(', ')}`;
  }, [type, ydTeacherId, ydStartTime, ydEndTime, item.day_of_week, specialActivities]);

  // Conflict detection: special activity teacher vs their yard duty
  const yardDutyConflictWarning = useMemo(() => {
    if (type !== 'activity' || !activity?.teacher_id || !startTime || !endTime) return null;

    const normTime = (t: string) => t.substring(0, 5);
    const actStart = normTime(startTime);
    const actEnd = normTime(endTime);
    const dayOfWeek = item.day_of_week;

    const conflicts = yardDutyAssignments.filter(yd => {
      if (yd.teacher_id !== activity.teacher_id || !yd.start_time || !yd.end_time) return false;
      if (yd.day_of_week !== dayOfWeek) return false;
      const ydStart = normTime(yd.start_time);
      const ydEnd = normTime(yd.end_time);
      return actStart < ydEnd && ydStart < actEnd;
    });

    if (conflicts.length === 0) return null;

    const descriptions = conflicts.map(c =>
      `${c.period_name}${c.zone_name ? ` (${c.zone_name})` : ''} (${normTime(c.start_time)}–${normTime(c.end_time)})`
    );
    return `This overlaps with yard duty: ${descriptions.join(', ')}`;
  }, [type, activity, startTime, endTime, item.day_of_week, yardDutyAssignments]);

  // Check if activity conflicts with a bell schedule for the teacher's grade
  const bellScheduleConflictWarning = useMemo(() => {
    if (type !== 'activity' || !activity?.teacher_id || !startTime || !endTime) return null;

    const teacher = teachers.find(t => t.id === activity.teacher_id);
    if (!teacher?.grade_level) return null;

    const teacherGrades = teacher.grade_level.split(',').map(g => g.trim());
    const dayOfWeek = item.day_of_week;
    // Normalize to HH:MM to avoid format mismatch (input gives HH:MM, Supabase may give HH:MM:SS)
    const normTime = (t: string) => t.substring(0, 5);
    const actStart = normTime(startTime);
    const actEnd = normTime(endTime);

    const conflicts = bellSchedules.filter(schedule => {
      if (!schedule.day_of_week || !schedule.start_time || !schedule.end_time || !schedule.grade_level) return false;
      if (schedule.day_of_week !== dayOfWeek) return false;

      const scheduleGrades = schedule.grade_level.split(',').map(g => g.trim());
      const gradesOverlap = scheduleGrades.some(g => teacherGrades.includes(g));
      if (!gradesOverlap) return false;

      const schedStart = normTime(schedule.start_time);
      const schedEnd = normTime(schedule.end_time);
      return actStart < schedEnd && schedStart < actEnd;
    });

    if (conflicts.length === 0) return null;

    const descriptions = conflicts.map(c =>
      `${c.grade_level} ${c.period_name} (${normTime(c.start_time!)}–${normTime(c.end_time!)})`
    );
    return `This overlaps with: ${descriptions.join(', ')}`;
  }, [type, activity, teachers, bellSchedules, item.day_of_week, startTime, endTime]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  // Focus trap and initial focus
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (type === 'bell') {
        await deleteBellScheduleAsAdmin(item.id, schoolId);
      } else if (type === 'yard-duty') {
        await deleteYardDutyAssignment(item.id, schoolId);
      } else {
        await deleteSpecialActivityAsAdmin(item.id, schoolId);
      }
      onSuccess();
    } catch (err: any) {
      console.error('Error deleting item:', err);
      setError(err.message || 'Failed to delete item');
      setConfirmDelete(false);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (type !== 'activity') return;

    // Validate times
    if (startTime && endTime && startTime >= endTime) {
      setError('End time must be after start time');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await updateSpecialActivityAsAdmin(item.id, schoolId, {
        activity_name: activityName,
        start_time: startTime,
        end_time: endTime
      });
      onSuccess();
    } catch (err: any) {
      console.error('Error updating activity:', err);
      setError(err.message || 'Failed to update activity');
    } finally {
      setLoading(false);
    }
  };

  // Check if this is a daily time marker
  const isDailyTimeMarker = bellPeriodName && DAILY_TIME_PERIOD_NAMES.includes(bellPeriodName as typeof DAILY_TIME_PERIOD_NAMES[number]);

  const handleBellUpdate = async () => {
    if (type !== 'bell') return;

    // For daily time markers, auto-calculate end_time as start_time + 1 minute
    const effectiveEndTime = isDailyTimeMarker ? addMinutesToTime(bellStartTime, 1) : bellEndTime;

    // Validate times (skip for daily time markers since we auto-calculate)
    if (!isDailyTimeMarker && bellStartTime && effectiveEndTime && bellStartTime >= effectiveEndTime) {
      setError('End time must be after start time');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await updateBellScheduleAsAdmin(item.id, schoolId, {
        period_name: bellPeriodName,
        start_time: bellStartTime,
        end_time: effectiveEndTime
      });
      onSuccess();
    } catch (err: any) {
      console.error('Error updating bell schedule:', err);
      setError(err.message || 'Failed to update bell schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleYardDutyUpdate = async () => {
    if (type !== 'yard-duty') return;

    if (ydStartTime && ydEndTime && ydStartTime >= ydEndTime) {
      setError('End time must be after start time');
      return;
    }

    if (!ydAssigneeType) {
      setError('Please select an assignee');
      return;
    }
    if (ydAssigneeType === 'teacher' && !ydTeacherId) {
      setError('Please select a teacher');
      return;
    }
    if (ydAssigneeType === 'staff' && !ydStaffId) {
      setError('Please select a staff member');
      return;
    }
    if (ydAssigneeType === 'provider' && !ydProviderId) {
      setError('Please select a provider');
      return;
    }

    const assigneeName = ydAssigneeType === 'teacher' ? ydTeacherName
      : ydAssigneeType === 'staff' ? ydStaffName
      : ydProviderName;

    setError(null);
    setLoading(true);

    try {
      await updateYardDutyAssignment(item.id, schoolId, {
        period_name: ydPeriodName,
        zone_name: ydZoneName || null,
        start_time: ydStartTime,
        end_time: ydEndTime,
        teacher_id: ydAssigneeType === 'teacher' ? ydTeacherId : null,
        staff_id: ydAssigneeType === 'staff' ? ydStaffId : null,
        provider_id: ydAssigneeType === 'provider' ? ydProviderId : null,
        assignee_name: assigneeName,
      });
      onSuccess();
    } catch (err: any) {
      console.error('Error updating yard duty assignment:', err);
      setError(err.message || 'Failed to update yard duty assignment');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string | null): string => {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const dayName = item.day_of_week ? DAYS[item.day_of_week - 1] : '';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 id={headingId} className="text-lg font-semibold text-gray-900">
            {type === 'bell' ? (isDailyTimeMarker ? 'Daily Time' : 'Bell Schedule') : type === 'yard-duty' ? 'Yard Duty' : 'Special Activity'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {dayName} at {formatTime('start_time' in item ? (item.start_time || null) : null)}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {type === 'bell' && bellSchedule && (
            <>
              {/* Grade Level (read-only - defines the schedule slot) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Grade Level
                </label>
                <p className="text-sm text-gray-900">{bellSchedule.grade_level || 'Not specified'}</p>
              </div>

              {/* Activity/Type (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {isDailyTimeMarker ? 'Type' : 'Activity'}
                </label>
                <select
                  value={bellPeriodName}
                  onChange={(e) => setBellPeriodName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select {isDailyTimeMarker ? 'type' : 'activity'}...</option>
                  {isDailyTimeMarker ? (
                    DAILY_TIME_PERIOD_NAMES.map((periodName) => (
                      <option key={periodName} value={periodName}>
                        {periodName}
                      </option>
                    ))
                  ) : (
                    BELL_SCHEDULE_ACTIVITIES.map((activity) => (
                      <option key={activity} value={activity}>
                        {activity}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Times (editable) */}
              <div className={isDailyTimeMarker ? '' : 'grid grid-cols-2 gap-4'}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {isDailyTimeMarker ? 'Time' : 'Start Time'}
                  </label>
                  <input
                    type="time"
                    value={bellStartTime}
                    onChange={(e) => setBellStartTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {!isDailyTimeMarker && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={bellEndTime}
                      onChange={(e) => setBellEndTime(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {type === 'yard-duty' && yardDuty && (
            <>
              {/* Assignee (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assigned To
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setYdAssigneeType('teacher'); setYdStaffId(null); setYdStaffName(''); setYdProviderId(null); setYdProviderName(''); }}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      ydAssigneeType === 'teacher'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Teacher
                  </button>
                  <button
                    type="button"
                    onClick={() => { setYdAssigneeType('staff'); setYdTeacherId(null); setYdTeacherName(''); setYdProviderId(null); setYdProviderName(''); }}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      ydAssigneeType === 'staff'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Staff
                  </button>
                  <button
                    type="button"
                    onClick={() => { setYdAssigneeType('provider'); setYdTeacherId(null); setYdTeacherName(''); setYdStaffId(null); setYdStaffName(''); }}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      ydAssigneeType === 'provider'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Provider
                  </button>
                </div>

                {ydAssigneeType === 'teacher' && (
                  <TeacherAutocomplete
                    value={ydTeacherId}
                    teacherName={ydTeacherName}
                    onChange={(id, name) => { setYdTeacherId(id); setYdTeacherName(name || ''); }}
                    placeholder="Search for a teacher..."
                  />
                )}

                {ydAssigneeType === 'staff' && (
                  <select
                    value={ydStaffId || ''}
                    onChange={(e) => {
                      const selected = staffMembers.find(s => s.id === e.target.value);
                      setYdStaffId(e.target.value || null);
                      setYdStaffName(selected ? `${selected.first_name} ${selected.last_name}` : '');
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select staff member...</option>
                    {staffMembers.map(staff => (
                      <option key={staff.id} value={staff.id}>
                        {staff.first_name} {staff.last_name} ({staff.role === 'instructional_assistant' ? 'IA' : staff.role === 'supervisor' ? 'Supervisor' : 'Office'})
                      </option>
                    ))}
                  </select>
                )}

                {ydAssigneeType === 'provider' && (
                  <select
                    value={ydProviderId || ''}
                    onChange={(e) => {
                      const selected = providers.find(p => p.id === e.target.value);
                      setYdProviderId(e.target.value || null);
                      setYdProviderName(selected ? selected.full_name : '');
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select provider...</option>
                    {providers.map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.full_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Period name (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duty Period
                </label>
                <input
                  type="text"
                  value={ydPeriodName}
                  onChange={(e) => setYdPeriodName(e.target.value)}
                  list="edit-period-suggestions"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
                <datalist id="edit-period-suggestions">
                  {existingPeriodNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              {/* Zone name (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Zone / Location
                </label>
                <input
                  type="text"
                  value={ydZoneName}
                  onChange={(e) => setYdZoneName(e.target.value)}
                  placeholder="Optional"
                  list="edit-zone-suggestions"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
                <datalist id="edit-zone-suggestions">
                  {existingZoneNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              {/* Times (editable) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={ydStartTime}
                    onChange={(e) => setYdStartTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={ydEndTime}
                    onChange={(e) => setYdEndTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Yard duty conflict warning */}
              {ydConflictWarning && (
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {ydConflictWarning}
                </div>
              )}
            </>
          )}

          {type === 'activity' && activity && (
            <>
              {/* Teacher (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teacher
                </label>
                <p className="text-sm text-gray-900">{activity.teacher_name || 'Not specified'}</p>
              </div>

              {/* Activity type (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Activity Type
                </label>
                <select
                  value={activityName}
                  onChange={(e) => setActivityName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select activity...</option>
                  {Array.from(new Set([...SPECIAL_ACTIVITY_TYPES, ...availableActivityTypes])).sort().map((activityType) => (
                    <option key={activityType} value={activityType}>
                      {activityType}
                    </option>
                  ))}
                </select>
              </div>

              {/* Times (editable) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Bell schedule conflict warning */}
              {bellScheduleConflictWarning && (
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {bellScheduleConflictWarning}
                </div>
              )}

              {/* Yard duty conflict warning */}
              {yardDutyConflictWarning && (
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {yardDutyConflictWarning}
                </div>
              )}
            </>
          )}

          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm text-red-700">
                Are you sure you want to delete this {type === 'bell' ? 'bell schedule' : type === 'yard-duty' ? 'yard duty assignment' : 'activity'}?
                {type === 'bell'
                  ? ' This action cannot be undone.'
                  : type === 'yard-duty'
                  ? ' This will remove the assignment from the schedule.'
                  : ' This will remove the activity from the schedule.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between">
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading && confirmDelete ? 'Deleting...' : confirmDelete ? 'Confirm Delete' : 'Delete'}
          </Button>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              {confirmDelete ? 'Cancel' : 'Close'}
            </Button>
            {type === 'bell' && (
              <Button variant="primary" onClick={handleBellUpdate} disabled={loading}>
                {loading && !confirmDelete ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            {type === 'activity' && (
              <Button variant="primary" onClick={handleUpdate} disabled={loading}>
                {loading && !confirmDelete ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            {type === 'yard-duty' && (
              <Button variant="primary" onClick={handleYardDutyUpdate} disabled={loading}>
                {loading && !confirmDelete ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
