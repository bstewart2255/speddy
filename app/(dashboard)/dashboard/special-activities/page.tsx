'use client';

import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableActionCell } from '../../../components/ui/table';
import { Tag, ActivityTypeTag } from '../../../components/ui/tag';

export default function SpecialActivitiesPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);

  // Sample data - replace with your actual data fetching
  const specialActivities = [
    { 
      id: 1, 
      name: 'Spring Assembly', 
      date: 'June 15, 2025', 
      startTime: '10:00 AM', 
      endTime: '11:30 AM', 
      affectedGrades: 'K-5', 
      type: 'assembly',
      description: 'End of year celebration assembly'
    },
    { 
      id: 2, 
      name: 'Zoo Field Trip', 
      date: 'June 20, 2025', 
      startTime: '9:00 AM', 
      endTime: '3:00 PM', 
      affectedGrades: '2-3', 
      type: 'field-trip',
      description: 'Educational visit to city zoo'
    },
    { 
      id: 3, 
      name: 'Fire Safety Presentation', 
      date: 'June 25, 2025', 
      startTime: '1:00 PM', 
      endTime: '2:00 PM', 
      affectedGrades: 'K-1', 
      type: 'presentation',
      description: 'Fire department safety education'
    },
    { 
      id: 4, 
      name: 'Book Fair', 
      date: 'June 28, 2025', 
      startTime: '8:00 AM', 
      endTime: '4:00 PM', 
      affectedGrades: 'K-5', 
      type: 'other',
      description: 'Annual school book fair event'
    },
  ];

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'assembly': return 'blue';
      case 'field-trip': return 'green';
      case 'presentation': return 'orange';
      case 'other': return 'purple';
      default: return 'gray';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Special Activities</h1>
            <p className="text-gray-600">Manage assemblies, field trips, and other special events</p>
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
              + Add Activity
            </Button>
          </div>
        </div>

        {/* Import Section */}
        {showImportSection && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
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
                <div className="bg-purple-50 border-2 border-dashed border-purple-300 rounded-lg p-8 text-center">
                  <div className="mb-4">
                    <svg className="mx-auto h-12 w-12 text-purple-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M8 14v20c0 4.418 7.163 8 16 8 1.381 0 2.721-.087 4-.252M8 14c0 4.418 7.163 8 16 8s16-3.582 16-8M8 14c0-4.418 7.163-8 16-8s16 3.582 16 8m0 0v14m-16-4h.01M32 6.401V4.992c0-.552-.449-1-1.003-1H9.003C8.449 3.992 8 4.44 8 4.992v1.409" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="mb-4">
                    <p className="text-lg font-medium text-gray-900 mb-2">Upload Activities CSV</p>
                    <p className="text-sm text-gray-600">
                      CSV should include: Name, Date, Start Time, End Time, Affected Grades, Type
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

        {/* Add Activity Form */}
        {showAddForm && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
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
                <form className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Activity Name*
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Spring Assembly"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type*
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <option value="">Select type</option>
                      <option value="assembly">Assembly</option>
                      <option value="field-trip">Field Trip</option>
                      <option value="presentation">Presentation</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date*
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
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

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Affected Grades*
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., K-2 or 3,4,5"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., End of year celebration assembly"
                    />
                  </div>

                  <div className="md:col-span-6 flex justify-end gap-3 pt-4">
                    <Button variant="secondary" onClick={() => setShowAddForm(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" type="submit">
                      Add Activity
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Special Activities List */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Upcoming Activities ({specialActivities.length})</CardTitle>
              <div className="flex gap-2 text-sm text-gray-500">
                <span>{specialActivities.filter(a => a.type === 'assembly').length} assemblies</span>
                <span>•</span>
                <span>{specialActivities.filter(a => a.type === 'field-trip').length} field trips</span>
                <span>•</span>
                <span>{specialActivities.filter(a => !['assembly', 'field-trip'].includes(a.type)).length} other events</span>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Affected Grades</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {specialActivities.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell>
                      <span className="font-medium">{activity.name}</span>
                    </TableCell>
                    <TableCell>
                      <Tag variant={getTypeColor(activity.type)}>
                        {activity.type === 'field-trip' ? 'Field Trip' : 
                         activity.type.charAt(0).toUpperCase() + activity.type.slice(1)}
                      </Tag>
                    </TableCell>
                    <TableCell>{formatDate(activity.date)}</TableCell>
                    <TableCell>{activity.startTime} - {activity.endTime}</TableCell>
                    <TableCell>
                      <Tag variant="gray">{activity.affectedGrades}</Tag>
                    </TableCell>
                    <TableCell className="text-gray-600 max-w-xs truncate">
                      {activity.description}
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