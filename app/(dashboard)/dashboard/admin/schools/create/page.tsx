'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SchoolForm, SchoolFormData } from '@/app/components/admin/school-form';

export default function CreateSchoolPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: SchoolFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/district/schools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create school');
      }

      // Redirect to the new school's page
      router.push(`/dashboard/admin/schools/${result.school.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/dashboard/admin/schools');
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <ol className="flex items-center space-x-2 text-sm text-gray-500">
          <li>
            <Link href="/dashboard/admin" className="hover:text-indigo-600">
              Dashboard
            </Link>
          </li>
          <li>/</li>
          <li>
            <Link href="/dashboard/admin/schools" className="hover:text-indigo-600">
              Schools
            </Link>
          </li>
          <li>/</li>
          <li className="text-gray-900 font-medium">Create School</li>
        </ol>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Create New School</h1>
        <p className="mt-2 text-gray-600">
          Add a new school to your district. This school will be available for staff assignments.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Form Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <SchoolForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isSubmitting}
          isEditMode={false}
        />
      </div>
    </div>
  );
}
