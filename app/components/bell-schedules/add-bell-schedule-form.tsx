'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '../../../src/types/database';
import { ConflictResolver } from '../../../lib/scheduling/conflict-resolver';
import { useSchool } from '../../components/providers/school-context';

type Props = {
  gradeLevel: string;
  onSuccess: () => void;
  onCancel: () => void;
};

export default function AddBellScheduleForm({ gradeLevel, onSuccess, onCancel }: Props) {
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

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

      // Create a bell schedule entry for each selected day
      for (const dayId of selectedDays) {
        try {
          // Build insert data with school_id (required after migration)
          const insertData = {
            provider_id: user.id,
            grade_level: gradeLevel,
            day_of_week: dayId,
            start_time: startTime,
            end_time: endTime,
            period_name: subject.trim(),
            school_id: currentSchool?.school_id,
          };

          const { error: insertError } = await supabase
            .from('bell_schedules')
            .insert([insertData]);

          if (insertError) {
            const dayName = daysOfWeek.find(d => d.id === dayId)?.name || `Day ${dayId}`;
            errors.push(`${dayName}: ${insertError.message}`);
            continue;
          }

          // Check for conflicts after successful insert
          const resolver = new ConflictResolver(user.id);
          const insertedSchedule = {
            grade_level: gradeLevel.trim(),
            day_of_week: dayId,
            start_time: startTime,
            end_time: endTime,
            period_name: subject.trim()
          };

          const result = await resolver.resolveBellScheduleConflicts(insertedSchedule as any);
          totalResolved += result.resolved;
          totalFailed += result.failed;
        } catch (err) {
          const dayName = daysOfWeek.find(d => d.id === dayId)?.name || `Day ${dayId}`;
          errors.push(`${dayName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Show results
      if (errors.length > 0) {
        setError(`Some schedules could not be added:\n${errors.join('\n')}`);
      } else {
        const scheduleCount = selectedDays.length;
        const message = scheduleCount === 1 
          ? 'Bell schedule added successfully.'
          : `${scheduleCount} bell schedules added successfully.`;
        
        if (totalResolved > 0 || totalFailed > 0) {
          alert(`${message} ${totalResolved} sessions rescheduled, ${totalFailed} could not be rescheduled.`);
        }
        
        // Reset form
        setStartTime('');
        setEndTime('');
        setSubject('');
        setSelectedDays([]);
        onSuccess();
      }
    } catch (err) {
      console.error('Add schedule error:', err);
      setError(err instanceof Error ? err.message : 'Failed to add schedules');
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
          disabled={submitting || selectedDays.length === 0}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {submitting 
            ? `Adding ${selectedDays.length} ${selectedDays.length === 1 ? 'Time Block' : 'Time Blocks'}...` 
            : selectedDays.length === 0
            ? 'Select Days'
            : `Add ${selectedDays.length} ${selectedDays.length === 1 ? 'Time Block' : 'Time Blocks'}`
          }
        </button>
      </div>
    </form>
  );
}