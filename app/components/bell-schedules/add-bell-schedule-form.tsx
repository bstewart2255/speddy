'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '../../../src/types/database';
import { ConflictResolver } from '../../../lib/scheduling/conflict-resolver';
import { useSchool } from '../../components/providers/school-context';
import { generateActivityTimeOptions } from '../../../lib/utils/time-options';
import { BELL_SCHEDULE_ACTIVITIES } from '../../../lib/constants/activity-types';

type CreatorRole = 'provider' | 'site_admin';

type Props = {
  gradeLevel?: string; // Optional when multiSelectGrades is true
  onSuccess: () => void;
  onCancel: () => void;
  creatorRole?: CreatorRole;
  schoolId?: string; // Optional: used by site admins who have a specific school_id
  multiSelectGrades?: boolean; // Enable multi-select for grades (site admin feature)
};

const GRADE_OPTIONS = [
  { id: 'TK', name: 'TK', shortName: 'TK' },
  { id: 'K', name: 'Kindergarten', shortName: 'K' },
  { id: '1', name: '1st Grade', shortName: '1' },
  { id: '2', name: '2nd Grade', shortName: '2' },
  { id: '3', name: '3rd Grade', shortName: '3' },
  { id: '4', name: '4th Grade', shortName: '4' },
  { id: '5', name: '5th Grade', shortName: '5' },
];

export default function AddBellScheduleForm({
  gradeLevel,
  onSuccess,
  onCancel,
  creatorRole = 'provider',
  schoolId: propSchoolId,
  multiSelectGrades = false
}: Props) {
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>(gradeLevel ? [gradeLevel] : []);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [subject, setSubject] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient<Database>();

  const { currentSchool } = useSchool();

  const daysOfWeek = [
    { id: 1, name: 'Monday', shortName: 'Mon' },
    { id: 2, name: 'Tuesday', shortName: 'Tue' },
    { id: 3, name: 'Wednesday', shortName: 'Wed' },
    { id: 4, name: 'Thursday', shortName: 'Thu' },
    { id: 5, name: 'Friday', shortName: 'Fri' }
  ];

  const handleDayToggle = (dayId: number) => {
    setSelectedDays(prev =>
      prev.includes(dayId)
        ? prev.filter(id => id !== dayId)
        : [...prev, dayId]
    );
  };

  const handleGradeToggle = (grade: string) => {
    setSelectedGrades(prev =>
      prev.includes(grade)
        ? prev.filter(g => g !== grade)
        : [...prev, grade]
    );
  };

  // Get effective grades to use (multi-select or single from prop)
  const effectiveGrades = multiSelectGrades ? selectedGrades : (gradeLevel ? [gradeLevel] : []);
  const totalSchedules = effectiveGrades.length * selectedDays.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get school ID from props or context
      const effectiveSchoolId = propSchoolId || currentSchool?.school_id;

      // Validate school is selected
      if (!effectiveSchoolId) {
        setError('No school selected. Please select a school before adding a bell schedule.');
        setSubmitting(false);
        return;
      }

      // Validate at least one grade is selected (for multi-select mode)
      if (effectiveGrades.length === 0) {
        setError('Please select at least one grade level');
        setSubmitting(false);
        return;
      }

      // Validate at least one day is selected
      if (selectedDays.length === 0) {
        setError('Please select at least one day');
        setSubmitting(false);
        return;
      }

      // Validate times
      if (startTime >= endTime) {
        setError('End time must be after start time');
        setSubmitting(false);
        return;
      }

      let totalResolved = 0;
      let totalFailed = 0;
      const errors: string[] = [];
      let successCount = 0;

      // Create a bell schedule entry for each grade/day combination
      for (const grade of effectiveGrades) {
        for (const dayId of selectedDays) {
          try {
            // Build insert data with school_id and creator tracking
            const insertData = {
              provider_id: creatorRole === 'provider' ? user.id : null,
              grade_level: grade,
              day_of_week: dayId,
              start_time: startTime,
              end_time: endTime,
              period_name: subject.trim(),
              school_id: effectiveSchoolId,
              created_by_id: user.id,
              created_by_role: creatorRole,
            };

            const { error: insertError } = await supabase
              .from('bell_schedules')
              .insert([insertData]);

            if (insertError) {
              const dayName = daysOfWeek.find(d => d.id === dayId)?.name || `Day ${dayId}`;
              errors.push(`Grade ${grade}, ${dayName}: ${insertError.message}`);
              continue;
            }

            successCount++;

            // Check for conflicts after successful insert
            const resolver = new ConflictResolver(user.id);
            const insertedSchedule = {
              grade_level: grade.trim(),
              day_of_week: dayId,
              start_time: startTime,
              end_time: endTime,
              period_name: subject.trim(),
              school_id: effectiveSchoolId
            };

            const result = await resolver.resolveBellScheduleConflicts(insertedSchedule);
            totalResolved += result.resolved;
            totalFailed += result.failed;
          } catch (err) {
            const dayName = daysOfWeek.find(d => d.id === dayId)?.name || `Day ${dayId}`;
            errors.push(`Grade ${grade}, ${dayName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }
      }

      // Show results
      if (errors.length > 0) {
        setError(`Some schedules could not be added:\n${errors.join('\n')}`);
      } else {
        const message = successCount === 1
          ? 'Bell schedule added successfully.'
          : `${successCount} bell schedules added successfully.`;

        if (totalResolved > 0 || totalFailed > 0) {
          alert(`${message} ${totalResolved} sessions rescheduled, ${totalFailed} could not be rescheduled.`);
        }

        // Reset form
        setStartTime('');
        setEndTime('');
        setSubject('');
        setSelectedDays([]);
        if (multiSelectGrades) {
          setSelectedGrades([]);
        }
        onSuccess();
      }
    } catch (err) {
      console.error('Add schedule error:', err);
      setError(err instanceof Error ? err.message : 'Failed to add schedules');
    } finally {
      setSubmitting(false);
    }
  };

  // Generate time options (7 AM to 3 PM in 5-minute increments)
  const timeOptions = generateActivityTimeOptions();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Grade Level Multi-Select (site admin feature) */}
      {multiSelectGrades && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Grade Levels
          </label>
          <div className="grid grid-cols-7 gap-2">
            {GRADE_OPTIONS.map((grade) => (
              <label
                key={grade.id}
                className={`
                  flex flex-col items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all
                  ${selectedGrades.includes(grade.id)
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                  }
                `}
              >
                <input
                  type="checkbox"
                  checked={selectedGrades.includes(grade.id)}
                  onChange={() => handleGradeToggle(grade.id)}
                  className="sr-only"
                />
                <div className="text-sm font-semibold">{grade.shortName}</div>
              </label>
            ))}
          </div>
          {selectedGrades.length > 0 && (
            <div className="mt-2 text-sm text-gray-600">
              {selectedGrades.length} {selectedGrades.length === 1 ? 'grade' : 'grades'} selected
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Days
        </label>
        <div className="grid grid-cols-5 gap-2">
          {daysOfWeek.map((day) => (
            <label
              key={day.id}
              className={`
                flex flex-col items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all
                ${selectedDays.includes(day.id)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
                }
              `}
            >
              <input
                type="checkbox"
                checked={selectedDays.includes(day.id)}
                onChange={() => handleDayToggle(day.id)}
                className="sr-only"
              />
              <div className="text-sm font-semibold">{day.shortName}</div>
            </label>
          ))}
        </div>
        {selectedDays.length > 0 && (
          <div className="mt-2 text-sm text-gray-600">
            {selectedDays.length} {selectedDays.length === 1 ? 'day' : 'days'} selected
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Time
          </label>
          <select
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select time</option>
            {timeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Time
          </label>
          <select
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select time</option>
            {timeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Activity
        </label>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          <option value="">Select activity</option>
          {BELL_SCHEDULE_ACTIVITIES.map((activity) => (
            <option key={activity} value={activity}>
              {activity}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || totalSchedules === 0}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {submitting
            ? `Adding ${totalSchedules} ${totalSchedules === 1 ? 'Time Block' : 'Time Blocks'}...`
            : totalSchedules === 0
            ? (multiSelectGrades ? 'Select Grades & Days' : 'Select Days')
            : `Add ${totalSchedules} ${totalSchedules === 1 ? 'Time Block' : 'Time Blocks'}`
          }
        </button>
      </div>
    </form>
  );
}