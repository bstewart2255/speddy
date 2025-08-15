'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableActionCell } from '../../../components/ui/table';
import { Tag } from '../../../components/ui/tag';
import AddSpecialActivityForm from '../../../components/special-activities/add-special-activity-form';
import SpecialActivitiesCSVImport from '../../../components/special-activities/csv-import';
import { getSpecialActivities, deleteSpecialActivity } from '../../../../lib/supabase/queries/special-activities';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '../../../components/providers/school-context';
import AIUploadButton from '../../../components/ai-upload/ai-upload-button';
import { FilterSelect } from '../../../components/schedule/filter-select';
import { LastSaved } from '../../../components/ui/last-saved';
import { getLastSavedSpecialActivity } from '../../../../lib/supabase/queries/last-saved';

interface SpecialActivity {
  id: string;
  teacher_name: string;
  grade?: string; // If this is stored separately
  activity_name: string;
  start_time: string;
  end_time: string;
  day_of_week: number;
}

export default function SpecialActivitiesPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);
  const [specialActivities, setSpecialActivities] = useState<SpecialActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const { currentSchool } = useSchool();
  const supabase = createClient();
  
  // Filter states
  const [teacherFilter, setTeacherFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('');

  // Fetch special activities from database
  const fetchSpecialActivities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !currentSchool) return;

      let query = supabase
        .from('special_activities')
        .select('*')
        .eq('provider_id', user.id);
      
      if (currentSchool.school_id) {
        query = query.eq('school_id', currentSchool.school_id);
      }
      
      const { data, error } = await query
        .order('teacher_name', { ascending: true })
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      setSpecialActivities(data || []);
      
      // Fetch last saved timestamp
      const lastUpdated = await getLastSavedSpecialActivity(currentSchool || undefined);
      setLastSaved(lastUpdated);
    } catch (error) {
      console.error('Error fetching special activities:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (currentSchool) {
      fetchSpecialActivities();
    }
  }, [currentSchool]);

  // Handle delete
  const handleDelete = async (id: string, activityName: string) => {
    if (!confirm(`Are you sure you want to delete "${activityName}"?`)) {
      return;
    }

    try {
      setDeletingId(id);
      await deleteSpecialActivity(id);
      await fetchSpecialActivities(); // Refresh the list
    } catch (error) {
      alert('Failed to delete special activity');
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

  // Get activity type color
  const getActivityColor = (activity: string) => {
    const lowerActivity = activity.toLowerCase();
    if (lowerActivity.includes('pe') || lowerActivity.includes('physical')) return 'blue';
    if (lowerActivity.includes('music') || lowerActivity.includes('band')) return 'purple';
    if (lowerActivity.includes('art')) return 'orange';
    if (lowerActivity.includes('library')) return 'green';
    if (lowerActivity.includes('computer') || lowerActivity.includes('tech')) return 'gray';
    return 'gray';
  };
  
  // Filter special activities
  const filteredActivities = useMemo(() => {
    return specialActivities.filter(activity => {
      const teacherMatch = !teacherFilter || activity.teacher_name === teacherFilter;
      const dayMatch = !dayFilter || activity.day_of_week.toString() === dayFilter;
      const activityMatch = !activityFilter || activity.activity_name === activityFilter;
      
      return teacherMatch && dayMatch && activityMatch;
    });
  }, [specialActivities, teacherFilter, dayFilter, activityFilter]);
  
  // Get unique options for filters
  const teacherOptions = useMemo(() => {
    return [...new Set(specialActivities.map(a => a.teacher_name))]
      .filter(Boolean)
      .sort()
      .map(name => ({ value: name, label: name }));
  }, [specialActivities]);
  
  const activityOptions = useMemo(() => {
    return [...new Set(specialActivities.map(a => a.activity_name))]
      .filter(Boolean)
      .sort()
      .map(name => ({ value: name, label: name }));
  }, [specialActivities]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Special Activities</h1>
            <p className="text-gray-600">Manage teacher-specific activities (Music, Library, STEM, etc)</p>
          </div>
          <div className="flex items-center gap-3">
            <LastSaved timestamp={lastSaved} />
            <Button 
              variant="secondary" 
              onClick={() => setShowImportSection(!showImportSection)}
            >
              Import CSV
            </Button>
            <AIUploadButton 
              uploadType="special_activities" 
              onSuccess={() => {
                // Refresh special activities
                window.location.reload();
              }} 
            />
            <Button 
              variant="primary" 
              onClick={() => setShowAddForm(!showAddForm)}
            >
              + Add Activity
            </Button>
          </div>
        </div>

        {/* Import Section */}
        {showImportSection && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center gap-4">
                  <CardTitle>Import Special Activities</CardTitle>
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
                <SpecialActivitiesCSVImport onSuccess={() => {
                  setShowImportSection(false);
                  fetchSpecialActivities();
                }} />
              </CardBody>
            </Card>
          </div>
        )}

        {/* Add Activity Form - Inline */}
        {showAddForm && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center gap-4">
                  <CardTitle>Add New Special Activity</CardTitle>
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
                <AddSpecialActivityForm
                  teacherName=""
                  onSuccess={() => {
                    setShowAddForm(false);
                    fetchSpecialActivities();
                  }}
                  onCancel={() => setShowAddForm(false)}
                />
              </CardBody>
            </Card>
          </div>
        )}

        {/* Special Activities List */}
        <Card>
          <CardHeader>
            <CardTitle>Current Special Activities ({filteredActivities.length})</CardTitle>
          </CardHeader>
          <CardBody>
            {/* Filter Section */}
            <div className="mb-4">
              <div className="flex flex-wrap gap-4">
                <FilterSelect
                  label="Teacher:"
                  value={teacherFilter}
                  onChange={setTeacherFilter}
                  options={teacherOptions}
                  placeholder="All Teachers"
                />
                <FilterSelect
                  label="Day:"
                  value={dayFilter}
                  onChange={setDayFilter}
                  options={[
                    { value: '1', label: 'Monday' },
                    { value: '2', label: 'Tuesday' },
                    { value: '3', label: 'Wednesday' },
                    { value: '4', label: 'Thursday' },
                    { value: '5', label: 'Friday' }
                  ]}
                  placeholder="All Days"
                />
                <FilterSelect
                  label="Activity:"
                  value={activityFilter}
                  onChange={setActivityFilter}
                  options={activityOptions}
                  placeholder="All Activities"
                />
              </div>
            </div>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : filteredActivities.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {specialActivities.length === 0 
                  ? "No special activities yet. Click 'Add Activity' to get started."
                  : "No special activities match the selected filters"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActivities
                    .sort((a, b) => {
                      // Sort by teacher, then day, then time
                      if (a.teacher_name !== b.teacher_name) {
                        return a.teacher_name.localeCompare(b.teacher_name);
                      }
                      if (a.day_of_week !== b.day_of_week) {
                        return a.day_of_week - b.day_of_week;
                      }
                      return a.start_time.localeCompare(b.start_time);
                    })
                    .map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell>
                          <span className="font-medium">{activity.teacher_name}</span>
                        </TableCell>
                        <TableCell>
                          <Tag variant={getActivityColor(activity.activity_name)}>
                            {activity.activity_name}
                          </Tag>
                        </TableCell>
                        <TableCell>{dayNumberToName(activity.day_of_week)}</TableCell>
                        <TableCell>
                          {formatTime(activity.start_time)} - {formatTime(activity.end_time)}
                        </TableCell>
                        <TableActionCell>
                          <Button 
                            variant="danger" 
                            size="sm"
                            onClick={() => handleDelete(activity.id, activity.activity_name)}
                            disabled={deletingId === activity.id}
                          >
                            {deletingId === activity.id ? 'Deleting...' : 'Delete'}
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