'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getCurrentAdminPermissions,
  getDistrictSchools,
  getDistrictInfo
} from '@/lib/supabase/queries/admin-accounts';
import Link from 'next/link';
import { Card } from '@/app/components/ui/card';

type SchoolWithCounts = {
  id: string;
  name: string;
  city: string | null;
  zip: string | null;
  phone: string | null;
  enrollment: number | null;
  grade_span_low: string | null;
  grade_span_high: string | null;
  teacherCount: number;
  specialistCount: number;
};

export default function SchoolsListPage() {
  const [schools, setSchools] = useState<SchoolWithCounts[]>([]);
  const [districtInfo, setDistrictInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchSchools = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get admin permissions
        const perms = await getCurrentAdminPermissions();

        if (!perms || perms.length === 0) {
          setError('No admin permissions found.');
          return;
        }

        const permission = perms[0];

        // Check if user is a district admin
        if (permission.role !== 'district_admin' || !permission.district_id) {
          setError('This page is only accessible to district administrators.');
          return;
        }

        // Fetch district info and schools
        const [district, schoolsData] = await Promise.all([
          getDistrictInfo(permission.district_id),
          getDistrictSchools(permission.district_id)
        ]);

        setDistrictInfo(district);
        // Ensure teacherCount and specialistCount are numbers
        const schoolsWithNumbers = schoolsData.map(school => ({
          ...school,
          teacherCount: school.teacherCount ?? 0,
          specialistCount: school.specialistCount ?? 0
        }));
        setSchools(schoolsWithNumbers);
      } catch (err) {
        console.error('Error loading schools:', err);
        setError(err instanceof Error ? err.message : 'Failed to load schools');
      } finally {
        setLoading(false);
      }
    };

    fetchSchools();
  }, []);

  // Filter schools based on search query
  const filteredSchools = schools.filter(school =>
    school.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (school.city && school.city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading schools...</p>
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/dashboard/admin" className="hover:text-gray-700">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-gray-900">Schools</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">
          {districtInfo?.name || 'District'} Schools
        </h1>
        <p className="mt-2 text-gray-600">
          {schools.length} school{schools.length !== 1 ? 's' : ''} in your district
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search schools by name or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
      </div>

      {/* Schools Grid */}
      {filteredSchools.length === 0 ? (
        <Card className="p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No schools found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery ? 'Try a different search term.' : 'No schools in this district yet.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSchools.map((school) => (
            <Link
              key={school.id}
              href={`/dashboard/admin/schools/${school.id}`}
              className="block"
            >
              <Card className="p-6 hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer h-full">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {school.name}
                    </h3>
                    {school.city && (
                      <p className="mt-1 text-sm text-gray-500">
                        {school.city}{school.zip ? `, ${school.zip}` : ''}
                      </p>
                    )}
                    {(school.grade_span_low || school.grade_span_high) && (
                      <p className="mt-1 text-xs text-gray-400">
                        Grades {school.grade_span_low || 'K'} - {school.grade_span_high || '12'}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex-shrink-0 p-2 bg-indigo-100 rounded-lg">
                    <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <span className="text-gray-600">{school.teacherCount} teachers</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-gray-600">{school.specialistCount} specialists</span>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {filteredSchools.length > 0 && (
        <Card className="mt-8 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">District Summary</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-indigo-600">{schools.length}</p>
              <p className="text-sm text-gray-500">Schools</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {schools.reduce((sum, s) => sum + s.teacherCount, 0)}
              </p>
              <p className="text-sm text-gray-500">Total Teachers</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">
                {schools.reduce((sum, s) => sum + s.specialistCount, 0)}
              </p>
              <p className="text-sm text-gray-500">Total Specialists</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
