'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '../../../../../components/ui/button';
import { addBellSchedule } from '../../../../../../lib/supabase/queries/bell-schedules';
import { addSpecialActivityAsAdmin } from '../../../../../../lib/supabase/queries/special-activities';
import { BELL_SCHEDULE_ACTIVITIES, SPECIAL_ACTIVITY_TYPES } from '../../../../../../lib/constants/activity-types';
import { TeacherAutocomplete } from '../../../../../components/teachers/teacher-autocomplete';
import { FullDayAvailability, checkActivityAvailability } from '../../../../../../lib/supabase/queries/activity-availability';

interface CreateItemModalProps {
  day: number;
  startTime: string;
  schoolId: string;
  onClose: () => void;
  onSuccess: () => void;
  defaultTab?: 'bell' | 'activity' | 'dailyTime';
  activityAvailability?: Map<string, FullDayAvailability>;
  availableActivityTypes?: string[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const GRADES = ['TK', 'K', '1', '2', '3', '4', '5'];
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
  availableActivityTypes = []
}: CreateItemModalProps) {
  const [tab, setTab] = useState<'bell' | 'activity' | 'dailyTime'>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const headingId = 'create-modal-heading';

  // Bell schedule form state
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
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
              grade_level: selectedGrades.join(','),
              day_of_week: selectedDay,
              start_time: bellStartTime,
              end_time: bellEndTime,
              period_name: periodName,
              school_id: schoolId
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
              grade_level: dailyTimeGrades.join(','),
              day_of_week: selectedDay,
              start_time: dailyTime,
              end_time: endTime,
              period_name: dailyTimeType,
              school_id: schoolId
            }, 'site_admin')
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
          school_id: schoolId
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
