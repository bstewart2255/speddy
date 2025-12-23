'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkDuplicateTeachers, getCurrentAdminPermissions, getDistrictSchools } from '@/lib/supabase/queries/admin-accounts';
import { getCurrentUserSchoolId } from '@/lib/supabase/queries/school-directory';
import { Card } from '@/app/components/ui/card';
import { TeacherCredentialsModal } from '@/app/components/admin/teacher-credentials-modal';
import Link from 'next/link';

const SPECIALIST_ROLES = [
  { value: 'resource', label: 'Resource Specialist' },
  { value: 'speech', label: 'Speech Therapist' },
  { value: 'ot', label: 'Occupational Therapist' },
  { value: 'counseling', label: 'Counselor' },
  { value: 'sea', label: 'Special Education Assistant' },
  { value: 'psychologist', label: 'School Psychologist' },
] as const;

export default function CreateAccountPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<'teacher' | 'specialist'>('teacher');
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    classroom_number: '',
    phone_number: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; temporaryPassword: string } | null>(null);

  // District admin state
  const [isDistrictAdmin, setIsDistrictAdmin] = useState(false);
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [districtSchools, setDistrictSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);

  // Specialist form data
  const [specialistData, setSpecialistData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    role: 'resource' as 'resource' | 'speech' | 'ot' | 'counseling' | 'sea' | 'psychologist',
    school_ids: [] as string[],
    primary_school_id: '',
  });

  // Check if current user is a district admin on mount
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const perms = await getCurrentAdminPermissions();
        const districtPerm = perms.find(p => p.role === 'district_admin' && p.district_id);
        if (districtPerm && districtPerm.district_id) {
          setIsDistrictAdmin(true);
          setDistrictId(districtPerm.district_id);
        }
      } catch (err) {
        console.error('Error checking admin permissions:', err);
      }
    };
    checkPermissions();
  }, []);

  // Fetch district schools when specialist mode is activated
  useEffect(() => {
    if (accountType === 'specialist' && districtId && districtSchools.length === 0) {
      const fetchSchools = async () => {
        setLoadingSchools(true);
        try {
          const schools = await getDistrictSchools(districtId);
          setDistrictSchools(schools.map(s => ({ id: s.id, name: s.name })));
        } catch (err) {
          console.error('Error fetching district schools:', err);
          setError('Failed to load schools');
        } finally {
          setLoadingSchools(false);
        }
      };
      fetchSchools();
    }
  }, [accountType, districtId, districtSchools.length]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
    setDuplicateWarning(null);
  };

  const handleSpecialistInputChange = (field: string, value: string | string[]) => {
    setSpecialistData(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-set primary school if only one school is selected
      if (field === 'school_ids' && Array.isArray(value)) {
        if (value.length === 1) {
          updated.primary_school_id = value[0];
        } else if (value.length === 0) {
          updated.primary_school_id = '';
        } else if (!value.includes(updated.primary_school_id)) {
          // If current primary school was deselected, reset to first selected
          updated.primary_school_id = value[0];
        }
      }
      return updated;
    });
    setError(null);
  };

  const toggleSchoolSelection = (schoolId: string) => {
    const currentSelection = specialistData.school_ids;
    const newSelection = currentSelection.includes(schoolId)
      ? currentSelection.filter(id => id !== schoolId)
      : [...currentSelection, schoolId];
    handleSpecialistInputChange('school_ids', newSelection);
  };

  const checkForDuplicates = async () => {
    if (!formData.first_name || !formData.last_name) return;

    try {
      // Get current user's school ID
      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId) {
        setError('Could not determine your school. Please try again.');
        return;
      }

      const duplicates = await checkDuplicateTeachers(
        formData.first_name,
        formData.last_name,
        schoolId
      );

      if (duplicates.length > 0) {
        const names = duplicates.map(t =>
          `${t.first_name} ${t.last_name}${t.classroom_number ? ` (Room ${t.classroom_number})` : ''}`
        ).join(', ');
        setDuplicateWarning(
          `Warning: Similar teacher(s) already exist: ${names}. ` +
          'Please verify this is not a duplicate before creating.'
        );
      } else {
        setDuplicateWarning(null);
      }
    } catch (err) {
      console.error('Error checking duplicates:', err);
      // Don't block creation if duplicate check fails
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (accountType === 'teacher') {
        // Validate email is provided
        if (!formData.email) {
          throw new Error('Email is required to create a teacher account');
        }

        // Get current user's school ID
        const schoolId = await getCurrentUserSchoolId();

        if (!schoolId) {
          throw new Error('Could not determine your school. Please contact support.');
        }

        // Call the new API endpoint to create teacher account with credentials
        const response = await fetch('/api/admin/create-teacher-account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            first_name: formData.first_name,
            last_name: formData.last_name,
            email: formData.email,
            classroom_number: formData.classroom_number || null,
            phone_number: formData.phone_number || null,
            school_id: schoolId,
            school_site: null, // Optional field
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to create teacher account');
        }

        // Show credentials modal with the generated password
        setCredentials(data.credentials);
        setShowCredentialsModal(true);
      } else if (accountType === 'specialist') {
        // Validate specialist form
        if (!specialistData.first_name || !specialistData.last_name) {
          throw new Error('First name and last name are required');
        }
        if (!specialistData.email) {
          throw new Error('Email is required');
        }
        if (specialistData.school_ids.length === 0) {
          throw new Error('Please select at least one school');
        }

        // Call the district providers API
        const response = await fetch('/api/admin/district/providers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            first_name: specialistData.first_name,
            last_name: specialistData.last_name,
            email: specialistData.email,
            role: specialistData.role,
            school_ids: specialistData.school_ids,
            primary_school_id: specialistData.primary_school_id || specialistData.school_ids[0],
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to create specialist account');
        }

        // Show credentials modal with the generated password
        setCredentials(data.credentials);
        setShowCredentialsModal(true);
      }
    } catch (err) {
      console.error('Error creating account:', err);
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsModalClose = () => {
    setShowCredentialsModal(false);
    setCredentials(null);
    // Redirect based on account type
    if (accountType === 'specialist') {
      router.push('/dashboard/admin');
    } else {
      router.push('/dashboard/admin/teachers');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create New Account</h1>
        <p className="mt-2 text-gray-600">
          Add a teacher or specialist account at your school
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Account Type Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Account Type
            </label>
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setAccountType('teacher')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                  accountType === 'teacher'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold">Teacher</div>
                <div className="text-xs mt-1">General education teacher</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isDistrictAdmin) {
                    setAccountType('specialist');
                    setError(null);
                  } else {
                    setError('Specialist account creation is only available for district administrators.');
                  }
                }}
                className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                  accountType === 'specialist'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                } ${!isDistrictAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!isDistrictAdmin}
              >
                <div className="font-semibold">Specialist</div>
                <div className="text-xs mt-1">Resource specialist or service provider</div>
              </button>
            </div>
          </div>

          {accountType === 'teacher' && (
            <>
              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="first_name"
                    required
                    value={formData.first_name}
                    onChange={(e) => handleInputChange('first_name', e.target.value)}
                    onBlur={checkForDuplicates}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="last_name"
                    required
                    value={formData.last_name}
                    onChange={(e) => handleInputChange('last_name', e.target.value)}
                    onBlur={checkForDuplicates}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Smith"
                  />
                </div>
              </div>

              {/* Duplicate Warning */}
              {duplicateWarning && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex">
                    <svg className="h-5 w-5 text-yellow-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="ml-3 text-sm text-yellow-700">{duplicateWarning}</p>
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="john.smith@school.edu"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Required for login. A temporary password will be generated.
                </p>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="classroom_number" className="block text-sm font-medium text-gray-700 mb-1">
                    Classroom Number
                  </label>
                  <input
                    type="text"
                    id="classroom_number"
                    value={formData.classroom_number}
                    onChange={(e) => handleInputChange('classroom_number', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Room 101"
                  />
                </div>
                <div>
                  <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="phone_number"
                    value={formData.phone_number}
                    onChange={(e) => handleInputChange('phone_number', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
            </>
          )}

          {accountType === 'specialist' && (
            <>
              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="specialist_first_name" className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="specialist_first_name"
                    required
                    value={specialistData.first_name}
                    onChange={(e) => handleSpecialistInputChange('first_name', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label htmlFor="specialist_last_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="specialist_last_name"
                    required
                    value={specialistData.last_name}
                    onChange={(e) => handleSpecialistInputChange('last_name', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Doe"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="specialist_email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="specialist_email"
                  required
                  value={specialistData.email}
                  onChange={(e) => handleSpecialistInputChange('email', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="jane.doe@district.edu"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Required for login. A temporary password will be generated.
                </p>
              </div>

              {/* Specialty/Role */}
              <div>
                <label htmlFor="specialist_role" className="block text-sm font-medium text-gray-700 mb-1">
                  Specialty <span className="text-red-500">*</span>
                </label>
                <select
                  id="specialist_role"
                  value={specialistData.role}
                  onChange={(e) => handleSpecialistInputChange('role', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  {SPECIALIST_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* School Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assigned Schools <span className="text-red-500">*</span>
                </label>
                {loadingSchools ? (
                  <div className="text-sm text-gray-500">Loading schools...</div>
                ) : districtSchools.length === 0 ? (
                  <div className="text-sm text-gray-500">No schools found in your district</div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {districtSchools.map((school) => (
                      <label
                        key={school.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={specialistData.school_ids.includes(school.id)}
                          onChange={() => toggleSchoolSelection(school.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-700">{school.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Select one or more schools where this specialist will work.
                </p>
              </div>

              {/* Primary School Selection (only if multiple schools selected) */}
              {specialistData.school_ids.length > 1 && (
                <div>
                  <label htmlFor="primary_school" className="block text-sm font-medium text-gray-700 mb-1">
                    Primary School <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="primary_school"
                    value={specialistData.primary_school_id}
                    onChange={(e) => handleSpecialistInputChange('primary_school_id', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    {specialistData.school_ids.map((schoolId) => {
                      const school = districtSchools.find(s => s.id === schoolId);
                      return (
                        <option key={schoolId} value={schoolId}>
                          {school?.name || schoolId}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Select the primary school for this specialist's profile.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <svg className="h-5 w-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="ml-3 text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <Link
              href="/dashboard/admin/teachers"
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>
      </Card>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <svg className="h-5 w-5 text-blue-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="ml-3 text-sm text-blue-700">
            <p className="font-medium mb-1">How It Works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>A secure temporary password will be auto-generated</li>
              <li>You'll receive the login credentials to share with the teacher</li>
              <li>Teacher can log in immediately with the provided credentials</li>
              <li>Recommend teacher changes password after first login</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Credentials Modal */}
      {credentials && (
        <TeacherCredentialsModal
          isOpen={showCredentialsModal}
          onClose={handleCredentialsModalClose}
          credentials={credentials}
          teacherName={
            accountType === 'specialist'
              ? `${specialistData.first_name} ${specialistData.last_name}`
              : `${formData.first_name} ${formData.last_name}`
          }
        />
      )}
    </div>
  );
}
