"use client";

import { useState } from "react";
import { AddStudentForm } from "../../../components/students/add-student-form";
import { StudentsList } from "../../../components/students/students-list";
import { Button } from "../../../components/ui/button";

export default function StudentsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleStudentAdded = () => {
    // Force refresh of the students list
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
              <Button onClick={() => setShowAddForm(true)} variant="primary">
                Add student
              </Button>
            </div>
          </div>

          {showAddForm && (
            <div className="mb-6 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Add New Student
              </h3>
              <AddStudentForm
                onClose={() => setShowAddForm(false)}
                onSuccess={() => {
                  handleStudentAdded();
                  setShowAddForm(false);
                }}
              />
            </div>
          )}

          <StudentsList key={refreshKey} />
        </div>
      </div>
    </div>
  );
}
