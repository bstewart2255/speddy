'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../../../src/types/database';
import { Modal } from '../../../components/ui/modal';
import AddSpecialActivityForm from '../../../components/special-activities/add-special-activity-form';
import SpecialActivitiesCSVImport from '../../../components/special-activities/csv-import';

type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];

export default function SpecialActivitiesPage() {
  const [activities, setActivities] = useState<SpecialActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');
  const supabase = createClientComponentClient<Database>();
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');

  useEffect(() => {
    fetchActivities();
  }, []);

  async function fetchActivities() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('special_activities')
        .select('*')
        .order('teacher_name', { ascending: true })
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleAddActivity = (teacherName: string) => {
    setSelectedTeacher(teacherName);
    setShowAddModal(true);
  };

  const handleDeleteActivity = async (id: string) => {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    try {
      const { error } = await supabase
        .from('special_activities')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchActivities();
    } catch (error) {
      console.error('Error deleting activity:', error);
      alert('Failed to delete activity');
    }
  };

  const activitiesByTeacher = activities.reduce((acc, activity) => {
    if (!acc[activity.teacher_name]) {
      acc[activity.teacher_name] = [];
    }
    acc[activity.teacher_name].push(activity);
    return acc;
  }, {} as Record<string, SpecialActivity[]>);

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Special Activities</h1>
        <p className="text-gray-600 mt-2">
          Define recurring activities that make students unavailable (assemblies, PE, library, etc.)
        </p>
      </div>

      <div className="mb-6">
        <SpecialActivitiesCSVImport onSuccess={fetchActivities} />
      </div>

      <div className="mb-6">
        <button
          onClick={() => setShowTeacherModal(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Add Activity for New Teacher
        </button>
      </div>

      {Object.keys(activitiesByTeacher).length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No special activities defined yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(activitiesByTeacher).map(([teacherName, teacherActivities]) => (
            <div key={teacherName} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">{teacherName}</h2>
                <button
                  onClick={() => handleAddActivity(teacherName)}
                  className="text-blue-500 hover:text-blue-700 text-sm"
                >
                  + Add Activity
                </button>
              </div>

              <div className="grid grid-cols-5 gap-4">
                {daysOfWeek.map((day, dayIndex) => (
                  <div key={day} className="border rounded p-2">
                    <h3 className="font-medium text-sm mb-2">{day}</h3>
                    <div className="space-y-1">
                      {teacherActivities
                        .filter(activity => activity.day_of_week === dayIndex + 1)
                        .map((activity) => (
                          <div
                            key={activity.id}
                            className="bg-gray-100 p-2 rounded text-xs group relative"
                          >
                            <div className="font-medium">{activity.activity_name}</div>
                            <div>{activity.start_time.slice(0, 5)} - {activity.end_time.slice(0, 5)}</div>
                            <button
                              onClick={() => handleDeleteActivity(activity.id)}
                              className="absolute top-1 right-1 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Teacher Name Modal */}
      {showTeacherModal && (
        <Modal
          isOpen={showTeacherModal}
          onClose={() => {
            setShowTeacherModal(false);
            setNewTeacherName('');
          }}
          title="Enter Teacher Name"
        >
          <div className="space-y-4">
            <input
              type="text"
              value={newTeacherName}
              onChange={(e) => setNewTeacherName(e.target.value)}
              placeholder="e.g., Mrs. Johnson"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowTeacherModal(false);
                  setNewTeacherName('');
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newTeacherName.trim()) {
                    handleAddActivity(newTeacherName.trim());
                    setNewTeacherName('');
                    setShowTeacherModal(false);
                  }
                }}
                disabled={!newTeacherName.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </Modal>
      )}
      
      {showAddModal && (
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title={`Add Activity for ${selectedTeacher}`}
        >
          <AddSpecialActivityForm
            teacherName={selectedTeacher}
            onSuccess={() => {
              setShowAddModal(false);
              fetchActivities();
            }}
            onCancel={() => setShowAddModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}