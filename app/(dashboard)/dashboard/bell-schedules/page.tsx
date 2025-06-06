'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../../../types/database';
import { Modal } from '../../../components/ui/modal';
import AddBellScheduleForm from '../../../components/bell-schedules/add-bell-schedule-form';
import BellScheduleCSVImport from '../../../components/bell-schedules/csv-import';
import { Card, CardHeader, CardTitle, CardBody, CardGrid } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];

export default function BellSchedulesPage() {
  const [schedules, setSchedules] = useState<BellSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const supabase = createClientComponentClient<Database>();

  console.log('Current state - showAddModal:', showAddModal, 'selectedGrade:', selectedGrade);

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('bell_schedules')
        .select('*')
        .order('grade_level', { ascending: true })
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      setSchedules(data || []);
    } catch (error) {
      console.error('Error fetching schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group schedules by grade level
  const schedulesByGrade = schedules.reduce((acc, schedule) => {
    if (!acc[schedule.grade_level]) {
      acc[schedule.grade_level] = [];
    }
    acc[schedule.grade_level].push(schedule);
    return acc;
  }, {} as Record<string, BellSchedule[]>);

  const grades = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading bell schedules...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          action={
            <Button
              onClick={() => setShowAddModal(true)}
              variant="primary"
              size="md"
            >
              Add Bell Schedule
            </Button>
          }
        >
          <div>
            <CardTitle as="h1" className="text-2xl">Bell Schedules</CardTitle>
            <p className="text-gray-600 mt-2">
              Define when each grade level is unavailable due to recess, lunch, or other activities
            </p>
          </div>
        </CardHeader>
      </Card>

      {/* Add this new section */}
      <div className="mb-6">
        <BellScheduleCSVImport onSuccess={fetchSchedules} />
      </div>  
      
      <div className="grid gap-6">
        {grades.map(grade => (
          <div key={grade} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Grade {grade}
              </h2>
              <button
                onClick={() => {
                  setSelectedGrade(grade);
                  setShowAddModal(true);
                  console.log('Modal should open, showAddModal:', true);
                }}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                {schedulesByGrade[grade] ? 'Edit Schedule' : 'Add Schedule'}
              </button>
            </div>

            {schedulesByGrade[grade] ? (
              <div className="grid grid-cols-5 gap-2 text-sm">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => (
                  <div key={day}>
                    <h3 className="font-medium text-gray-700 mb-2">{day}</h3>
                    <div className="space-y-1">
                      {schedulesByGrade[grade]
                        .filter(s => s.day_of_week === ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].indexOf(day.toLowerCase()) + 1)
                        .map(schedule => (
                          <div
                            key={schedule.id}
                            className="bg-gray-100 p-2 rounded text-xs"
                          >
                            <div className="font-medium">{schedule.subject}</div>
                            <div className="font-medium">{schedule.period_name}</div>
                            <div className="text-gray-600 text-xs">
                              {schedule.start_time.slice(0, 5)} - {schedule.end_time.slice(0, 5)}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No schedule configured</p>
            )}
          </div>
        ))}
      </div>

      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setSelectedGrade('');
        }}
        title={`${selectedGrade ? `Grade ${selectedGrade}` : 'Add'} Bell Schedule`}
      >
        {selectedGrade ? (
          <AddBellScheduleForm
            gradeLevel={selectedGrade}
            onSuccess={() => {
              fetchSchedules();
              // Keep modal open to add more time blocks
            }}
            onCancel={() => {
              setShowAddModal(false);
              setSelectedGrade('');
            }}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Select a grade level to add bell schedule:</p>
            <div className="grid grid-cols-3 gap-2">
              {grades.map(grade => (
                <button
                  key={grade}
                  onClick={() => setSelectedGrade(grade)}
                  className="p-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Grade {grade}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}