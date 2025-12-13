'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getSchoolDetails, getSchoolAdmins } from '@/lib/supabase/queries/internal-admin';

interface School {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  website: string | null;
  mailing_address: string | null;
  zip: string | null;
  county: string | null;
  grade_span_low: string | null;
  grade_span_high: string | null;
  enrollment: number | null;
  school_type: string | null;
  districts: {
    id: string;
    name: string;
    state_id: string;
    states: {
      name: string;
      full_name: string;
    } | null;
  } | null;
}

interface AdminPermission {
  id: string;
  role: string;
  granted_at: string;
  profiles: {
    id: string;
    email: string;
    full_name: string;
  }[] | null;
}

export default function SchoolDetailPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const [school, setSchool] = useState<School | null>(null);
  const [admins, setAdmins] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [schoolData, adminsData] = await Promise.all([
          getSchoolDetails(schoolId),
          getSchoolAdmins(schoolId),
        ]);
        setSchool(schoolData);
        setAdmins(adminsData || []);
      } catch (err) {
        console.error('Failed to load school details:', err);
        setError('Failed to load school details');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [schoolId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
      </div>
    );
  }

  if (error || !school) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">{error || 'School not found'}</p>
        <Link href="/internal/districts" className="mt-4 text-purple-400 hover:text-purple-300">
          Back to Districts
        </Link>
      </div>
    );
  }

  const district = school.districts;
  const state = district?.states;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-400">
        <Link href="/internal/districts" className="hover:text-purple-400">
          Districts
        </Link>
        <span className="mx-2">/</span>
        {district && (
          <>
            <Link
              href={`/internal/districts/${district.id}`}
              className="hover:text-purple-400"
            >
              {district.name}
            </Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-white">{school.name}</span>
      </nav>

      {/* School header */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{school.name}</h1>
            <p className="mt-1 text-slate-400">
              {school.city}
              {district && `, ${district.name}`}
              {state && `, ${state.name}`}
            </p>
          </div>
          <Link
            href={`/internal/create-admin?type=site_admin&school=${school.id}&district=${district?.id}&state=${district?.state_id}`}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
          >
            Create Site Admin
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {school.grade_span_low && school.grade_span_high && (
            <div>
              <dt className="text-sm text-slate-400">Grades</dt>
              <dd className="mt-1 text-white">
                {school.grade_span_low} - {school.grade_span_high}
              </dd>
            </div>
          )}
          {school.enrollment && (
            <div>
              <dt className="text-sm text-slate-400">Enrollment</dt>
              <dd className="mt-1 text-white">{school.enrollment.toLocaleString()} students</dd>
            </div>
          )}
          {school.school_type && (
            <div>
              <dt className="text-sm text-slate-400">School Type</dt>
              <dd className="mt-1 text-white">{school.school_type}</dd>
            </div>
          )}
          {school.phone && (
            <div>
              <dt className="text-sm text-slate-400">Phone</dt>
              <dd className="mt-1 text-white">{school.phone}</dd>
            </div>
          )}
          {school.mailing_address && (
            <div>
              <dt className="text-sm text-slate-400">Address</dt>
              <dd className="mt-1 text-white">
                {school.mailing_address}
                {school.zip && `, ${school.zip}`}
              </dd>
            </div>
          )}
          {school.website && (
            <div>
              <dt className="text-sm text-slate-400">Website</dt>
              <dd className="mt-1">
                <a
                  href={school.website.startsWith('http') ? school.website : `https://${school.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300"
                >
                  {school.website}
                </a>
              </dd>
            </div>
          )}
          {school.county && (
            <div>
              <dt className="text-sm text-slate-400">County</dt>
              <dd className="mt-1 text-white">{school.county}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-slate-400">NCES ID</dt>
            <dd className="mt-1 text-white font-mono text-sm">{school.id}</dd>
          </div>
        </div>
      </div>

      {/* Existing admins */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Site Admins</h2>

        {admins.length === 0 ? (
          <p className="text-slate-400">No site admins yet for this school.</p>
        ) : (
          <ul className="space-y-2">
            {admins.map((admin) => {
              const profile = admin.profiles?.[0];
              return (
                <li key={admin.id} className="flex items-center text-slate-300">
                  <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                  {profile?.full_name || 'Unknown'} ({profile?.email})
                  <span className="ml-2 text-sm text-slate-500">
                    Added {new Date(admin.granted_at).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Back to district link */}
      {district && (
        <div>
          <Link
            href={`/internal/districts/${district.id}`}
            className="text-purple-400 hover:text-purple-300"
          >
            &larr; Back to {district.name}
          </Link>
        </div>
      )}
    </div>
  );
}
