'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getCurrentAdminPermissions } from '@/lib/supabase/queries/admin-accounts';
import { getDistrictCareReferrals, type DistrictCareReferral } from '@/lib/supabase/queries/care-referrals';
import { createClient } from '@/lib/supabase/client';
import { DistrictCareTable } from '@/app/components/admin/district-care-table';
import { CARE_STATUSES, type CareStatus } from '@/lib/constants/care';

interface School {
  id: string;
  name: string;
}

export default function DistrictCarePage() {
  const supabase = useMemo(() => createClient(), []);

  const [referrals, setReferrals] = useState<DistrictCareReferral[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<CareStatus | ''>('');

  // Check permissions and load data
  useEffect(() => {
    const checkPermissionsAndLoad = async () => {
      try {
        setLoading(true);
        setError(null);

        // Check admin permissions
        const permissions = await getCurrentAdminPermissions();
        const districtAdminPerm = permissions.find(p => p.role === 'district_admin');

        if (!districtAdminPerm || !districtAdminPerm.district_id) {
          setError('Access denied. This page is only available to district administrators.');
          return;
        }

        setDistrictId(districtAdminPerm.district_id);

        // Fetch schools in the district for filter dropdown
        const { data: schoolsData, error: schoolsError } = await supabase
          .from('schools')
          .select('id, name')
          .eq('district_id', districtAdminPerm.district_id)
          .order('name', { ascending: true });

        if (schoolsError) {
          console.error('Error fetching schools:', schoolsError);
        } else {
          setSchools(schoolsData || []);
        }

        // Fetch referrals
        const referralsData = await getDistrictCareReferrals(districtAdminPerm.district_id);
        setReferrals(referralsData);
      } catch (err) {
        console.error('Error loading CARE data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load CARE data');
      } finally {
        setLoading(false);
      }
    };

    checkPermissionsAndLoad();
  }, [supabase]);

  // Re-fetch when filters change
  useEffect(() => {
    const fetchFilteredReferrals = async () => {
      if (!districtId) return;

      try {
        const filters: { schoolId?: string; status?: CareStatus } = {};
        if (selectedSchool) filters.schoolId = selectedSchool;
        if (selectedStatus) filters.status = selectedStatus;

        const referralsData = await getDistrictCareReferrals(districtId, filters);
        setReferrals(referralsData);
      } catch (err) {
        console.error('Error fetching filtered referrals:', err);
      }
    };

    if (districtId) {
      fetchFilteredReferrals();
    }
  }, [districtId, selectedSchool, selectedStatus]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading CARE referrals...</p>
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
              <h3 className="text-sm font-medium text-red-800">Access Denied</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
              <Link
                href="/dashboard/admin"
                className="mt-2 inline-block text-sm font-medium text-red-600 hover:text-red-500"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/dashboard/admin" className="hover:text-gray-700">
            Admin Dashboard
          </Link>
          <span>/</span>
          <span className="text-gray-900">CARE Referrals</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">CARE Referrals</h1>
        <p className="mt-1 text-sm text-gray-600">
          View all CARE referrals across your district
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          {/* School Filter */}
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="school-filter" className="block text-sm font-medium text-gray-700 mb-1">
              School
            </label>
            <select
              id="school-filter"
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stage Filter */}
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Stage
            </label>
            <select
              id="status-filter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as CareStatus | '')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Stages</option>
              {CARE_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {(selectedSchool || selectedStatus) && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSelectedSchool('');
                  setSelectedStatus('');
                }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {referrals.length} referral{referrals.length !== 1 ? 's' : ''}
        {selectedSchool && schools.find(s => s.id === selectedSchool) && (
          <span> at {schools.find(s => s.id === selectedSchool)?.name}</span>
        )}
        {selectedStatus && (
          <span> with stage "{CARE_STATUSES.find(s => s.value === selectedStatus)?.label}"</span>
        )}
      </div>

      {/* Table */}
      <DistrictCareTable referrals={referrals} />
    </div>
  );
}
