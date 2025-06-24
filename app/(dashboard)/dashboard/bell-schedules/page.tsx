'use client';

import { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableActionCell } from '../../../components/ui/table';
import { GradeTag } from '../../../components/ui/tag';
import AddBellScheduleForm from '../../../components/bell-schedules/add-bell-schedule-form';
import BellScheduleCSVImport from '../../../components/bell-schedules/csv-import';
import { getBellSchedules, deleteBellSchedule } from '../../../../lib/supabase/queries/bell-schedules';

export default function BellSchedulesPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<string>('K');
  const [bellSchedules, setBellSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortByGrade, setSortByGrade] = useState(false);

  // Fetch bell schedules from database
  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const data = await getBellSchedules();
      setBellSchedules(data);
    } catch (error) {
      console.error('Error fetching bell schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  // Handle delete
  const handleDelete = async (id: string, periodName: string) => {
    if (!confirm(`Are you sure you want to delete "${periodName}"?`)) {
      return;
    }

    try {
      setDeletingId(id);
      await deleteBellSchedule(id);
      await fetchSchedules(); // Refresh the list
    } catch (error) {
      alert('Failed to delete bell schedule');
      console.error(error);
    } finally {
      setDeletingId(null);
    }
  };

  // Format time for display
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Convert day number to name
  const dayNumberToName = (day: number) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    return days[day - 1] || 'Unknown';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bell Schedules</h1>
            <p className="text-gray-600">Manage grade-level time restrictions</p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="secondary"
              onClick={() => setShowImportSection(!showImportSection)}
            >
              Import CSV
            </Button>
            <Button 
              variant="primary" 
              onClick={() => setShowAddForm(!showAddForm)}
            >
              + Add Schedule
            </Button>
          </div>
        </div>

        {/* Import Section */}
        {showImportSection && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Import Bell Schedules</CardTitle>
                  <Button 
                    variant="secondary" 
                    onClick={() => setShowImportSection(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                <BellScheduleCSVImport onSuccess={() => {
                  setShowImportSection(false);
                  fetchSchedules();
                }} />
              </CardBody>
            </Card>
          </div>
        )}

        {/* Add Schedule Form - Inline */}
        {showAddForm && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Add New Bell Schedule</CardTitle>
                  <Button 
                    variant="secondary" 
                    onClick={() => setShowAddForm(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Grade Level
                  </label>
                  <div className="flex gap-2">
                    {['K', '1', '2', '3', '4', '5'].map((grade) => (
                      <button
                        key={grade}
                        onClick={() => setSelectedGrade(grade)}
                        className={`px-4 py-2 rounded-md font-medium transition-colors ${
                          selectedGrade === grade
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Grade {grade}
                      </button>
                    ))}
                  </div>
                </div>
                <AddBellScheduleForm
                  gradeLevel={selectedGrade}
                  onSuccess={() => {
                    setShowAddForm(false);
                    fetchSchedules();
                  }}
                  onCancel={() => setShowAddForm(false)}
                />
              </CardBody>
            </Card>
          </div>
        )}

        {/* Bell Schedules List */}
        <Card>
          <CardHeader
            action={
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sortByGrade}
                  onChange={(e) => setSortByGrade(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-sm font-medium text-gray-700">Sort by Grade</span>
              </label>
            }
          >
            <CardTitle>Current Bell Schedules ({bellSchedules.length})</CardTitle>
          </CardHeader>
          <CardBody>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : bellSchedules.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No bell schedules yet. Click "Add Schedule" to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grade</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...bellSchedules]
                    .sort((a, b) => {
                      if (!sortByGrade) return 0;

                      // Helper function to extract grade number
                      const getGradeValue = (grade: string) => {
                        if (grade === 'K') return 0;
                        // Handle formats like "1", "1st", "2nd", etc.
                        const num = parseInt(grade);
                        return isNaN(num) ? 999 : num;
                      };

                      const aValue = getGradeValue(a.grade_level);
                      const bValue = getGradeValue(b.grade_level);

                      return aValue - bValue;
                    })
                    .map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <GradeTag grade={schedule.grade_level} />
                      </TableCell>
                      <TableCell>{schedule.period_name}</TableCell>
                      <TableCell>{dayNumberToName(schedule.day_of_week)}</TableCell>
                      <TableCell>
                        {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                      </TableCell>
                      <TableActionCell>
                        <Button 
                          variant="danger" 
                          size="sm"
                          onClick={() => handleDelete(schedule.id, schedule.period_name)}
                          disabled={deletingId === schedule.id}
                        >
                          {deletingId === schedule.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </TableActionCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

      </div>
    </div>
  );
}