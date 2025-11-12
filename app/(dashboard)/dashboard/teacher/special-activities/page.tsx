'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/app/components/ui/card';
import { getCurrentTeacher, getMySpecialActivities, createSpecialActivity, deleteSpecialActivity } from '@/lib/supabase/queries/teacher-portal';

interface SpecialActivity {
  id: string;
  teacher_name: string;
  activity_name: string;
  start_time: string;
  end_time: string;
  day_of_week: number;
  created_by_role: string;
  created_by_id: string;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function TeacherSpecialActivitiesPage() {
  const [activities, setActivities] = useState<SpecialActivity[]>([]);
  const [allActivities, setAllActivities] = useState<SpecialActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [teacher, setTeacher] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my');
  const supabase = createClient();

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get teacher info
      const teacherData = await getCurrentTeacher();
      setTeacher(teacherData);

      // Fetch teacher's own activities
      const myActivitiesData = await getMySpecialActivities();
      setActivities(myActivitiesData as SpecialActivity[]);

      // Fetch all visible activities (own + RS activities at school)
      const { data: { user } } = await supabase.auth.getUser();
      if (user && teacherData.school_id) {
        const { data, error: fetchError } = await supabase
          .from('special_activities')
          .select('*')
          .eq('school_id', teacherData.school_id)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true });

        if (fetchError) throw fetchError;
        setAllActivities(data || []);
      }
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError(err instanceof Error ? err.message : 'Failed to load activities');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleAddActivity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      setError(null);

      if (!teacher) {
        throw new Error('Teacher information not loaded');
      }

      const teacherName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim();

      await createSpecialActivity({
        teacher_name: teacherName,
        day_of_week: parseInt(formData.get('day_of_week') as string),
        start_time: formData.get('start_time') as string,
        end_time: formData.get('end_time') as string,
        activity_name: formData.get('activity_name') as string,
        school_id: teacher.school_id,
      });

      setShowAddForm(false);
      await fetchActivities();
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      console.error('Error adding activity:', err);
      setError(err instanceof Error ? err.message : 'Failed to add activity');
    }
  };

  const handleDelete = async (id: string, activityName: string) => {
    if (!confirm(`Are you sure you want to delete "${activityName}"?`)) {
      return;
    }

    try {
      setDeletingId(id);
      await deleteSpecialActivity(id);
      await fetchActivities();
    } catch (err) {
      console.error('Error deleting activity:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete activity');
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const displayActivities = viewMode === 'my' ? activities : allActivities;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading activities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Special Activities</h1>
        <p className="mt-2 text-gray-600">
          Manage class activities that appear in the resource specialist's schedule
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <Card className="mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">Activities</h2>
            <div className="flex items-center gap-4">
              {/* View Toggle */}
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button
                  onClick={() => setViewMode('my')}
                  className={`px-4 py-2 text-sm font-medium ${
                    viewMode === 'my'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  My Activities ({activities.length})
                </button>
                <button
                  onClick={() => setViewMode('all')}
                  className={`px-4 py-2 text-sm font-medium border-l border-gray-300 ${
                    viewMode === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  All Activities ({allActivities.length})
                </button>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                {showAddForm ? 'Cancel' : '+ Add Activity'}
              </button>
            </div>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <form onSubmit={handleAddActivity} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="activity_name" className="block text-sm font-medium text-gray-700">
                    Activity Name
                  </label>
                  <input
                    type="text"
                    name="activity_name"
                    id="activity_name"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    placeholder="e.g., PE, Library, Art"
                  />
                </div>

                <div>
                  <label htmlFor="day_of_week" className="block text-sm font-medium text-gray-700">
                    Day of Week
                  </label>
                  <select
                    name="day_of_week"
                    id="day_of_week"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="">Select a day</option>
                    {DAYS_OF_WEEK.map((day, index) => (
                      <option key={day} value={index + 1}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="start_time" className="block text-sm font-medium text-gray-700">
                    Start Time
                  </label>
                  <input
                    type="time"
                    name="start_time"
                    id="start_time"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="end_time" className="block text-sm font-medium text-gray-700">
                    End Time
                  </label>
                  <input
                    type="time"
                    name="end_time"
                    id="end_time"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                >
                  Add Activity
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Activities List */}
        <div className="px-6 py-4">
          {displayActivities.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No special activities</h3>
              <p className="mt-1 text-sm text-gray-500">
                {viewMode === 'my'
                  ? 'Get started by creating your first special activity.'
                  : 'No activities found at your school.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Activity
                    </th>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Teacher
                    </th>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Day
                    </th>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created By
                    </th>
                    {viewMode === 'my' && (
                      <th className="px-6 py-3 bg-gray-50 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayActivities.map((activity) => (
                    <tr key={activity.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{activity.activity_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{activity.teacher_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {DAYS_OF_WEEK[activity.day_of_week - 1]}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatTime(activity.start_time)} - {formatTime(activity.end_time)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            activity.created_by_role === 'teacher'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {activity.created_by_role === 'teacher' ? 'Teacher' : 'Resource Specialist'}
                        </span>
                      </td>
                      {viewMode === 'my' && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDelete(activity.id, activity.activity_name)}
                            disabled={deletingId === activity.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            {deletingId === activity.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Information Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-blue-800">About Special Activities</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                Special activities you create will appear in the resource specialist's schedule, helping them plan
                around your class activities like PE, library time, or assemblies.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
