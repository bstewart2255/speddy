'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableActionCell } from '../../../components/ui/table';
import { StudentTag, StatusTag, GradeTag } from '../../../components/ui/tag';
import { getStudents, createStudent, deleteStudent, updateStudent } from '../../../../lib/supabase/queries/students';
import { getUnscheduledSessionsCount } from '../../../../lib/supabase/queries/schedule-sessions';
import { loadStudentsForUser, getUserRole } from '../../../../lib/supabase/queries/sea-students';
import StudentsCSVImport from '../../../components/students/csv-import';
import { useSchool } from '../../../components/providers/school-context';
import { createClient } from '@/lib/supabase/client';
import { StudentDetailsModal } from '../../../components/students/student-details-modal';
import { TeacherDetailsModal } from '../../../components/teachers/teacher-details-modal';
import { useRouter } from 'next/navigation';
import AIUploadButton from '../../../components/ai-upload/ai-upload-button';
import { StudentBulkImporter } from '../../../components/students/student-bulk-importer';
import { StudentImportPreviewModal } from '../../../components/students/student-import-preview-modal';

type Student = {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string | null;
  teacher_id?: string | null;
  sessions_per_week: number | null;
  minutes_per_session: number | null;
  provider_id: string;
  created_at: string;
  updated_at: string;
  school_site?: string | null;
  school_id?: string | null;
};

export default function StudentsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    initials: '',
    grade_level: '',
    teacher_name: '',
    sessions_per_week: '',
    minutes_per_session: '30'
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    sessions_per_week: '',
    minutes_per_session: ''
  });

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedTeacherName, setSelectedTeacherName] = useState<string | null>(null);
  const [unscheduledCount, setUnscheduledCount] = useState<number>(0);
  const [sortByGrade, setSortByGrade] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);
  const [showBulkImportSection, setShowBulkImportSection] = useState(false);
  const [bulkImportPreviewData, setBulkImportPreviewData] = useState<any>(null);
  const [worksAtMultipleSchools, setWorksAtMultipleSchools] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const { currentSchool, loading: schoolLoading } = useSchool();
  const router = useRouter();

  // Check if user has view-only access (SEA role)
  // Default to view-only until role is resolved to prevent privilege escalation
  const roleResolved = userRole !== null;
  const isViewOnly = !roleResolved || userRole === 'sea';

  // Check if user works at multiple schools
  useEffect(() => {
    const checkMultipleSchools = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('works_at_multiple_schools')
        .eq('id', user.id)
        .single();

      if (profile) {
        setWorksAtMultipleSchools(profile.works_at_multiple_schools);
      }
    };

    checkMultipleSchools();
  }, [supabase]);

  const checkUnscheduledSessions = useCallback(async () => {
    try {
      if (!currentSchool) {
        setUnscheduledCount(0);
        return;
      }
      const count = await getUnscheduledSessionsCount(currentSchool.school_site);
      setUnscheduledCount(count);
    } catch (error) {
      console.error('Error checking unscheduled sessions:', error);
      setUnscheduledCount(0);
    }
  }, [currentSchool]);

  const fetchStudents = useCallback(async () => {
    console.log('fetchStudents called');
    console.log('currentSchool:', currentSchool);
    console.log('userRole:', userRole);

    try {
      if (!currentSchool) {
        console.log('No currentSchool, returning early');
        setStudents([]);
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No user found');
        setStudents([]);
        setLoading(false);
        return;
      }

      // Get user role if not already set
      let currentRole = userRole;
      if (!currentRole) {
        const role = await getUserRole(user.id);
        setUserRole(role);
        currentRole = role; // Use the fresh role immediately
      }

      console.log('Fetching students for school:', currentSchool.display_name || currentSchool.school_site);
      console.log('Using role:', currentRole);

      // Use role-aware query for SEAs, standard query for others
      if (currentRole === 'sea') {
        console.log('Loading students for SEA user:', user.id);
        const { data, error } = await loadStudentsForUser(user.id, currentRole, {
          currentSchool
        });

        console.log('loadStudentsForUser response:', { data, error, hasData: !!data, hasError: !!error });

        if (error) {
          console.error('Error fetching SEA students:', {
            error,
            errorMessage: error?.message,
            errorCode: error?.code,
            errorDetails: error?.details,
            errorHint: error?.hint,
            fullError: JSON.stringify(error, null, 2)
          });
          setStudents([]);
        } else if (!Array.isArray(data)) {
          console.error('Data fetched is not an array!', data);
          setStudents([]);
        } else {
          console.log('SEA students data received:', data);
          setStudents(data as any);
        }
      } else {
        const data = await getStudents(currentSchool);

        if (!Array.isArray(data)) {
          console.error('Data fetched is not an array!', data);
          setStudents([]);
        } else {
          console.log('Students data received:', data);
          setStudents(data);
        }
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [currentSchool, userRole, supabase]);

  // Fetch students
  useEffect(() => {
    console.log('Students page useEffect triggered');
    console.log('currentSchool in useEffect:', currentSchool);
    
    fetchStudents();
    checkUnscheduledSessions();
  }, [currentSchool, fetchStudents, checkUnscheduledSessions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentSchool) {
      alert('No school selected');
      return;
    }

    try {
      const newStudent = await createStudent({
        initials: formData.initials,
        grade_level: formData.grade_level,
        teacher_name: formData.teacher_name,
        sessions_per_week: parseInt(formData.sessions_per_week),
        minutes_per_session: parseInt(formData.minutes_per_session),
        school_site: currentSchool?.school_site || '',
        school_district: currentSchool?.school_district || '',
        school_id: currentSchool?.school_id,
        district_id: currentSchool?.district_id,
        state_id: currentSchool?.state_id,
      });

      // Reset form
      setFormData({
        initials: '',
        grade_level: '',
        teacher_name: '',
        sessions_per_week: '',
        minutes_per_session: '30'
      });

      setShowAddForm(false);
      fetchStudents();
    } catch (error) {
      console.error('Error creating student:', error);
      alert(error.message || 'Failed to add student');
    }
  };

  const handleDelete = async (studentId: string, studentInitials: string) => {
    if (confirm(`Are you sure you want to delete ${studentInitials}? This will also delete all their scheduled sessions.`)) {
      try {
        await deleteStudent(studentId);
        fetchStudents();
        checkUnscheduledSessions();
      } catch (error) {
        console.error('Error deleting student:', error);
        alert('Failed to delete student. Please try again.');
      }
    }
  };

  const handleEdit = (student: Student) => {
    setEditingId(student.id);
    setEditFormData({
      sessions_per_week: student.sessions_per_week?.toString() || '',
      minutes_per_session: student.minutes_per_session?.toString() || ''
    });
  };

  const handleUpdate = async (studentId: string) => {
    try {
      await updateStudent(studentId, {
        sessions_per_week: parseInt(editFormData.sessions_per_week),
        minutes_per_session: parseInt(editFormData.minutes_per_session)
      });

      setEditingId(null);
      fetchStudents();
      checkUnscheduledSessions();
    } catch (error) {
      console.error('Error updating student:', error);
      alert('Failed to update student. Please try again.');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData({
      sessions_per_week: '',
      minutes_per_session: ''
    });
  };

  if (loading || schoolLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Loading students...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Students</h1>
            <p className="text-gray-600">{isViewOnly ? 'View your assigned students' : 'Manage your student caseload'}</p>
          </div>
          {!isViewOnly && (
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowImportSection(!showImportSection)}
              >
                Import CSV
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowBulkImportSection(!showBulkImportSection)}
              >
                Bulk Import Students
              </Button>
              <AIUploadButton
                uploadType="students"
                onSuccess={fetchStudents}
              />
              <Button
                variant="primary"
                onClick={() => setShowAddForm(true)}
              >
                + Add Student
              </Button>
            </div>
          )}
        </div>

        {/* Import Section */}
        {!isViewOnly && showImportSection && (
          <div className="mb-6">
            <Card>
              <CardBody className="p-6">
                <StudentsCSVImport
                  onSuccess={() => {
                    fetchStudents();
                    setShowImportSection(false);
                  }}
                  currentSchool={currentSchool}
                />
              </CardBody>
            </Card>
          </div>
        )}

        {/* Bulk Import Section */}
        {!isViewOnly && showBulkImportSection && (
          <div className="mb-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Bulk Import Students from SEIS Report</CardTitle>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowBulkImportSection(false)}
                  >
                    Close
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-6">
                <StudentBulkImporter
                  currentSchool={currentSchool}
                  onUploadComplete={(data) => {
                    setBulkImportPreviewData(data);
                  }}
                />
              </CardBody>
            </Card>
          </div>
        )}

        {/* Bulk Import Preview Modal */}
        {bulkImportPreviewData && (
          <StudentImportPreviewModal
            isOpen={!!bulkImportPreviewData}
            onClose={() => setBulkImportPreviewData(null)}
            data={bulkImportPreviewData}
            currentSchool={currentSchool}
            onImportComplete={() => {
              fetchStudents();
              setShowBulkImportSection(false);
              setBulkImportPreviewData(null);
            }}
          />
        )}

        {/* Unscheduled Sessions Notification */}
        {unscheduledCount > 0 && (
          <div className="mb-8 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-amber-400 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {unscheduledCount} session{unscheduledCount !== 1 ? 's' : ''} need{unscheduledCount === 1 ? 's' : ''} to be scheduled
                </p>
                <p className="text-sm text-amber-700">
                  Go to the <a href="/dashboard/schedule" className="underline font-medium">Schedule page</a> and click &quot;Schedule Sessions&quot; to add these to your calendar
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Add Student Form (Inline) */}
        {!isViewOnly && showAddForm && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center gap-4">
                  <CardTitle>Add New Student</CardTitle>
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
                  <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Student Initials*
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.initials}
                      onChange={(e) => setFormData({...formData, initials: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., JD"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Grade Level*
                    </label>
                    <select 
                      required
                      value={formData.grade_level}
                      onChange={(e) => setFormData({...formData, grade_level: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select grade</option>
                      <option value="K">K</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teacher Name*
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.teacher_name}
                      onChange={(e) => setFormData({...formData, teacher_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Smith"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sessions/Week*
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="20"
                      value={formData.sessions_per_week}
                      onChange={(e) => setFormData({...formData, sessions_per_week: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="2"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min/Session*
                    </label>
                    <select 
                      required
                      value={formData.minutes_per_session}
                      onChange={(e) => setFormData({...formData, minutes_per_session: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="30">30</option>
                      <option value="45">45</option>
                      <option value="60">60</option>
                    </select>
                  </div>

                  <div className="md:col-span-6 flex justify-end gap-3 pt-4">
                    <Button variant="secondary" type="button" onClick={() => setShowAddForm(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" type="submit">
                      Add Student
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Student Details Modal */}
        {selectedStudent && (
          <StudentDetailsModal
            isOpen={!!selectedStudent}
            onClose={() => setSelectedStudent(null)}
            student={{
              ...selectedStudent,
              teacher_name: selectedStudent.teacher_name || '',
              sessions_per_week: selectedStudent.sessions_per_week || 0,
              minutes_per_session: selectedStudent.minutes_per_session || 0
            }}
            readOnly={isViewOnly}
            onSave={(studentId, details) => {
            }}
            onUpdateStudent={async (studentId, updates) => {
              try {
                await updateStudent(studentId, updates);
                // Refresh the students list
                await fetchStudents();
                alert('Student information updated successfully!');
              } catch (error) {
                console.error('Error updating student:', error);
                alert('Failed to update student information.');
              }
            }}
          />
        )}

        {/* Teacher Details Modal */}
        {selectedTeacherName && (
          <TeacherDetailsModal
            isOpen={!!selectedTeacherName}
            onClose={() => setSelectedTeacherName(null)}
            teacherName={selectedTeacherName}
            onSave={async (teacher) => {
              // Refresh students list to show updated teacher name if changed
              await fetchStudents();
            }}
            onStudentClick={(student) => {
              // Find the full student object from our list
              const fullStudent = students.find(s => s.id === student.id);
              if (fullStudent) {
                setSelectedStudent(fullStudent);
              }
            }}
          />
        )}
        
        {/* Students List */}
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
            <CardTitle>Current Students ({students.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Schedule Requirements</TableHead>
                  {/* <TableHead>Progress</TableHead> */}
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Array.isArray(students) ? [...students] : [])
                  .sort((a, b) => {
                    if (!sortByGrade) return 0;

                    // Define grade order (K comes first, then 1-5)
                    const gradeOrder = ['K', '1', '2', '3', '4', '5'];
                    const aIndex = gradeOrder.indexOf(a.grade_level);
                    const bIndex = gradeOrder.indexOf(b.grade_level);

                    // If grade not found in order, put it at the end
                    if (aIndex === -1) return 1;
                    if (bIndex === -1) return -1;

                    return aIndex - bIndex;
                  })
                  .map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <button
                        onClick={() => setSelectedStudent(student)}
                        className="hover:opacity-80 transition-opacity"
                      >
                        <StudentTag initials={student.initials} />
                      </button>
                    </TableCell>
                    <TableCell>
                      <GradeTag grade={student.grade_level} />
                    </TableCell>
                    <TableCell>
                      {student.teacher_name ? (
                        <button
                          onClick={() => setSelectedTeacherName(student.teacher_name)}
                          className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        >
                          {student.teacher_name}
                        </button>
                      ) : (
                        <span className="text-gray-400 italic">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isViewOnly && editingId === student.id ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={editFormData.sessions_per_week}
                            onChange={(e) => setEditFormData({...editFormData, sessions_per_week: e.target.value})}
                            className="w-16 px-2 py-1 border border-gray-300 rounded"
                          />
                          <span>x/week,</span>
                          <select
                            value={editFormData.minutes_per_session}
                            onChange={(e) => setEditFormData({...editFormData, minutes_per_session: e.target.value})}
                            className="w-20 px-2 py-1 border border-gray-300 rounded"
                          >
                            <option value="30">30</option>
                            <option value="45">45</option>
                            <option value="60">60</option>
                          </select>
                          <span>min</span>
                        </div>
                      ) : student.sessions_per_week && student.minutes_per_session ? (
                        `${student.sessions_per_week}x/week, ${student.minutes_per_session} min`
                      ) : (
                        <span className="text-gray-400 italic">Not configured</span>
                      )}
                    </TableCell>
                    {/* <TableCell>
                      <button
                        onClick={() => router.push(`/progress/${student.id}`)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View Progress
                      </button>
                    </TableCell> */}
                    <TableActionCell>
                      {!isViewOnly && (
                        <>
                          {editingId === student.id ? (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleUpdate(student.id)}
                              >
                                Save
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCancelEdit}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleEdit(student)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDelete(student.id, student.initials)}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </TableActionCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

      </div>
    </div>
  );
}