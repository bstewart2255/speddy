'use client';

import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableActionCell } from '../../../components/ui/table';
import { StudentTag, StatusTag, GradeTag } from '../../../components/ui/tag';

export default function StudentsPage() {
  const [showAddForm, setShowAddForm] = useState(false);

  // Sample data - replace with your actual data fetching
  const students = [
    { id: 1, initials: 'BS', grade: '3', teacher: 'Steele', sessionsPerWeek: 3, minutesPerSession: 30, scheduled: 3, required: 3 },
    { id: 2, initials: 'JM', grade: '2', teacher: 'Johnson', sessionsPerWeek: 2, minutesPerSession: 45, scheduled: 1, required: 2 },
    { id: 3, initials: 'AL', grade: 'K', teacher: 'Davis', sessionsPerWeek: 4, minutesPerSession: 30, scheduled: 4, required: 4 },
    { id: 4, initials: 'MK', grade: '1', teacher: 'Wilson', sessionsPerWeek: 2, minutesPerSession: 30, scheduled: 0, required: 2 },
  ];

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
                <form className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Student Initials*
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., JD"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Grade Level*
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <option>Select grade</option>
                      <option>K</option>
                      <option>1</option>
                      <option>2</option>
                      <option>3</option>
                      <option>4</option>
                      <option>5</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teacher Name*
                    </label>
                    <input
                      type="text"
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
                      min="1"
                      max="5"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="2"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min/Session*
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <option>30</option>
                      <option>45</option>
                      <option>60</option>
                    </select>
                  </div>

                  <div className="md:col-span-6 flex justify-end gap-3 pt-4">
                    <Button variant="secondary" onClick={() => setShowAddForm(false)}>
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
              <div className="flex gap-2">
                <span className="text-sm text-gray-500">
                  {students.filter(s => s.scheduled === s.required).length} fully scheduled
                </span>
                <span className="text-sm text-gray-500">•</span>
                <span className="text-sm text-gray-500">
                  {students.filter(s => s.scheduled < s.required).length} need scheduling
                </span>
              </div>
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
                  <TableHead>Status</TableHead>
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
                      <GradeTag grade={student.grade} />
                    </TableCell>
                    <TableCell>{student.teacher}</TableCell>
                    <TableCell>
                      {student.sessionsPerWeek}x/week, {student.minutesPerSession} min
                    </TableCell>
                    <TableCell>
                      <StatusTag completed={student.scheduled} total={student.required} />
                    </TableCell>
                    <TableActionCell>
                      <Button variant="secondary" size="sm">Edit</Button>
                      <Button variant="danger" size="sm">Delete</Button>
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