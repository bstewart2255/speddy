'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSchoolDetails, getSchoolStaff } from '@/lib/supabase/queries/admin-accounts';
import Link from 'next/link';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { DeleteConfirmationModal } from '@/app/components/admin/delete-confirmation-modal';
import { CredentialsModal } from '@/app/components/admin/credentials-modal';

interface DependencyCount {
  label: string;
  count: number;
}

export default function SchoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.schoolId as string;

  const [school, setSchool] = useState<any>(null);
  const [staff, setStaff] = useState<{ siteAdmins: any[]; teachers: any[]; specialists: any[] }>({
    siteAdmins: [],
    teachers: [],
    specialists: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteCheckLoading, setDeleteCheckLoading] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [blockerReason, setBlockerReason] = useState<string | undefined>();
  const [dependencyCounts, setDependencyCounts] = useState<DependencyCount[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Site Admin modal state
  const [showAddSiteAdminModal, setShowAddSiteAdminModal] = useState(false);
  const [showSiteAdminCredentials, setShowSiteAdminCredentials] = useState(false);
  const [siteAdminCredentials, setSiteAdminCredentials] = useState({ email: '', temporaryPassword: '' });
  const [newSiteAdminName, setNewSiteAdminName] = useState('');
  const [siteAdminFormData, setSiteAdminFormData] = useState({ firstName: '', lastName: '', email: '' });
  const [isSavingSiteAdmin, setIsSavingSiteAdmin] = useState(false);
  const [siteAdminError, setSiteAdminError] = useState<string | null>(null);
  const [isRemovingSiteAdmin, setIsRemovingSiteAdmin] = useState(false);

  // Teacher modal state
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [showTeacherCredentials, setShowTeacherCredentials] = useState(false);
  const [teacherCredentials, setTeacherCredentials] = useState({ email: '', temporaryPassword: '' });
  const [newTeacherName, setNewTeacherName] = useState('');
  const [teacherFormData, setTeacherFormData] = useState({ firstName: '', lastName: '', email: '', classroomNumber: '', phoneNumber: '' });
  const [isSavingTeacher, setIsSavingTeacher] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);
  const [removingTeacherId, setRemovingTeacherId] = useState<string | null>(null);

  // Provider modal state
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [showProviderCredentials, setShowProviderCredentials] = useState(false);
  const [providerCredentials, setProviderCredentials] = useState({ email: '', temporaryPassword: '' });
  const [newProviderName, setNewProviderName] = useState('');
  const [providerFormData, setProviderFormData] = useState<{ firstName: string; lastName: string; email: string; role: 'resource' | 'speech' | 'ot' | 'counseling' | 'sea' | 'psychologist' }>({ firstName: '', lastName: '', email: '', role: 'resource' });
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [removingProviderId, setRemovingProviderId] = useState<string | null>(null);

  useEffect(() => {
    const fetchSchoolData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [schoolData, staffData] = await Promise.all([
          getSchoolDetails(schoolId),
          getSchoolStaff(schoolId)
        ]);

        setSchool(schoolData);
        setStaff(staffData);
      } catch (err) {
        console.error('Error loading school:', err);
        setError(err instanceof Error ? err.message : 'Failed to load school data');
      } finally {
        setLoading(false);
      }
    };

    if (schoolId) {
      fetchSchoolData();
    }
  }, [schoolId]);

  // Handle opening delete modal
  const handleDeleteClick = async () => {
    setShowDeleteModal(true);
    setDeleteCheckLoading(true);

    try {
      const response = await fetch(`/api/admin/district/schools/${schoolId}`);
      const data = await response.json();

      if (response.ok) {
        setCanDelete(data.canDelete);
        setBlockerReason(data.blockerReason);
        setDependencyCounts(data.dependencyCounts || []);
      } else {
        setCanDelete(false);
        setBlockerReason(data.error || 'Unable to check delete status');
      }
    } catch (err) {
      setCanDelete(false);
      setBlockerReason('Failed to check if school can be deleted');
    } finally {
      setDeleteCheckLoading(false);
    }
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/district/schools/${schoolId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/dashboard/admin/schools');
      } else {
        const data = await response.json();
        setBlockerReason(data.error || 'Failed to delete school');
        setCanDelete(false);
      }
    } catch (err) {
      setBlockerReason('An error occurred while deleting the school');
      setCanDelete(false);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle adding a site admin
  const handleAddSiteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSiteAdmin(true);
    setSiteAdminError(null);

    try {
      const response = await fetch('/api/admin/district/site-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: siteAdminFormData.firstName.trim(),
          last_name: siteAdminFormData.lastName.trim(),
          email: siteAdminFormData.email.trim(),
          school_id: schoolId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create site admin');
      }

      // Store credentials and show credentials modal
      setSiteAdminCredentials(data.credentials);
      setNewSiteAdminName(`${siteAdminFormData.firstName} ${siteAdminFormData.lastName}`);
      setShowAddSiteAdminModal(false);
      setShowSiteAdminCredentials(true);

      // Refresh staff data
      const staffData = await getSchoolStaff(schoolId);
      setStaff(staffData);

      // Reset form
      setSiteAdminFormData({ firstName: '', lastName: '', email: '' });
    } catch (err) {
      setSiteAdminError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSavingSiteAdmin(false);
    }
  };

  // Handle removing a site admin
  const handleRemoveSiteAdmin = async (adminId: string) => {
    if (!confirm('Are you sure you want to remove this site admin? They will lose access to manage this school.')) {
      return;
    }

    setIsRemovingSiteAdmin(true);

    try {
      const response = await fetch(`/api/admin/district/site-admin/${adminId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove site admin');
      }

      // Refresh staff data
      const staffData = await getSchoolStaff(schoolId);
      setStaff(staffData);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove site admin');
    } finally {
      setIsRemovingSiteAdmin(false);
    }
  };

  // Handle adding a teacher
  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTeacher(true);
    setTeacherError(null);

    try {
      const response = await fetch('/api/admin/district/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: teacherFormData.firstName.trim(),
          last_name: teacherFormData.lastName.trim(),
          email: teacherFormData.email.trim(),
          school_id: schoolId,
          classroom_number: teacherFormData.classroomNumber.trim() || undefined,
          phone_number: teacherFormData.phoneNumber.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create teacher');
      }

      // Store credentials and show credentials modal
      setTeacherCredentials(data.credentials);
      setNewTeacherName(`${teacherFormData.firstName} ${teacherFormData.lastName}`);
      setShowAddTeacherModal(false);
      setShowTeacherCredentials(true);

      // Refresh staff data
      const staffData = await getSchoolStaff(schoolId);
      setStaff(staffData);

      // Reset form
      setTeacherFormData({ firstName: '', lastName: '', email: '', classroomNumber: '', phoneNumber: '' });
    } catch (err) {
      setTeacherError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSavingTeacher(false);
    }
  };

  // Handle removing a teacher
  const handleRemoveTeacher = async (teacherId: string) => {
    if (!confirm('Are you sure you want to delete this teacher? This action cannot be undone.')) {
      return;
    }

    setRemovingTeacherId(teacherId);

    try {
      const response = await fetch(`/api/admin/district/teachers/${teacherId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete teacher');
      }

      // Refresh staff data
      const staffData = await getSchoolStaff(schoolId);
      setStaff(staffData);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete teacher');
    } finally {
      setRemovingTeacherId(null);
    }
  };

  // Handle adding a provider
  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProvider(true);
    setProviderError(null);

    try {
      const response = await fetch('/api/admin/district/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: providerFormData.firstName.trim(),
          last_name: providerFormData.lastName.trim(),
          email: providerFormData.email.trim(),
          role: providerFormData.role,
          school_ids: [schoolId],
          primary_school_id: schoolId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create provider');
      }

      // Store credentials and show credentials modal
      setProviderCredentials(data.credentials);
      setNewProviderName(`${providerFormData.firstName} ${providerFormData.lastName}`);
      setShowAddProviderModal(false);
      setShowProviderCredentials(true);

      // Refresh staff data
      const staffData = await getSchoolStaff(schoolId);
      setStaff(staffData);

      // Reset form
      setProviderFormData({ firstName: '', lastName: '', email: '', role: 'resource' });
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSavingProvider(false);
    }
  };

  // Handle removing a provider
  const handleRemoveProvider = async (providerId: string) => {
    if (!confirm('Are you sure you want to remove this provider? They will lose access to this school.')) {
      return;
    }

    setRemovingProviderId(providerId);

    try {
      const response = await fetch(`/api/admin/district/providers/${providerId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove provider');
      }

      // Refresh staff data
      const staffData = await getSchoolStaff(schoolId);
      setStaff(staffData);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove provider');
    } finally {
      setRemovingProviderId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading school details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
              <Link href="/dashboard/admin/schools" className="mt-2 inline-flex text-sm text-red-600 hover:text-red-700">
                Back to schools list
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900">School not found</h3>
          <Link href="/dashboard/admin/schools" className="mt-4 inline-flex text-indigo-600 hover:text-indigo-700">
            Back to schools list
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/dashboard/admin" className="hover:text-gray-700">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/dashboard/admin/schools" className="hover:text-gray-700">
            Schools
          </Link>
          <span>/</span>
          <span className="text-gray-900 truncate max-w-xs">{school.name}</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{school.name}</h1>
            <div className="mt-2 text-sm text-gray-600 space-y-1">
              <p>
                <span className="font-medium">School ID:</span> <span className="font-mono">{school.id}</span>
                {school.district && (
                  <> · <span className="font-medium">District:</span> {school.district.name}</>
                )}
              </p>
              {(school.city || school.phone || school.grade_span_low) && (
                <p>
                  {school.city && <>{school.city}{school.zip ? `, ${school.zip}` : ''}</>}
                  {school.city && school.phone && <> · </>}
                  {school.phone && <>{school.phone}</>}
                  {(school.city || school.phone) && school.grade_span_low && <> · </>}
                  {school.grade_span_low && <>Grades {school.grade_span_low} - {school.grade_span_high || '12'}</>}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/admin/schools/${schoolId}/edit`}>
              <Button variant="secondary">
                Edit School
              </Button>
            </Link>
            <Button
              variant="secondary"
              onClick={handleDeleteClick}
              className="text-red-600 hover:bg-red-50"
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Teachers</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{staff.teachers.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Providers</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{staff.specialists.length}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Staff</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {staff.teachers.length + staff.specialists.length}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Site Admin */}
      <Card className="p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Site Admin</h2>
          {staff.siteAdmins.length === 0 && (
            <Button
              variant="primary"
              onClick={() => setShowAddSiteAdminModal(true)}
            >
              + Add Site Admin
            </Button>
          )}
        </div>
        {staff.siteAdmins.length === 0 ? (
          <p className="text-sm text-gray-500">No site admin assigned to this school.</p>
        ) : (
          <div className="space-y-3">
            {staff.siteAdmins.map((admin: any) => (
              <div key={admin.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-full">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{admin.full_name}</p>
                    <p className="text-sm text-gray-500">{admin.email}</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => handleRemoveSiteAdmin(admin.id)}
                  disabled={isRemovingSiteAdmin}
                  className="text-red-600 hover:bg-red-50"
                >
                  {isRemovingSiteAdmin ? 'Removing...' : 'Remove'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Providers List */}
      <Card className="p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Providers ({staff.specialists.length})
          </h2>
          <Button
            variant="primary"
            onClick={() => setShowAddProviderModal(true)}
          >
            + Add Provider
          </Button>
        </div>
        {staff.specialists.length === 0 ? (
          <p className="text-sm text-gray-500">No providers found at this school.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {staff.specialists.map((specialist: any) => (
                  <tr key={specialist.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {specialist.full_name}
                        </span>
                        {!specialist.isPrimarySchool && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            Part Time
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {specialist.email || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-500 capitalize">
                        {specialist.role === 'resource' ? 'Resource Specialist' :
                         specialist.role === 'speech' ? 'Speech Therapist' :
                         specialist.role === 'ot' ? 'OT' :
                         specialist.role === 'counseling' ? 'Counselor' :
                         specialist.role === 'sea' ? 'SEA' :
                         specialist.role === 'psychologist' ? 'School Psychologist' :
                         specialist.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleRemoveProvider(specialist.id)}
                        disabled={removingProviderId === specialist.id}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {removingProviderId === specialist.id ? 'Removing...' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Teachers List */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Teachers ({staff.teachers.length})
          </h2>
          <Button
            variant="primary"
            onClick={() => setShowAddTeacherModal(true)}
          >
            + Add Teacher
          </Button>
        </div>
        {staff.teachers.length === 0 ? (
          <p className="text-sm text-gray-500">No teachers found at this school.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Classroom
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {staff.teachers.map((teacher: any) => (
                  <tr key={teacher.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">
                        {teacher.first_name} {teacher.last_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {teacher.email || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {teacher.classroom_number || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleRemoveTeacher(teacher.id)}
                        disabled={removingTeacherId === teacher.id}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {removingTeacherId === teacher.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete School"
        itemName={school.name}
        itemType="school"
        canDelete={!deleteCheckLoading && canDelete}
        blockerReason={deleteCheckLoading ? 'Checking if school can be deleted...' : blockerReason}
        dependencyCounts={dependencyCounts}
        isDeleting={isDeleting}
      />

      {/* Add Site Admin Modal */}
      {showAddSiteAdminModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 m-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add Site Admin</h2>
            <p className="text-sm text-gray-600 mb-6">
              Create a new site admin account for <strong>{school.name}</strong>. They will have full administrative access to this school.
            </p>

            {siteAdminError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm">{siteAdminError}</p>
              </div>
            )}

            <form onSubmit={handleAddSiteAdmin} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={siteAdminFormData.firstName}
                    onChange={(e) => setSiteAdminFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={siteAdminFormData.lastName}
                    onChange={(e) => setSiteAdminFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={siteAdminFormData.email}
                  onChange={(e) => setSiteAdminFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="john.smith@school.edu"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddSiteAdminModal(false);
                    setSiteAdminError(null);
                    setSiteAdminFormData({ firstName: '', lastName: '', email: '' });
                  }}
                  disabled={isSavingSiteAdmin}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSavingSiteAdmin || !siteAdminFormData.firstName.trim() || !siteAdminFormData.lastName.trim() || !siteAdminFormData.email.trim()}
                >
                  {isSavingSiteAdmin ? 'Creating...' : 'Create Site Admin'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Site Admin Credentials Modal */}
      <CredentialsModal
        isOpen={showSiteAdminCredentials}
        onClose={() => setShowSiteAdminCredentials(false)}
        credentials={siteAdminCredentials}
        accountName={newSiteAdminName}
        accountType="site_admin"
      />

      {/* Add Teacher Modal */}
      {showAddTeacherModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 m-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add Teacher</h2>
            <p className="text-sm text-gray-600 mb-6">
              Create a new teacher account for <strong>{school.name}</strong>.
            </p>

            {teacherError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm">{teacherError}</p>
              </div>
            )}

            <form onSubmit={handleAddTeacher} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={teacherFormData.firstName}
                    onChange={(e) => setTeacherFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={teacherFormData.lastName}
                    onChange={(e) => setTeacherFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={teacherFormData.email}
                  onChange={(e) => setTeacherFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="jane.doe@school.edu"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Classroom Number
                  </label>
                  <input
                    type="text"
                    value={teacherFormData.classroomNumber}
                    onChange={(e) => setTeacherFormData(prev => ({ ...prev, classroomNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Room 101"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={teacherFormData.phoneNumber}
                    onChange={(e) => setTeacherFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="555-1234"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddTeacherModal(false);
                    setTeacherError(null);
                    setTeacherFormData({ firstName: '', lastName: '', email: '', classroomNumber: '', phoneNumber: '' });
                  }}
                  disabled={isSavingTeacher}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSavingTeacher || !teacherFormData.firstName.trim() || !teacherFormData.lastName.trim() || !teacherFormData.email.trim()}
                >
                  {isSavingTeacher ? 'Creating...' : 'Create Teacher'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Teacher Credentials Modal */}
      <CredentialsModal
        isOpen={showTeacherCredentials}
        onClose={() => setShowTeacherCredentials(false)}
        credentials={teacherCredentials}
        accountName={newTeacherName}
        accountType="teacher"
      />

      {/* Add Provider Modal */}
      {showAddProviderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 m-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add Provider</h2>
            <p className="text-sm text-gray-600 mb-6">
              Create a new provider account for <strong>{school.name}</strong>.
            </p>

            {providerError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm">{providerError}</p>
              </div>
            )}

            <form onSubmit={handleAddProvider} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={providerFormData.firstName}
                    onChange={(e) => setProviderFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={providerFormData.lastName}
                    onChange={(e) => setProviderFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={providerFormData.email}
                  onChange={(e) => setProviderFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="john.smith@school.edu"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={providerFormData.role}
                  onChange={(e) => setProviderFormData(prev => ({ ...prev, role: e.target.value as 'resource' | 'speech' | 'ot' | 'counseling' | 'sea' | 'psychologist' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="resource">Resource Specialist</option>
                  <option value="speech">Speech Therapist</option>
                  <option value="ot">Occupational Therapist</option>
                  <option value="counseling">Counselor</option>
                  <option value="sea">Special Education Assistant</option>
                  <option value="psychologist">School Psychologist</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddProviderModal(false);
                    setProviderError(null);
                    setProviderFormData({ firstName: '', lastName: '', email: '', role: 'resource' });
                  }}
                  disabled={isSavingProvider}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSavingProvider || !providerFormData.firstName.trim() || !providerFormData.lastName.trim() || !providerFormData.email.trim()}
                >
                  {isSavingProvider ? 'Creating...' : 'Create Provider'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Provider Credentials Modal */}
      <CredentialsModal
        isOpen={showProviderCredentials}
        onClose={() => setShowProviderCredentials(false)}
        credentials={providerCredentials}
        accountName={newProviderName}
        accountType="provider"
      />
    </div>
  );
}
