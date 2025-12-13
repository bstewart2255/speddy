'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  getAllStates,
  getDistrictsByState,
  getSchoolsByDistrict,
} from '@/lib/supabase/queries/internal-admin';
import { AdminCredentialsModal } from '@/app/components/internal/admin-credentials-modal';

interface State {
  id: string;
  name: string;
  full_name: string;
}

interface District {
  id: string;
  name: string;
  city: string | null;
  state_id: string;
}

interface School {
  id: string;
  name: string;
  city: string | null;
}

interface CreatedAdmin {
  email: string;
  fullName: string;
  temporaryPassword: string;
  adminType: 'district_admin' | 'site_admin';
}

export default function CreateAdminPage() {
  const searchParams = useSearchParams();

  // Form state
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [adminType, setAdminType] = useState<'district_admin' | 'site_admin'>('district_admin');
  const [selectedState, setSelectedState] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedSchool, setSelectedSchool] = useState('');

  // Data state
  const [states, setStates] = useState<State[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [schools, setSchools] = useState<School[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAdmin, setCreatedAdmin] = useState<CreatedAdmin | null>(null);

  // Initialize from URL params
  useEffect(() => {
    const type = searchParams.get('type');
    const state = searchParams.get('state');
    const district = searchParams.get('district');
    const school = searchParams.get('school');

    if (type === 'site_admin' || type === 'district_admin') {
      setAdminType(type);
    }
    if (state) setSelectedState(state);
    if (district) setSelectedDistrict(district);
    if (school) setSelectedSchool(school);
  }, [searchParams]);

  // Load states
  useEffect(() => {
    const loadStates = async () => {
      try {
        const data = await getAllStates();
        setStates(data || []);
      } catch (err) {
        console.error('Failed to load states:', err);
      } finally {
        setLoading(false);
      }
    };
    loadStates();
  }, []);

  // Load districts when state changes
  const loadDistricts = useCallback(async () => {
    if (!selectedState) {
      setDistricts([]);
      return;
    }
    setLoadingDistricts(true);
    try {
      const { districts: data } = await getDistrictsByState(selectedState, '', 0, 1000);
      setDistricts(data || []);
    } catch (err) {
      console.error('Failed to load districts:', err);
    } finally {
      setLoadingDistricts(false);
    }
  }, [selectedState]);

  useEffect(() => {
    loadDistricts();
  }, [loadDistricts]);

  // Load schools when district changes
  const loadSchools = useCallback(async () => {
    if (!selectedDistrict) {
      setSchools([]);
      return;
    }
    setLoadingSchools(true);
    try {
      const data = await getSchoolsByDistrict(selectedDistrict);
      setSchools(data || []);
    } catch (err) {
      console.error('Failed to load schools:', err);
    } finally {
      setLoadingSchools(false);
    }
  }, [selectedDistrict]);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  // Reset dependent selections when parent changes
  useEffect(() => {
    if (!selectedState) {
      setSelectedDistrict('');
      setSelectedSchool('');
    }
  }, [selectedState]);

  useEffect(() => {
    if (!selectedDistrict) {
      setSelectedSchool('');
    }
  }, [selectedDistrict]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Validation
      if (!email.trim()) {
        throw new Error('Email is required');
      }
      if (!fullName.trim()) {
        throw new Error('Full name is required');
      }
      if (!selectedState) {
        throw new Error('State is required');
      }
      if (!selectedDistrict) {
        throw new Error('District is required');
      }
      if (adminType === 'site_admin' && !selectedSchool) {
        throw new Error('School is required for site admin');
      }

      const response = await fetch('/api/internal/create-admin-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          fullName: fullName.trim(),
          adminType,
          stateId: selectedState,
          districtId: selectedDistrict,
          schoolId: adminType === 'site_admin' ? selectedSchool : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create admin account');
      }

      // Show credentials modal
      setCreatedAdmin({
        email: data.email,
        fullName: data.fullName,
        temporaryPassword: data.temporaryPassword,
        adminType: data.adminType,
      });

      // Reset form
      setEmail('');
      setFullName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDistrictName = districts.find((d) => d.id === selectedDistrict)?.name;
  const selectedSchoolName = schools.find((s) => s.id === selectedSchool)?.name;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Create Admin Account</h1>
        <p className="mt-1 text-slate-400">
          Create a new district or site admin for a school district customer
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-6">
        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
            Email Address *
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@school.edu"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            required
          />
        </div>

        {/* Full Name */}
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-slate-300 mb-1">
            Full Name *
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            required
          />
        </div>

        {/* Admin Type */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Admin Type *
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="adminType"
                value="district_admin"
                checked={adminType === 'district_admin'}
                onChange={() => setAdminType('district_admin')}
                className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 focus:ring-purple-500"
              />
              <span className="ml-2 text-slate-300">District Admin</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="adminType"
                value="site_admin"
                checked={adminType === 'site_admin'}
                onChange={() => setAdminType('site_admin')}
                className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 focus:ring-purple-500"
              />
              <span className="ml-2 text-slate-300">Site Admin</span>
            </label>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {adminType === 'district_admin'
              ? 'Can manage all schools in the district'
              : 'Can manage a single school'}
          </p>
        </div>

        {/* State */}
        <div>
          <label htmlFor="state" className="block text-sm font-medium text-slate-300 mb-1">
            State *
          </label>
          <select
            id="state"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            required
          >
            <option value="">Select a state...</option>
            {states.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name} - {state.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* District */}
        <div>
          <label htmlFor="district" className="block text-sm font-medium text-slate-300 mb-1">
            District *
          </label>
          <select
            id="district"
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            disabled={!selectedState || loadingDistricts}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            required
          >
            <option value="">
              {loadingDistricts ? 'Loading districts...' : 'Select a district...'}
            </option>
            {districts.map((district) => (
              <option key={district.id} value={district.id}>
                {district.name} {district.city && `(${district.city})`}
              </option>
            ))}
          </select>
        </div>

        {/* School (only for site_admin) */}
        {adminType === 'site_admin' && (
          <div>
            <label htmlFor="school" className="block text-sm font-medium text-slate-300 mb-1">
              School *
            </label>
            <select
              id="school"
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
              disabled={!selectedDistrict || loadingSchools}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              required
            >
              <option value="">
                {loadingSchools ? 'Loading schools...' : 'Select a school...'}
              </option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name} {school.city && `(${school.city})`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Summary */}
        {selectedDistrict && (
          <div className="bg-slate-700/50 rounded-md p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Summary</h3>
            <p className="text-slate-400 text-sm">
              Creating a <span className="text-white font-medium">{adminType.replace('_', ' ')}</span>
              {' '}for{' '}
              {adminType === 'site_admin' && selectedSchoolName ? (
                <>
                  <span className="text-white font-medium">{selectedSchoolName}</span>
                  {' '}in{' '}
                </>
              ) : null}
              <span className="text-white font-medium">{selectedDistrictName}</span>
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-md p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-between pt-4">
          <Link href="/internal/districts" className="text-slate-400 hover:text-slate-300">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-md transition-colors disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating...' : 'Create Admin Account'}
          </button>
        </div>
      </form>

      {/* Credentials Modal */}
      {createdAdmin && (
        <AdminCredentialsModal
          admin={createdAdmin}
          onClose={() => setCreatedAdmin(null)}
        />
      )}
    </div>
  );
}
