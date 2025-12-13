'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SchoolForm, SchoolFormData } from '@/app/components/admin/school-form';
import { getSchoolDetails } from '@/lib/supabase/queries/admin-accounts';

export default function EditSchoolPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.schoolId as string;

  const [school, setSchool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSchool = async () => {
      try {
        setLoading(true);
        setError(null);
        const schoolData = await getSchoolDetails(schoolId);
        setSchool(schoolData);
      } catch (err) {
        console.error('Error loading school:', err);
        setError(err instanceof Error ? err.message : 'Failed to load school data');
      } finally {
        setLoading(false);
      }
    };

    if (schoolId) {
      fetchSchool();
    }
  }, [schoolId]);

  const handleSubmit = async (data: SchoolFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/district/schools/${schoolId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update school');
      }

      // Redirect back to the school detail page
      router.push(`/dashboard/admin/schools/${schoolId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(`/dashboard/admin/schools/${schoolId}`);
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading school details...</p>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-red-800">Error</h3>
          <p className="mt-1 text-sm text-red-700">{error || 'School not found'}</p>
          <Link href="/dashboard/admin/schools" className="mt-2 inline-flex text-sm text-red-600 hover:text-red-700">
            Back to schools list
          </Link>
        </div>
      </div>
    );
  }

  // Map school data to form format
  const initialData: Partial<SchoolFormData> = {
    name: school.name || '',
    city: school.city || '',
    schoolType: school.school_type || '',
    gradeSpanLow: school.grade_span_low || '',
    gradeSpanHigh: school.grade_span_high || '',
    phone: school.phone || '',
    website: school.website || '',
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
          <li>
            <Link href={`/dashboard/admin/schools/${schoolId}`} className="hover:text-indigo-600 truncate max-w-[150px]">
              {school.name}
            </Link>
          </li>
          <li>/</li>
          <li className="text-gray-900 font-medium">Edit</li>
        </ol>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Edit School</h1>
        <p className="mt-2 text-gray-600">
          Update the details for <strong>{school.name}</strong>.
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
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isSubmitting}
          isEditMode={true}
        />
      </div>
    </div>
  );
}
