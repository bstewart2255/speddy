'use client';

import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableActionCell } from '../../../components/ui/table';
import { Tag, ActivityTypeTag } from '../../../components/ui/tag';

export default function BellSchedulesPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);

  // Sample data - replace with your actual data fetching
  const bellSchedules = [
    { id: 1, name: 'Period 1', days: 'Mon-Fri', startTime: '8:00 AM', endTime: '8:50 AM', description: 'First Period Classes', type: 'period' },
    { id: 2, name: 'Period 2', days: 'Mon-Fri', startTime: '9:00 AM', endTime: '9:50 AM', description: 'Second Period Classes', type: 'period' },
    { id: 3, name: 'Recess', days: 'Mon-Fri', startTime: '10:00 AM', endTime: '10:15 AM', description: 'Morning Recess Break', type: 'break' },
    { id: 4, name: 'Lunch', days: 'Mon-Fri', startTime: '12:00 PM', endTime: '1:00 PM', description: 'Lunch Break - No Scheduling', type: 'lunch' },
    { id: 5, name: 'Period 6', days: 'Mon-Fri', startTime: '2:30 PM', endTime: '3:20 PM', description: 'Sixth Period Classes', type: 'period' },
  ];

  const getTypeVariant = (type: string) => {
    switch (type) {
      case 'period': return 'blue';
      case 'break': return 'orange';
      case 'lunch': return 'red';
      default: return 'gray';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bell Schedules</h1>
            <p className="text-gray-600">Manage class periods and restricted time blocks</p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="secondary"
              onClick={() => setShowImportSection(!showImportSection)}
            >
              Import CSV
            </Button>
            <Button variant="secondary">Export CSV</Button>
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
                <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-8 text-center">
                  <div className="mb-4">
                    <svg className="mx-auto h-12 w-12 text-blue-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="mb-4">
                    <p className="text-lg font-medium text-gray-900 mb-2">Upload Bell Schedule CSV</p>
                    <p className="text-sm text-gray-600">
                      CSV should include: Name, Days, Start Time, End Time, Description
                    </p>
                  </div>
                  <div className="flex justify-center gap-4">
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      id="csv-upload"
                    />
                    <label htmlFor="csv-upload">
                      <Button variant="primary" as="span" className="cursor-pointer">
                        Choose File
                      </Button>
                    </label>
                    <Button variant="secondary">Download Template</Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Add Schedule Form */}
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
                <form className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Schedule Name*
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Period 1"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Days*
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <option>Mon-Fri</option>
                      <option>Monday</option>
                      <option>Tuesday</option>
                      <option>Wednesday</option>
                      <option>Thursday</option>
                      <option>Friday</option>
                    </select>
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Time*
                    </label>
                    <input
                      type="time"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Time*
                    </label>
                    <input
                      type="time"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type*
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <option value="period">Class Period</option>
                      <option value="break">Break/Recess</option>
                      <option value="lunch">Lunch</option>
                      <option value="assembly">Assembly</option>
                    </select>
                  </div>

                  <div className="md:col-span-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., First Period Classes"
                    />
                  </div>

                  <div className="md:col-span-6 flex justify-end gap-3 pt-4">
                    <Button variant="secondary" onClick={() => setShowAddForm(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" type="submit">
                      Add Schedule
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Bell Schedules List */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Current Bell Schedules ({bellSchedules.length})</CardTitle>
              <div className="flex gap-2 text-sm text-gray-500">
                <span>{bellSchedules.filter(s => s.type === 'period').length} class periods</span>
                <span>•</span>
                <span>{bellSchedules.filter(s => s.type !== 'period').length} restricted blocks</span>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bellSchedules.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell>
                      <span className="font-medium">{schedule.name}</span>
                    </TableCell>
                    <TableCell>
                      <Tag variant={getTypeVariant(schedule.type)}>
                        {schedule.type.charAt(0).toUpperCase() + schedule.type.slice(1)}
                      </Tag>
                    </TableCell>
                    <TableCell>{schedule.days}</TableCell>
                    <TableCell>{schedule.startTime}</TableCell>
                    <TableCell>{schedule.endTime}</TableCell>
                    <TableCell className="text-gray-600">{schedule.description}</TableCell>
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