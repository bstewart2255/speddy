'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '../../../src/types/database';
import { ConflictResolver } from '../../../lib/scheduling/conflict-resolver';
import { useSchool } from '../../components/providers/school-context';
import { generateActivityTimeOptions } from '../../../lib/utils/time-options';
import { TeacherAutocomplete } from '../teachers/teacher-autocomplete';
import { SPECIAL_ACTIVITY_TYPES } from '../../../lib/constants/activity-types';
import { updateSpecialActivity } from '../../../lib/supabase/queries/special-activities';

interface EditActivity {
  id: string;
  teacher_id?: string | null;
  teacher_name: string;
  activity_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  school_id?: string | null;
}

interface Props {
  teacherId?: string | null;
  teacherName?: string | null;
  activity?: EditActivity; // When provided, form is in edit mode
  onSuccess: () => void;
  onCancel: () => void;
}

// Strip seconds from time string (HH:mm:ss -> HH:mm)
const normalizeTime = (time: string | undefined): string => {
  if (!time) return '';
  // Handle both "HH:mm" and "HH:mm:ss" formats
  const parts = time.split(':');
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }
  return time;
};

export default function AddSpecialActivityForm({ teacherId: initialTeacherId, teacherName: initialTeacherName, activity, onSuccess, onCancel }: Props) {
  const isEditMode = !!activity;

  const [teacherId, setTeacherId] = useState<string | null>(activity?.teacher_id || initialTeacherId || null);
  const [teacherName, setTeacherName] = useState<string | null>(activity?.teacher_name || initialTeacherName || null);
  const [activityName, setActivityName] = useState(activity?.activity_name || '');
  const [dayOfWeek, setDayOfWeek] = useState(activity?.day_of_week?.toString() || '1');
  const [startTime, setStartTime] = useState(normalizeTime(activity?.start_time));
  const [endTime, setEndTime] = useState(normalizeTime(activity?.end_time));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient<Database>();
  const { currentSchool } = useSchool();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate school is selected (only for new activities)
    if (!isEditMode && !currentSchool?.school_id) {
      setError('No school selected. Please select a school before adding a special activity.');
      return;
    }

    if (!teacherId || !activityName || !startTime || !endTime) {
      setError('All fields are required');
      return;
    }

    if (startTime >= endTime) {
      setError('End time must be after start time');
      return;
    }

    setLoading(true);

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      if (isEditMode && activity) {
        // Update existing activity
        await updateSpecialActivity(activity.id, {
          teacher_id: teacherId,
          teacher_name: teacherName || '',
          activity_name: activityName,
          day_of_week: parseInt(dayOfWeek),
          start_time: startTime,
          end_time: endTime
        });

        // Check for conflicts after update - use activity's school_id
        const resolver = new ConflictResolver(user.user.id);
        const updatedActivity = {
          teacher_id: teacherId,
          teacher_name: teacherName || '',
          day_of_week: parseInt(dayOfWeek),
          start_time: startTime,
          end_time: endTime,
          school_id: activity.school_id ?? null
        };

        const result = await resolver.resolveSpecialActivityConflicts(updatedActivity);

        if (result.resolved > 0 || result.failed > 0) {
          alert(`Special activity updated. ${result.resolved} sessions rescheduled, ${result.failed} could not be rescheduled.`);
        }
      } else {
        // Create new activity
        const { error: insertError } = await supabase
          .from('special_activities')
          .insert({
            provider_id: user.user.id,
            created_by_id: user.user.id,
            created_by_role: 'provider',
            teacher_id: teacherId,
            teacher_name: teacherName || '',
            activity_name: activityName,
            day_of_week: parseInt(dayOfWeek),
            start_time: startTime,
            end_time: endTime,
            school_id: currentSchool!.school_id
          });

        if (insertError) throw insertError;

        // Check for conflicts after successful insert
        const resolver = new ConflictResolver(user.user.id);
        const insertedActivity = {
          teacher_id: teacherId,
          teacher_name: teacherName || '',
          day_of_week: parseInt(dayOfWeek),
          start_time: startTime,
          end_time: endTime,
          school_id: currentSchool!.school_id ?? null
        };

        const result = await resolver.resolveSpecialActivityConflicts(insertedActivity);

        if (result.resolved > 0 || result.failed > 0) {
          alert(`Special activity added. ${result.resolved} sessions rescheduled, ${result.failed} could not be rescheduled.`);
        }
      }

      onSuccess();
    } catch (err) {
      console.error('Error saving activity:', err);
      setError(isEditMode ? 'Failed to update activity. You may not have permission to edit this activity.' : 'Failed to add activity');
    } finally {
      setLoading(false);
    }
  };

  // Generate time options (7 AM to 3 PM in 5-minute increments)
  const timeOptions = generateActivityTimeOptions();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">
          Teacher*
        </label>
        <TeacherAutocomplete
          value={teacherId}
          teacherName={teacherName || undefined}
          onChange={(newTeacherId, newTeacherName) => {
            setTeacherId(newTeacherId);
            setTeacherName(newTeacherName);
          }}
          placeholder="Search for a teacher..."
          required
          schoolId={currentSchool?.school_id || undefined}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Activity Name*
        </label>
        <select
          value={activityName}
          onChange={(e) => setActivityName(e.target.value)}
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          <option value="">Select activity</option>
          {SPECIAL_ACTIVITY_TYPES.map((activity) => (
            <option key={activity} value={activity}>
              {activity}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Day of Week*
        </label>
        <select
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(e.target.value)}
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="1">Monday</option>
          <option value="2">Tuesday</option>
          <option value="3">Wednesday</option>
          <option value="4">Thursday</option>
          <option value="5">Friday</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Start Time*
        </label>
        <select
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          <option value="">Select start time</option>
          {timeOptions.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          End Time*
        </label>
        <select
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          <option value="">Select end time</option>
          {timeOptions.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Activity' : 'Add Activity')}
        </button>
      </div>
    </form>
  );
}