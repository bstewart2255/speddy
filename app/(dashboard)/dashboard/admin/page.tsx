'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getCurrentAdminPermissions,
  getSchoolStaff,
  getDistrictInfo,
  getDistrictStaffCounts
} from '@/lib/supabase/queries/admin-accounts';
import Link from 'next/link';
import { Card } from '@/app/components/ui/card';

export default function AdminDashboardPage() {
  const [permissions, setPermissions] = useState<any>(null);
  const [staffCounts, setStaffCounts] = useState({ teachers: 0, specialists: 0, schools: 0 });
  const [districtInfo, setDistrictInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const supabase = createClient();

  const isDistrictAdmin = permissions?.role === 'district_admin';

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current user profile
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        setProfile(profileData);

        // Fetch admin permissions
        const perms = await getCurrentAdminPermissions();
        console.log('Admin permissions:', perms); // Debug log

        if (!perms || perms.length === 0) {
          setError('No admin permissions found. Please contact your administrator.');
          return;
        }

        setPermissions(perms[0]); // Assuming single permission for now

        // Different data fetching based on admin type
        if (perms[0]?.role === 'district_admin' && perms[0]?.district_id) {
          // District admin - fetch district-level data
          const [district, counts] = await Promise.all([
            getDistrictInfo(perms[0].district_id),
            getDistrictStaffCounts(perms[0].district_id)
          ]);
          setDistrictInfo(district);
          setStaffCounts({
            teachers: counts.teachers ?? 0,
            specialists: counts.specialists ?? 0,
            schools: counts.schools ?? 0
          });
        } else if (perms[0]?.school_id) {
          // Site admin - fetch school-level data
          const staff = await getSchoolStaff(perms[0].school_id);
          setStaffCounts({
            teachers: staff.teachers.length,
            specialists: staff.specialists.length,
            schools: 1
          });
        }
      } catch (err) {
        console.error('Error loading dashboard:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [supabase]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading dashboard...</p>
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
              <h3 className="text-sm font-medium text-red-800">Error loading dashboard</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!permissions) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">No admin permissions</h3>
              <p className="mt-1 text-sm text-yellow-700">
                Your account does not have any admin permissions assigned. Please contact your system administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const adminName = profile?.full_name || 'Admin';
  const roleDisplay = permissions.role === 'site_admin' ? 'Site Admin' : 'District Admin';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome, {adminName}</h1>
        <p className="mt-2 text-gray-600">
          {roleDisplay} Dashboard{isDistrictAdmin && districtInfo ? ` - ${districtInfo.name}` : ' - Manage staff accounts and school settings'}
        </p>
      </div>

      {/* Stats Overview */}
      <div className={`grid grid-cols-1 ${isDistrictAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6 mb-8`}>
        {/* Schools card - only for district admin */}
        {isDistrictAdmin && (
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Schools</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{staffCounts.schools}</p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-full">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
            <Link
              href="/dashboard/admin/schools"
              className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center"
            >
              View all schools
              <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </Card>
        )}

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Teachers</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{staffCounts.teachers}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          {!isDistrictAdmin && (
            <Link
              href="/dashboard/admin/teachers"
              className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 inline-flex items-center"
            >
              View teacher directory
              <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
          {isDistrictAdmin && (
            <p className="mt-4 text-sm text-gray-500">
              Across all schools
            </p>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Providers</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{staffCounts.specialists}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            Resource specialists and service providers
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Staff</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {staffCounts.teachers + staffCounts.specialists}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          {!isDistrictAdmin && (
            <Link
              href="/dashboard/admin/duplicates"
              className="mt-4 text-sm font-medium text-purple-600 hover:text-purple-700 inline-flex items-center"
            >
              Check for duplicates
              <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
          {isDistrictAdmin && (
            <p className="mt-4 text-sm text-gray-500">
              District-wide total
            </p>
          )}
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className={`grid grid-cols-1 ${isDistrictAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
          {isDistrictAdmin && (
            <Link
              href="/dashboard/admin/schools"
              className="flex items-center p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-500 hover:shadow-md transition-all"
            >
              <div className="flex-shrink-0 p-3 bg-indigo-100 rounded-lg">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">View Schools</h3>
                <p className="text-sm text-gray-600">Browse all schools in your district</p>
              </div>
            </Link>
          )}

          {!isDistrictAdmin && (
            <Link
              href="/dashboard/admin/create-account"
              className="flex items-center p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
            >
              <div className="flex-shrink-0 p-3 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">Create New Account</h3>
                <p className="text-sm text-gray-600">Add a teacher or provider account</p>
              </div>
            </Link>
          )}

          {!isDistrictAdmin && (
            <Link
              href="/dashboard/admin/teachers"
              className="flex items-center p-4 bg-white border border-gray-200 rounded-lg hover:border-green-500 hover:shadow-md transition-all"
            >
              <div className="flex-shrink-0 p-3 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">Teacher Directory</h3>
                <p className="text-sm text-gray-600">View and manage teacher accounts</p>
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Info Card */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {isDistrictAdmin ? 'District Information' : 'School Information'}
        </h2>
        <div className="space-y-3">
          {isDistrictAdmin && districtInfo && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">District Name:</span>
                <span className="text-sm text-gray-900">{districtInfo.name}</span>
              </div>
              {districtInfo.city && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">City:</span>
                  <span className="text-sm text-gray-900">{districtInfo.city}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">District ID:</span>
                <span className="text-sm text-gray-900">{permissions.district_id}</span>
              </div>
            </>
          )}
          {!isDistrictAdmin && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">School ID:</span>
              <span className="text-sm text-gray-900">{permissions.school_id}</span>
            </div>
          )}
          {permissions.state_id && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">State:</span>
              <span className="text-sm text-gray-900">{permissions.state_id.toUpperCase()}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Admin Role:</span>
            <span className="text-sm text-gray-900 capitalize">{roleDisplay}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
