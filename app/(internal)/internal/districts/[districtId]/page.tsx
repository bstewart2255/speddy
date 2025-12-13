'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getDistrictDetails,
  getSchoolsByDistrict,
  getDistrictAdmins,
} from '@/lib/supabase/queries/internal-admin';

interface District {
  id: string;
  name: string;
  city: string | null;
  state_id: string;
  phone: string | null;
  website: string | null;
  mailing_address: string | null;
  zip: string | null;
  county: string | null;
  states: {
    name: string;
    full_name: string;
  } | null;
}

interface School {
  id: string;
  name: string;
  city: string | null;
  grade_span_low: string | null;
  grade_span_high: string | null;
  enrollment: number | null;
}

interface AdminPermission {
  id: string;
  role: string;
  school_id: string | null;
  granted_at: string;
  profiles: {
    id: string;
    email: string;
    full_name: string;
  }[] | null;
}

export default function DistrictDetailPage() {
  const params = useParams();
  const districtId = params.districtId as string;

  const [district, setDistrict] = useState<District | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [admins, setAdmins] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [districtData, schoolsData, adminsData] = await Promise.all([
          getDistrictDetails(districtId),
          getSchoolsByDistrict(districtId),
          getDistrictAdmins(districtId),
        ]);
        setDistrict(districtData);
        setSchools(schoolsData || []);
        setAdmins(adminsData || []);
      } catch (err) {
        console.error('Failed to load district details:', err);
        setError('Failed to load district details');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [districtId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
      </div>
    );
  }

  if (error || !district) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">{error || 'District not found'}</p>
        <Link href="/internal/districts" className="mt-4 text-purple-400 hover:text-purple-300">
          Back to Districts
        </Link>
      </div>
    );
  }

  const districtAdmins = admins.filter((a) => a.role === 'district_admin');
  const siteAdmins = admins.filter((a) => a.role === 'site_admin');

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-400">
        <Link href="/internal/districts" className="hover:text-purple-400">
          Districts
        </Link>
        <span className="mx-2">/</span>
        <span className="text-white">{district.name}</span>
      </nav>

      {/* District header */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{district.name}</h1>
            <p className="mt-1 text-slate-400">
              {district.city}, {district.states?.name || district.state_id}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/internal/create-school?district=${district.id}`}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-md transition-colors"
            >
              Add School
            </Link>
            <Link
              href={`/internal/create-admin?type=district_admin&district=${district.id}&state=${district.state_id}`}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
            >
              Create District Admin
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {district.phone && (
            <div>
              <dt className="text-sm text-slate-400">Phone</dt>
              <dd className="mt-1 text-white">{district.phone}</dd>
            </div>
          )}
          {district.mailing_address && (
            <div>
              <dt className="text-sm text-slate-400">Address</dt>
              <dd className="mt-1 text-white">
                {district.mailing_address}
                {district.zip && `, ${district.zip}`}
              </dd>
            </div>
          )}
          {district.website && (
            <div>
              <dt className="text-sm text-slate-400">Website</dt>
              <dd className="mt-1">
                <a
                  href={district.website.startsWith('http') ? district.website : `https://${district.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300"
                >
                  {district.website}
                </a>
              </dd>
            </div>
          )}
          {district.county && (
            <div>
              <dt className="text-sm text-slate-400">County</dt>
              <dd className="mt-1 text-white">{district.county}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-slate-400">NCES ID</dt>
            <dd className="mt-1 text-white font-mono text-sm">{district.id}</dd>
          </div>
        </div>
      </div>

      {/* Existing admins */}
      {admins.length > 0 && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Existing Admins</h2>

          {districtAdmins.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-slate-400 mb-2">District Admins</h3>
              <ul className="space-y-2">
                {districtAdmins.map((admin) => {
                  const profile = admin.profiles?.[0];
                  return (
                    <li key={admin.id} className="flex items-center text-slate-300">
                      <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                      {profile?.full_name || 'Unknown'} ({profile?.email})
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {siteAdmins.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">Site Admins</h3>
              <ul className="space-y-2">
                {siteAdmins.map((admin) => {
                  const profile = admin.profiles?.[0];
                  return (
                    <li key={admin.id} className="flex items-center text-slate-300">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                      {profile?.full_name || 'Unknown'} ({profile?.email})
                      {admin.school_id && (
                        <span className="ml-2 text-sm text-slate-500">
                          - School: {admin.school_id}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Schools list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Schools ({schools.length})
          </h2>
        </div>

        {schools.length === 0 ? (
          <div className="text-center py-8 text-slate-400 bg-slate-800 rounded-lg border border-slate-700">
            No schools found in this district
          </div>
        ) : (
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    School Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    City
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Grades
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Enrollment
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {schools.map((school) => (
                  <tr key={school.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/internal/schools/${school.id}`}
                        className="text-purple-400 hover:text-purple-300 font-medium"
                      >
                        {school.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {school.city || '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {school.grade_span_low && school.grade_span_high
                        ? `${school.grade_span_low} - ${school.grade_span_high}`
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {school.enrollment?.toLocaleString() || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/internal/create-admin?type=site_admin&school=${school.id}&district=${district.id}&state=${district.state_id}`}
                        className="text-sm text-purple-400 hover:text-purple-300"
                      >
                        Create Site Admin
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
