'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '../../../../../components/ui/button';
import { addBellSchedule } from '../../../../../../lib/supabase/queries/bell-schedules';
import { addSpecialActivityAsAdmin } from '../../../../../../lib/supabase/queries/special-activities';
import { addYardDutyAssignment } from '../../../../../../lib/supabase/queries/yard-duty';
import { BELL_SCHEDULE_ACTIVITIES, SPECIAL_ACTIVITY_TYPES } from '../../../../../../lib/constants/activity-types';
import { TeacherAutocomplete } from '../../../../../components/teachers/teacher-autocomplete';
import { FullDayAvailability, checkActivityAvailability } from '../../../../../../lib/supabase/queries/activity-availability';
import type { Teacher, YardDutyAssignment, SpecialActivity } from '@/src/types/database';
import type { StaffWithHours, ProviderOption } from '../../../../../../lib/supabase/queries/staff';
import type { YardDutyZone } from '../../../../../../lib/supabase/queries/yard-duty-zones';
import type { BellScheduleWithCreator } from '../types';

interface CreateItemModalProps {
  day: number;
  startTime: string;
  schoolId: string;
  onClose: () => void;
  onSuccess: () => void;
  defaultTab?: 'bell' | 'activity' | 'dailyTime' | 'yardDuty';
  activityAvailability?: Map<string, FullDayAvailability>;
  availableActivityTypes?: string[];
  filterSelectedGrades?: Set<string>;
  bellSchedules?: BellScheduleWithCreator[];
  teachers?: Teacher[];
  staffMembers?: StaffWithHours[];
  providers?: ProviderOption[];
  yardDutyAssignments?: YardDutyAssignment[];
  specialActivities?: SpecialActivity[];
  yardDutyZones?: YardDutyZone[];
  schoolYear?: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const GRADES = ['TK', 'K', '1', '2', '3', '4', '5'];
const GRADE_ORDER: Record<string, number> = Object.fromEntries(GRADES.map((g, i) => [g, i]));
const sortGrades = (grades: string[]) => [...grades].sort((a, b) => (GRADE_ORDER[a] ?? 99) - (GRADE_ORDER[b] ?? 99));
const DAILY_TIME_TYPES = ['School Start', 'Dismissal', 'Early Dismissal'] as const;

/**
 * Calculate a default end time by adding offset minutes to a start time.
 */
const calculateDefaultEndTime = (time: string, offsetMinutes: number = 30): string => {
  const [h, m] = time.split(':').map(Number);
  const endMinutes = h * 60 + m + offsetMinutes;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
};

export function CreateItemModal({
  day,
  startTime,
  schoolId,
  onClose,
  onSuccess,
  defaultTab = 'bell',
  activityAvailability = new Map(),
  availableActivityTypes = [],
  filterSelectedGrades,
  bellSchedules = [],
  teachers = [],
  staffMembers = [],
  providers = [],
  yardDutyAssignments = [],
  specialActivities = [],
  yardDutyZones = [],
  schoolYear
}: CreateItemModalProps) {
  const [tab, setTab] = useState<'bell' | 'activity' | 'dailyTime' | 'yardDuty'>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const headingId = 'create-modal-heading';

  // Bell schedule form state
  const [selectedGrades, setSelectedGrades] = useState<string[]>(
    filterSelectedGrades ? Array.from(filterSelectedGrades) : []
  );
  const [selectedDays, setSelectedDays] = useState<number[]>([day]); // Pre-select the day modal was opened from
  const [periodName, setPeriodName] = useState('');
  const [bellStartTime, setBellStartTime] = useState(startTime);
  const [bellEndTime, setBellEndTime] = useState(() => calculateDefaultEndTime(startTime));

  // Daily time form state
  const [dailyTimeType, setDailyTimeType] = useState<string>('');
  const [dailyTime, setDailyTime] = useState(startTime);
  const [dailyTimeDays, setDailyTimeDays] = useState<number[]>([day]);
  const [dailyTimeGrades, setDailyTimeGrades] = useState<string[]>(GRADES); // Default to all grades

  // Activity form state
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [activityName, setActivityName] = useState('');
  const [customActivityName, setCustomActivityName] = useState('');
  const [activityStartTime, setActivityStartTime] = useState(startTime);
  const [activityEndTime, setActivityEndTime] = useState(() => calculateDefaultEndTime(startTime));

  // Yard duty form state
  const [ydPeriodName, setYdPeriodName] = useState('');
  const [ydZoneName, setYdZoneName] = useState('');
  const [ydDays, setYdDays] = useState<number[]>([day]);
  const [ydStartTime, setYdStartTime] = useState(startTime);
  const [ydEndTime, setYdEndTime] = useState(() => calculateDefaultEndTime(startTime, 20));
  const [ydAssigneeType, setYdAssigneeType] = useState<'teacher' | 'staff' | 'provider' | ''>('');
  const [ydTeacherId, setYdTeacherId] = useState<string | null>(null);
  const [ydTeacherName, setYdTeacherName] = useState('');
  const [ydStaffId, setYdStaffId] = useState<string | null>(null);
  const [ydStaffName, setYdStaffName] = useState('');
  const [ydProviderId, setYdProviderId] = useState<string | null>(null);
  const [ydProviderName, setYdProviderName] = useState('');

  // Build duty period options from bell schedules that overlap selected time/days
  const availableDutyPeriods = useMemo(() => {
    const normTime = (t: string) => t.substring(0, 5);
    const fmtTime = (t: string) => {
      const [h, m] = normTime(t).split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${hr}:${m.toString().padStart(2, '0')} ${ampm}`;
    };
    const start = normTime(ydStartTime);
    const end = normTime(ydEndTime);
    const dailyTimeNames = ['School Start', 'Dismissal', 'Early Dismissal'];

    // Find bell schedules that overlap with selected time on any selected day
    const overlapping = bellSchedules.filter(bs => {
      if (!bs.period_name || !bs.start_time || !bs.end_time) return false;
      if (dailyTimeNames.includes(bs.period_name)) return false;
      if (!ydDays.includes(bs.day_of_week ?? 0)) return false;
      const bsStart = normTime(bs.start_time);
      const bsEnd = normTime(bs.end_time);
      return start < bsEnd && bsStart < end;
    });

    const hasOverlap = overlapping.length > 0;
    const source = hasOverlap
      ? overlapping
      : bellSchedules.filter(bs => bs.period_name && !dailyTimeNames.includes(bs.period_name));

    // Deduplicate by grade_level + period_name
    const seen = new Map<string, { value: string; label: string; sortTime: string }>();
    for (const bs of source) {
      if (!bs.period_name || !bs.grade_level || !bs.start_time || !bs.end_time) continue;
      const value = `${bs.grade_level} ${bs.period_name}`;
      if (!seen.has(value)) {
        seen.set(value, {
          value,
          label: `${bs.grade_level} ${bs.period_name} (${fmtTime(bs.start_time)}–${fmtTime(bs.end_time)})`,
          sortTime: bs.start_time,
        });
      }
    }

    const options = Array.from(seen.values()).sort((a, b) => a.sortTime.localeCompare(b.sortTime));

    // When no overlap, include Before School / After School as static options
    if (!hasOverlap) {
      options.unshift({ value: 'Before School', label: 'Before School', sortTime: '00:00' });
      options.push({ value: 'After School', label: 'After School', sortTime: '99:99' });
    }

    return options;
  }, [bellSchedules, ydDays, ydStartTime, ydEndTime]);

  // Get distinct zone names from existing yard duty assignments for suggestions
  const existingZoneNames = useMemo(() => {
    const names = new Set<string>();
    yardDutyAssignments.forEach(yd => {
      if (yd.zone_name) names.add(yd.zone_name);
    });
    return Array.from(names).sort();
  }, [yardDutyAssignments]);

  // Conflict detection: yard duty teacher vs their special activities
  const ydConflictWarning = useMemo(() => {
    if (tab !== 'yardDuty' || !ydTeacherId || !ydStartTime || !ydEndTime || ydDays.length === 0) return null;

    const normTime = (t: string) => t.substring(0, 5);
    const start = normTime(ydStartTime);
    const end = normTime(ydEndTime);

    const conflicts = specialActivities.filter(a => {
      if (a.teacher_id !== ydTeacherId || !a.start_time || !a.end_time) return false;
      if (!ydDays.includes(a.day_of_week)) return false;
      const aStart = normTime(a.start_time);
      const aEnd = normTime(a.end_time);
      return start < aEnd && aStart < end;
    });

    if (conflicts.length === 0) return null;

    const descriptions = conflicts.map(c => {
      const dayName = DAYS[(c.day_of_week || 1) - 1];
      return `${c.activity_name} on ${dayName} (${normTime(c.start_time!)}–${normTime(c.end_time!)})`;
    });
    return `This overlaps with: ${descriptions.join(', ')}`;
  }, [tab, ydTeacherId, ydStartTime, ydEndTime, ydDays, specialActivities]);

  // Conflict detection: yard duty assignee vs their other yard duty assignments
  const ydDoubleBookWarning = useMemo(() => {
    if (tab !== 'yardDuty' || !ydStartTime || !ydEndTime || ydDays.length === 0) return null;

    const assigneeId = ydAssigneeType === 'teacher' ? ydTeacherId
      : ydAssigneeType === 'staff' ? ydStaffId
      : ydAssigneeType === 'provider' ? ydProviderId
      : null;
    if (!assigneeId) return null;

    const normTime = (t: string) => t.substring(0, 5);
    const start = normTime(ydStartTime);
    const end = normTime(ydEndTime);

    const conflicts = yardDutyAssignments.filter(yd => {
      // Match on the same assignee type
      const matchesAssignee = (ydAssigneeType === 'teacher' && yd.teacher_id === assigneeId)
        || (ydAssigneeType === 'staff' && yd.staff_id === assigneeId)
        || (ydAssigneeType === 'provider' && yd.provider_id === assigneeId);
      if (!matchesAssignee || !yd.start_time || !yd.end_time) return false;
      if (!ydDays.includes(yd.day_of_week)) return false;
      const ydStart = normTime(yd.start_time);
      const ydEnd = normTime(yd.end_time);
      return start < ydEnd && ydStart < end;
    });

    if (conflicts.length === 0) return null;

    const descriptions = conflicts.map(c => {
      const dayName = DAYS[(c.day_of_week || 1) - 1];
      return `${c.period_name}${c.zone_name ? ` (${c.zone_name})` : ''} on ${dayName} (${normTime(c.start_time)}–${normTime(c.end_time)})`;
    });
    return `This assignee already has yard duty: ${descriptions.join(', ')}`;
  }, [tab, ydAssigneeType, ydTeacherId, ydStaffId, ydProviderId, ydStartTime, ydEndTime, ydDays, yardDutyAssignments]);

  const handleYdDayToggle = (dayNum: number) => {
    setYdDays(prev =>
      prev.includes(dayNum)
        ? prev.filter(d => d !== dayNum)
        : [...prev, dayNum].sort((a, b) => a - b)
    );
  };

  const handleYdStartTimeChange = (newStartTime: string) => {
    setYdStartTime(newStartTime);
    setYdEndTime(calculateDefaultEndTime(newStartTime, 20));
  };

  // Merge default types with available types (configured + scheduled)
  const allActivityTypes = useMemo(() => {
    const types = new Set<string>(SPECIAL_ACTIVITY_TYPES);
    availableActivityTypes.forEach(type => types.add(type));
    return Array.from(types).sort();
  }, [availableActivityTypes]);

  // Get the effective activity name (either selected or custom)
  const effectiveActivityName = activityName === '__other__' ? customActivityName : activityName;

  // Check if selected activity is available on the selected day and time
  const activityAvailabilityWarning = useMemo(() => {
    if (tab !== 'activity' || !effectiveActivityName) return null;

    const result = checkActivityAvailability(
      activityAvailability,
      effectiveActivityName,
      day,
      activityStartTime,
      activityEndTime
    );

    return result.available ? null : result.reason || null;
  }, [tab, effectiveActivityName, day, activityAvailability, activityStartTime, activityEndTime]);

  // Check if selected activity conflicts with a bell schedule for the teacher's grade
  const bellScheduleConflictWarning = useMemo(() => {
    if (tab !== 'activity' || !teacherId || !activityStartTime || !activityEndTime) return null;

    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher?.grade_level) return null;

    const teacherGrades = teacher.grade_level.split(',').map(g => g.trim());
    // Normalize to HH:MM to avoid format mismatch (input gives HH:MM, Supabase may give HH:MM:SS)
    const normTime = (t: string) => t.substring(0, 5);
    const actStart = normTime(activityStartTime);
    const actEnd = normTime(activityEndTime);

    const conflicts = bellSchedules.filter(schedule => {
      if (!schedule.day_of_week || !schedule.start_time || !schedule.end_time || !schedule.grade_level) return false;
      if (schedule.day_of_week !== day) return false;

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
  }, [tab, teacherId, teachers, bellSchedules, day, activityStartTime, activityEndTime]);

  // Conflict detection: special activity teacher vs their yard duty assignments
  const yardDutyConflictWarning = useMemo(() => {
    if (tab !== 'activity' || !teacherId || !activityStartTime || !activityEndTime) return null;

    const normTime = (t: string) => t.substring(0, 5);
    const actStart = normTime(activityStartTime);
    const actEnd = normTime(activityEndTime);

    const conflicts = yardDutyAssignments.filter(yd => {
      if (yd.teacher_id !== teacherId || !yd.start_time || !yd.end_time) return false;
      if (yd.day_of_week !== day) return false;
      const ydStart = normTime(yd.start_time);
      const ydEnd = normTime(yd.end_time);
      return actStart < ydEnd && ydStart < actEnd;
    });

    if (conflicts.length === 0) return null;

    const descriptions = conflicts.map(c =>
      `${c.period_name}${c.zone_name ? ` (${c.zone_name})` : ''} (${normTime(c.start_time)}–${normTime(c.end_time)})`
    );
    return `This overlaps with yard duty: ${descriptions.join(', ')}`;
  }, [tab, teacherId, yardDutyAssignments, day, activityStartTime, activityEndTime]);

  // Handle start time change - auto-adjust end time to maintain 30min duration
  const handleBellStartTimeChange = (newStartTime: string) => {
    setBellStartTime(newStartTime);
    setBellEndTime(calculateDefaultEndTime(newStartTime, 30));
  };

  const handleActivityStartTimeChange = (newStartTime: string) => {
    setActivityStartTime(newStartTime);
    setActivityEndTime(calculateDefaultEndTime(newStartTime, 30));
  };

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

  const handleGradeToggle = (grade: string) => {
    setSelectedGrades(prev =>
      prev.includes(grade)
        ? prev.filter(g => g !== grade)
        : [...prev, grade]
    );
  };

  const handleDayToggle = (dayNum: number) => {
    setSelectedDays(prev =>
      prev.includes(dayNum)
        ? prev.filter(d => d !== dayNum)
        : [...prev, dayNum].sort((a, b) => a - b)
    );
  };

  const handleDailyTimeDayToggle = (dayNum: number) => {
    setDailyTimeDays(prev =>
      prev.includes(dayNum)
        ? prev.filter(d => d !== dayNum)
        : [...prev, dayNum].sort((a, b) => a - b)
    );
  };

  const handleDailyTimeGradeToggle = (grade: string) => {
    setDailyTimeGrades(prev =>
      prev.includes(grade)
        ? prev.filter(g => g !== grade)
        : [...prev, grade]
    );
  };

  const handleTeacherChange = (newTeacherId: string | null, newTeacherName: string | null) => {
    setTeacherId(newTeacherId);
    setTeacherName(newTeacherName || '');
  };

  const handleSubmit = async () => {
    setError(null);

    try {
      if (tab === 'bell') {
        // Validate bell schedule
        if (selectedGrades.length === 0) {
          setError('Please select at least one grade');
          return;
        }
        if (selectedDays.length === 0) {
          setError('Please select at least one day');
          return;
        }
        if (!periodName) {
          setError('Please select an activity type');
          return;
        }
        // Validate time range
        if (bellEndTime <= bellStartTime) {
          setError('End time must be after start time');
          return;
        }

        setLoading(true);
        // Create a bell schedule for each selected day
        await Promise.all(
          selectedDays.map(selectedDay =>
            addBellSchedule({
              grade_level: sortGrades(selectedGrades).join(','),
              day_of_week: selectedDay,
              start_time: bellStartTime,
              end_time: bellEndTime,
              period_name: periodName,
              school_id: schoolId,
              ...(schoolYear ? { school_year: schoolYear } : {})
            }, 'site_admin')
          )
        );
      } else if (tab === 'dailyTime') {
        // Validate daily time
        if (!dailyTimeType) {
          setError('Please select a time type');
          return;
        }
        if (dailyTimeDays.length === 0) {
          setError('Please select at least one day');
          return;
        }
        if (dailyTimeGrades.length === 0) {
          setError('Please select at least one grade');
          return;
        }

        setLoading(true);
        // Create a bell schedule entry for each selected day
        // Add 1 minute to end_time to satisfy check constraint (renders as a line marker anyway)
        const endTime = calculateDefaultEndTime(dailyTime, 1);
        await Promise.all(
          dailyTimeDays.map(selectedDay =>
            addBellSchedule({
              grade_level: sortGrades(dailyTimeGrades).join(','),
              day_of_week: selectedDay,
              start_time: dailyTime,
              end_time: endTime,
              period_name: dailyTimeType,
              school_id: schoolId,
              ...(schoolYear ? { school_year: schoolYear } : {})
            }, 'site_admin')
          )
        );
      } else if (tab === 'yardDuty') {
        // Validate yard duty
        if (!ydPeriodName.trim()) {
          setError('Please enter a duty period name');
          return;
        }
        if (ydDays.length === 0) {
          setError('Please select at least one day');
          return;
        }
        if (ydEndTime <= ydStartTime) {
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

        setLoading(true);
        await Promise.all(
          ydDays.map(selectedDay =>
            addYardDutyAssignment({
              school_id: schoolId,
              period_name: ydPeriodName.trim(),
              zone_name: ydZoneName.trim() || null,
              day_of_week: selectedDay,
              start_time: ydStartTime,
              end_time: ydEndTime,
              teacher_id: ydAssigneeType === 'teacher' ? ydTeacherId : null,
              staff_id: ydAssigneeType === 'staff' ? ydStaffId : null,
              provider_id: ydAssigneeType === 'provider' ? ydProviderId : null,
              assignee_name: assigneeName,
              ...(schoolYear ? { school_year: schoolYear } : {})
            })
          )
        );
      } else {
        // Validate activity
        if (!teacherId) {
          setError('Please select a teacher');
          return;
        }
        if (!activityName) {
          setError('Please select an activity type');
          return;
        }
        if (activityName === '__other__' && !customActivityName.trim()) {
          setError('Please enter a custom activity name');
          return;
        }
        // Validate time range
        if (activityEndTime <= activityStartTime) {
          setError('End time must be after start time');
          return;
        }

        setLoading(true);
        await addSpecialActivityAsAdmin({
          teacher_id: teacherId,
          teacher_name: teacherName,
          activity_name: effectiveActivityName,
          day_of_week: day,
          start_time: activityStartTime,
          end_time: activityEndTime,
          school_id: schoolId,
          ...(schoolYear ? { school_year: schoolYear } : {})
        });
      }

      onSuccess();
    } catch (err: any) {
      console.error('Error creating item:', err);
      setError(err.message || 'Failed to create item');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
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
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 id={headingId} className="text-lg font-semibold text-gray-900">
            Add to Schedule
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {DAYS[day - 1]}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'bell'}
            aria-controls="bell-panel"
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              tab === 'bell'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('bell')}
          >
            Bell Schedule
          </button>
          <button
            role="tab"
            aria-selected={tab === 'activity'}
            aria-controls="activity-panel"
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              tab === 'activity'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('activity')}
          >
            Special Activity
          </button>
          <button
            role="tab"
            aria-selected={tab === 'yardDuty'}
            aria-controls="yardDuty-panel"
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              tab === 'yardDuty'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('yardDuty')}
          >
            Yard Duty
          </button>
          <button
            role="tab"
            aria-selected={tab === 'dailyTime'}
            aria-controls="dailyTime-panel"
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              tab === 'dailyTime'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('dailyTime')}
          >
            Daily Time
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {tab === 'bell' ? (
            <>
              {/* Grade selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grade Level(s)
                </label>
                <div className="flex flex-wrap gap-2">
                  {GRADES.map((grade) => (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => handleGradeToggle(grade)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        selectedGrades.includes(grade)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {grade}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Day(s)
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((dayName, index) => {
                    const dayNum = index + 1;
                    return (
                      <button
                        key={dayName}
                        type="button"
                        onClick={() => handleDayToggle(dayNum)}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          selectedDays.includes(dayNum)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {dayName.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Activity type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Activity Type
                </label>
                <select
                  value={periodName}
                  onChange={(e) => setPeriodName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select activity...</option>
                  {BELL_SCHEDULE_ACTIVITIES.map((activity) => (
                    <option key={activity} value={activity}>
                      {activity}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={bellStartTime}
                    onChange={(e) => handleBellStartTimeChange(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
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
              </div>
            </>
          ) : tab === 'yardDuty' ? (
            <>
              {/* Period name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duty Period
                </label>
                <select
                  value={ydPeriodName}
                  onChange={(e) => setYdPeriodName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select duty period...</option>
                  {ydPeriodName && !availableDutyPeriods.some(o => o.value === ydPeriodName) && (
                    <option value={ydPeriodName}>{ydPeriodName}</option>
                  )}
                  {availableDutyPeriods.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Zone name (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Zone / Location <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                {yardDutyZones.length > 0 ? (
                  <select
                    value={ydZoneName}
                    onChange={(e) => setYdZoneName(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">No zone selected</option>
                    {yardDutyZones.map(zone => (
                      <option key={zone.id} value={zone.zone_name}>
                        {zone.zone_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={ydZoneName}
                    onChange={(e) => setYdZoneName(e.target.value)}
                    placeholder="e.g., Basketball & Blacktop, Playstructure"
                    list="zone-suggestions"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                )}
                {yardDutyZones.length === 0 && (
                  <datalist id="zone-suggestions">
                    {existingZoneNames.map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                )}
              </div>

              {/* Assignee type selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign To
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

              {/* Day selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Day(s)
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((dayName, index) => {
                    const dayNum = index + 1;
                    return (
                      <button
                        key={dayName}
                        type="button"
                        onClick={() => handleYdDayToggle(dayNum)}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          ydDays.includes(dayNum)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {dayName.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={ydStartTime}
                    onChange={(e) => handleYdStartTimeChange(e.target.value)}
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

              {/* Yard duty conflict warning (vs special activities) */}
              {ydConflictWarning && (
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {ydConflictWarning}
                </div>
              )}

              {/* Yard duty double-booking warning (vs other yard duty) */}
              {ydDoubleBookWarning && (
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {ydDoubleBookWarning}
                </div>
              )}
            </>
          ) : tab === 'activity' ? (
            <>
              {/* Teacher selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Teacher
                </label>
                <TeacherAutocomplete
                  value={teacherId}
                  teacherName={teacherName}
                  onChange={handleTeacherChange}
                  placeholder="Search for a teacher..."
                />
              </div>

              {/* Activity type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Activity Type
                </label>
                <select
                  value={activityName}
                  onChange={(e) => {
                    setActivityName(e.target.value);
                    if (e.target.value !== '__other__') {
                      setCustomActivityName('');
                    }
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select activity...</option>
                  {allActivityTypes.map((activity) => (
                    <option key={activity} value={activity}>
                      {activity}
                    </option>
                  ))}
                  <option value="__other__">Other...</option>
                </select>

                {/* Custom activity name input */}
                {activityName === '__other__' && (
                  <input
                    type="text"
                    value={customActivityName}
                    onChange={(e) => setCustomActivityName(e.target.value)}
                    placeholder="Enter activity name"
                    className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  />
                )}

                {/* Availability warning */}
                {activityAvailabilityWarning && (
                  <div className="mt-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    {activityAvailabilityWarning}
                  </div>
                )}

                {/* Bell schedule conflict warning */}
                {bellScheduleConflictWarning && (
                  <div className="mt-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    {bellScheduleConflictWarning}
                  </div>
                )}

                {/* Yard duty conflict warning */}
                {yardDutyConflictWarning && (
                  <div className="mt-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    {yardDutyConflictWarning}
                  </div>
                )}
              </div>

              {/* Time inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={activityStartTime}
                    onChange={(e) => handleActivityStartTimeChange(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={activityEndTime}
                    onChange={(e) => setActivityEndTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Daily Time form */}
              {/* Time type selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Type
                </label>
                <select
                  value={dailyTimeType}
                  onChange={(e) => setDailyTimeType(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select type...</option>
                  {DAILY_TIME_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Grade selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grade Level(s)
                </label>
                <div className="flex flex-wrap gap-2">
                  {GRADES.map((grade) => (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => handleDailyTimeGradeToggle(grade)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        dailyTimeGrades.includes(grade)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {grade}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Select specific grades (e.g., TK/K for early dismissal)
                </p>
              </div>

              {/* Day selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Day(s)
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((dayName, index) => {
                    const dayNum = index + 1;
                    return (
                      <button
                        key={dayName}
                        type="button"
                        onClick={() => handleDailyTimeDayToggle(dayNum)}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          dailyTimeDays.includes(dayNum)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {dayName.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time
                </label>
                <input
                  type="time"
                  value={dailyTime}
                  onChange={(e) => setDailyTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <p className="text-xs text-gray-500">
                Daily times appear as markers on the schedule grid when "Show Daily Times" is enabled.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={loading || !!activityAvailabilityWarning}
          >
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
