'use client';

import { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableActionCell } from '../../../components/ui/table';
import { StudentTag, StatusTag, GradeTag } from '../../../components/ui/tag';
import { getStudents, createStudent, deleteStudent, updateStudent } from '../../../../lib/supabase/queries/students';

type Student = {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
  sessions_per_week: number;
  minutes_per_session: number;
  provider_id: string;
  created_at: string;
  updated_at: string;
};

export default function StudentsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Fetch students on mount
  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const data = await getStudents();
      setStudents(data);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createStudent({
        initials: formData.initials,
        grade_level: formData.grade_level,
        teacher_name: formData.teacher_name,
        sessions_per_week: parseInt(formData.sessions_per_week),
        minutes_per_session: parseInt(formData.minutes_per_session)
      });

      // Reset form and close
      setFormData({
        initials: '',
        grade_level: '',
        teacher_name: '',
        sessions_per_week: '',
        minutes_per_session: '30'
      });
      setShowAddForm(false);

      // Refresh student list
      fetchStudents();
    } catch (error) {
      console.error('Error adding student:', error);
      alert('Failed to add student. Please try again.');
    }
  };

  const handleDelete = async (studentId: string, studentInitials: string) => {
    if (confirm(`Are you sure you want to delete ${studentInitials}? This will also delete all their scheduled sessions.`)) {
      try {
        await deleteStudent(studentId);
        fetchStudents();
      } catch (error) {
        console.error('Error deleting student:', error);
        alert('Failed to delete student. Please try again.');
      }
    }
  };

  const handleEdit = (student: Student) => {
    setEditingId(student.id);
    setEditFormData({
      sessions_per_week: student.sessions_per_week.toString(),
      minutes_per_session: student.minutes_per_session.toString()
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

  if (loading) {
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
            <p className="text-gray-600">Manage your student caseload</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary">Import CSV</Button>
            <Button variant="secondary">Export CSV</Button>
            <Button 
              variant="primary" 
              onClick={() => setShowAddForm(!showAddForm)}
            >
              + Add Student
            </Button>
          </div>
        </div>

        {/* Add Student Form (Inline) */}
        {showAddForm && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
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
                      placeholder="e.g., Ms. Smith"
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
                      max="5"
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

        {/* Students List */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Current Students ({students.length})</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Schedule Requirements</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <StudentTag initials={student.initials} />
                    </TableCell>
                    <TableCell>
                      <GradeTag grade={student.grade_level} />
                    </TableCell>
                    <TableCell>{student.teacher_name}</TableCell>
                    <TableCell>
                      {editingId === student.id ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="number"
                            min="1"
                            max="5"
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
                      ) : (
                        `${student.sessions_per_week}x/week, ${student.minutes_per_session} min`
                      )}
                    </TableCell>
                    <TableActionCell>
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