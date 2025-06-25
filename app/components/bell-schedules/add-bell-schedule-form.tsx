'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../../src/types/database';
import { ConflictResolver } from '../../../lib/scheduling/conflict-resolver';
import { useSchool } from '../../components/providers/school-context';

type Props = {
  gradeLevel: string;
  onSuccess: () => void;
  onCancel: () => void;
};

export default function AddBellScheduleForm({ gradeLevel, onSuccess, onCancel }: Props) {
  const [dayOfWeek, setDayOfWeek] = useState('monday');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [subject, setSubject] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClientComponentClient<Database>();

  const { currentSchool } = useSchool();

  const dayToNumber = (day: string): number => {
    const days: { [key: string]: number } = {
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5
    };
    return days[day] || 1;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Validate times
      if (startTime >= endTime) {
        setError('End time must be after start time');
        setSubmitting(false);
        return;
      }

      const { error: insertError } = await supabase
      .from('bell_schedules')
      .insert([{
        provider_id: user.id,
        grade_level: gradeLevel,
        day_of_week: dayToNumber(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        period_name: subject.trim(),
        school_site: currentSchool?.school_site
      }]);

      if (insertError) throw insertError;

      // Check for conflicts after successful insert
      const resolver = new ConflictResolver(user.id);
      const insertedSchedule = {
        grade_level: gradeLevel.trim(),
        day_of_week: dayToNumber(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        period_name: subject.trim()
      };

      const result = await resolver.resolveBellScheduleConflicts(insertedSchedule as any);

      if (result.resolved > 0 || result.failed > 0) {
        alert(`Bell schedule added. ${result.resolved} sessions rescheduled, ${result.failed} could not be rescheduled.`);
      }

      // Reset form
      setStartTime('');
      setEndTime('');
      setSubject('');
      onSuccess();
    } catch (err) {
      console.error('Add schedule error:', err);
      setError(err instanceof Error ? err.message : 'Failed to add schedule');
    } finally {
      setSubmitting(false);
    }
  };

  // Add this timeOptions definition here
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
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Day of Week
        </label>
        <select
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          <option value="monday">Monday</option>
          <option value="tuesday">Tuesday</option>
          <option value="wednesday">Wednesday</option>
          <option value="thursday">Thursday</option>
          <option value="friday">Friday</option>
        </select>
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
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g., Recess, Lunch"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
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
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add Time Block'}
        </button>
      </div>
    </form>
  );
}