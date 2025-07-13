'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '../../../src/types/database';
import { ConflictResolver } from '../../../lib/scheduling/conflict-resolver';
import { useSchool } from '../../components/providers/school-context';

interface Props {
  teacherName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AddSpecialActivityForm({ teacherName: initialTeacherName, onSuccess, onCancel }: Props) {
  const [teacherName, setTeacherName] = useState(initialTeacherName || '');
  const [activityName, setActivityName] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient<Database>();
  const { currentSchool } = useSchool();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!teacherName || !activityName || !startTime || !endTime) {
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

      const { error: insertError } = await supabase
      .from('special_activities')
      .insert({
        provider_id: user.user.id,
        teacher_name: teacherName,
        activity_name: activityName,
        day_of_week: parseInt(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        school_site: currentSchool?.school_site
      });

      if (insertError) throw insertError;

      // Check for conflicts after successful insert
      const resolver = new ConflictResolver(user.user.id);
      const insertedActivity = {
        teacher_name: teacherName,
        activity_name: activityName,
        day_of_week: parseInt(dayOfWeek),
        start_time: startTime,
        end_time: endTime
      };

      const result = await resolver.resolveSpecialActivityConflicts(insertedActivity as any);

      if (result.resolved > 0 || result.failed > 0) {
        alert(`Special activity added. ${result.resolved} sessions rescheduled, ${result.failed} could not be rescheduled.`);
      }

      onSuccess();
    } catch (err) {
      console.error('Error adding activity:', err);
      setError('Failed to add activity');
    } finally {
      setLoading(false);
    }
  };

  // Generate time options (7 AM to 3 PM in 15-minute increments)
  const timeOptions: Array<{ value: string; label: string }> = [];
  for (let hour = 7; hour <= 15; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const displayHour = hour > 12 ? hour - 12 : hour;
      const amPm = hour >= 12 ? 'PM' : 'AM';
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const label = `${displayHour}:${minute.toString().padStart(2, '0')} ${amPm}`;
      timeOptions.push({ value: time, label });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">
          Teacher Name*
        </label>
        <input
          type="text"
          value={teacherName}
          onChange={(e) => setTeacherName(e.target.value)}
          placeholder="e.g., Mrs. Smith"
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Activity Name*
        </label>
        <input
          type="text"
          value={activityName}
          onChange={(e) => setActivityName(e.target.value)}
          placeholder="e.g., PE, Library, Music"
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
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
          {loading ? 'Adding...' : 'Add Activity'}
        </button>
      </div>
    </form>
  );
}