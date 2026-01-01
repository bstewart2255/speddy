'use client';

import React, { useState } from 'react';
import { Button } from '../../../../../components/ui/button';
import { addBellSchedule } from '../../../../../../lib/supabase/queries/bell-schedules';
import { addSpecialActivityAsAdmin } from '../../../../../../lib/supabase/queries/special-activities';
import { BELL_SCHEDULE_ACTIVITIES, SPECIAL_ACTIVITY_TYPES } from '../../../../../../lib/constants/activity-types';
import { TeacherAutocomplete } from '../../../../../components/teachers/teacher-autocomplete';

interface CreateItemModalProps {
  day: number;
  startTime: string;
  schoolId: string;
  onClose: () => void;
  onSuccess: () => void;
  defaultTab?: 'bell' | 'activity';
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const GRADES = ['TK', 'K', '1', '2', '3', '4', '5'];

export function CreateItemModal({
  day,
  startTime,
  schoolId,
  onClose,
  onSuccess,
  defaultTab = 'bell'
}: CreateItemModalProps) {
  const [tab, setTab] = useState<'bell' | 'activity'>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bell schedule form state
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [periodName, setPeriodName] = useState('');
  const [bellEndTime, setBellEndTime] = useState(() => {
    // Default to 30 minutes after start
    const [h, m] = startTime.split(':').map(Number);
    const endMinutes = h * 60 + m + 30;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  });

  // Activity form state
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [activityName, setActivityName] = useState('');
  const [activityEndTime, setActivityEndTime] = useState(() => {
    const [h, m] = startTime.split(':').map(Number);
    const endMinutes = h * 60 + m + 30;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  });

  const handleGradeToggle = (grade: string) => {
    setSelectedGrades(prev =>
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
    setLoading(true);

    try {
      if (tab === 'bell') {
        // Validate bell schedule
        if (selectedGrades.length === 0) {
          setError('Please select at least one grade');
          setLoading(false);
          return;
        }
        if (!periodName) {
          setError('Please select an activity type');
          setLoading(false);
          return;
        }

        await addBellSchedule({
          grade_level: selectedGrades.join(','),
          day_of_week: day,
          start_time: startTime,
          end_time: bellEndTime,
          period_name: periodName,
          school_id: schoolId
        }, 'site_admin');
      } else {
        // Validate activity
        if (!teacherId) {
          setError('Please select a teacher');
          setLoading(false);
          return;
        }
        if (!activityName) {
          setError('Please select an activity type');
          setLoading(false);
          return;
        }

        await addSpecialActivityAsAdmin({
          teacher_id: teacherId,
          teacher_name: teacherName,
          activity_name: activityName,
          day_of_week: day,
          start_time: startTime,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Add to Schedule
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {DAYS[day - 1]} at {formatTime(startTime)}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
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
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              tab === 'activity'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('activity')}
          >
            Special Activity
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

              {/* End time */}
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
            </>
          ) : (
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
                  onChange={(e) => setActivityName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select activity...</option>
                  {SPECIAL_ACTIVITY_TYPES.map((activity) => (
                    <option key={activity} value={activity}>
                      {activity}
                    </option>
                  ))}
                </select>
              </div>

              {/* End time */}
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
