'use client';

import { useState } from 'react';
import { createStudent } from '../../../lib/supabase/queries/students';

interface AddStudentFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddStudentForm({ onClose, onSuccess }: AddStudentFormProps) {
  const [formData, setFormData] = useState({
    initials: '',
    grade: '',
    teacherName: '',
    sessionsPerWeek: '',
    minutesPerSession: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await createStudent({
        initials: formData.initials.toUpperCase(),
        grade_level: formData.grade,  // Map grade to grade_level
        teacher_name: formData.teacherName,
        sessions_per_week: parseInt(formData.sessionsPerWeek),
        minutes_per_session: parseInt(formData.minutesPerSession),
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error adding student:', err);
      setError(err instanceof Error ? err.message : 'Failed to add student');
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="initials" className="block text-sm font-medium text-gray-700">
          Student Initials
        </label>
        <input
          type="text"
          name="initials"
          id="initials"
          required
          maxLength={4}
          placeholder="JS"
          value={formData.initials}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
        />
      </div>

      <div>
        <label htmlFor="grade" className="block text-sm font-medium text-gray-700">
          Grade
        </label>
        <select
          name="grade"
          id="grade"
          required
          value={formData.grade}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
        >
          <option value="">Select grade</option>
          <option value="K">Kindergarten</option>
          <option value="1">1st Grade</option>
          <option value="2">2nd Grade</option>
          <option value="3">3rd Grade</option>
          <option value="4">4th Grade</option>
          <option value="5">5th Grade</option>
          <option value="6">6th Grade</option>
          <option value="7">7th Grade</option>
          <option value="8">8th Grade</option>
        </select>
      </div>

      <div>
        <label htmlFor="teacherName" className="block text-sm font-medium text-gray-700">
          Teacher Name
        </label>
        <input
          type="text"
          name="teacherName"
          id="teacherName"
          required
          placeholder="Mrs. Smith"
          value={formData.teacherName}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sessionsPerWeek" className="block text-sm font-medium text-gray-700">
            Sessions/Week
          </label>
          <input
            type="number"
            name="sessionsPerWeek"
            id="sessionsPerWeek"
            required
            min="1"
            max="5"
            value={formData.sessionsPerWeek}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          />
        </div>

        <div>
          <label htmlFor="minutesPerSession" className="block text-sm font-medium text-gray-700">
            Minutes/Session
          </label>
          <input
            type="number"
            name="minutesPerSession"
            id="minutesPerSession"
            required
            min="15"
            max="60"
            step="5"
            value={formData.minutesPerSession}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          />
        </div>
      </div>

      <div className="mt-6 flex gap-3 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Adding...' : 'Add Student'}
        </button>
      </div>
    </form>
  );
}
