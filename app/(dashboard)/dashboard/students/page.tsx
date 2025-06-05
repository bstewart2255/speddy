'use client';

import { useState } from 'react';
import { Navbar } from '../../../components/navigation/navbar';
import { Modal } from '../../../components/ui/modal';
import { AddStudentForm } from '../../../components/students/add-student-form';
import { StudentsList } from '../../../components/students/students-list';

export default function StudentsPage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleStudentAdded = () => {
    // Force refresh of the students list
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 sm:px-0">
          <div className="sm:flex sm:items-center">
            <div className="sm:flex-auto">
              <h1 className="text-2xl font-semibold text-gray-900">Students</h1>
              <p className="mt-2 text-sm text-gray-700">
                Manage your student caseload
              </p>
            </div>
            <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Add student
              </button>
            </div>
          </div>
          
          <StudentsList key={refreshKey} />
        </div>
      </div>

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Student"
      >
        <AddStudentForm
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={() => {
            handleStudentAdded();
          }}
        />
      </Modal>
    </div>
  );
}
