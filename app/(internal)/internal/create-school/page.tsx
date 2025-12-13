'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Sanitize ID to prevent XSS - only allow alphanumeric, hyphens (UUID format)
function sanitizeId(id: string | null): string {
  if (!id) return '';
  // Only allow alphanumeric characters and hyphens (valid for UUIDs and NCES IDs)
  return id.replace(/[^a-zA-Z0-9-]/g, '');
}

interface District {
  id: string;
  name: string;
  state_id: string;
}

export default function CreateSchoolPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();

  const preselectedDistrictId = sanitizeId(searchParams.get('district'));

  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [districtId, setDistrictId] = useState(preselectedDistrictId || '');
  const [city, setCity] = useState('');
  const [schoolType, setSchoolType] = useState('');
  const [gradeSpanLow, setGradeSpanLow] = useState('');
  const [gradeSpanHigh, setGradeSpanHigh] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [mailingAddress, setMailingAddress] = useState('');
  const [zip, setZip] = useState('');

  useEffect(() => {
    const loadDistricts = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('districts')
          .select('id, name, state_id')
          .order('name');

        if (fetchError) throw fetchError;
        setDistricts(data || []);
      } catch (err) {
        console.error('Failed to load districts:', err);
      } finally {
        setLoadingDistricts(false);
      }
    };
    loadDistricts();
  }, [supabase]);

  const selectedDistrict = districts.find((d) => d.id === districtId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/internal/create-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          districtId,
          city: city || null,
          schoolType: schoolType || null,
          gradeSpanLow: gradeSpanLow || null,
          gradeSpanHigh: gradeSpanHigh || null,
          phone: phone || null,
          website: website || null,
          mailingAddress: mailingAddress || null,
          zip: zip || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create school');
      }

      // Redirect to the new school's detail page
      router.push(`/internal/schools/${data.schoolId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-400 mb-6">
        <Link href="/internal/districts" className="hover:text-purple-400">
          Districts
        </Link>
        {selectedDistrict && (
          <>
            <span className="mx-2">/</span>
            <Link
              href={`/internal/districts/${sanitizeId(selectedDistrict.id)}`}
              className="hover:text-purple-400"
            >
              {selectedDistrict.name}
            </Link>
          </>
        )}
        <span className="mx-2">/</span>
        <span className="text-white">Create School</span>
      </nav>

      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h1 className="text-xl font-bold text-white mb-6">Create New School</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-600/50 rounded-md">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* District */}
          <div>
            <label htmlFor="district" className="block text-sm font-medium text-slate-300 mb-2">
              District <span className="text-red-400">*</span>
            </label>
            {loadingDistricts ? (
              <div className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-400">
                Loading districts...
              </div>
            ) : (
              <select
                id="district"
                value={districtId}
                onChange={(e) => setDistrictId(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Select a district...</option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name} ({district.state_id})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* School Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
              School Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., Lincoln Elementary School"
            />
          </div>

          {/* City */}
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-slate-300 mb-2">
              City
            </label>
            <input
              type="text"
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., Concord"
            />
          </div>

          {/* School Type and Grade Span */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="schoolType" className="block text-sm font-medium text-slate-300 mb-2">
                School Type
              </label>
              <select
                id="schoolType"
                value={schoolType}
                onChange={(e) => setSchoolType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="Elementary">Elementary</option>
                <option value="Middle">Middle</option>
                <option value="High">High</option>
                <option value="K-8">K-8</option>
                <option value="K-12">K-12</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="gradeSpanLow"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Grade Low
              </label>
              <select
                id="gradeSpanLow"
                value={gradeSpanLow}
                onChange={(e) => setGradeSpanLow(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="PK">PK</option>
                <option value="KG">KG</option>
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={String(i + 1).padStart(2, '0')}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="gradeSpanHigh"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Grade High
              </label>
              <select
                id="gradeSpanHigh"
                value={gradeSpanHigh}
                onChange={(e) => setGradeSpanHigh(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="PK">PK</option>
                <option value="KG">KG</option>
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={String(i + 1).padStart(2, '0')}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-2">
                Phone
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="e.g., (555) 123-4567"
              />
            </div>

            <div>
              <label htmlFor="website" className="block text-sm font-medium text-slate-300 mb-2">
                Website
              </label>
              <input
                type="text"
                id="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="e.g., www.lincolnelementary.edu"
              />
            </div>
          </div>

          {/* Address */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label
                htmlFor="mailingAddress"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Address
              </label>
              <input
                type="text"
                id="mailingAddress"
                value={mailingAddress}
                onChange={(e) => setMailingAddress(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="e.g., 123 Main St"
              />
            </div>

            <div>
              <label htmlFor="zip" className="block text-sm font-medium text-slate-300 mb-2">
                ZIP Code
              </label>
              <input
                type="text"
                id="zip"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="e.g., 94520"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-700">
            <Link
              href={districtId ? `/internal/districts/${sanitizeId(districtId)}` : '/internal/districts'}
              className="text-slate-400 hover:text-slate-300 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !name || !districtId}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
            >
              {loading ? 'Creating...' : 'Create School'}
            </button>
          </div>
        </form>
      </div>

      {/* Info box */}
      <div className="mt-6 p-4 bg-slate-800/50 border border-slate-700 rounded-md">
        <p className="text-sm text-slate-400">
          After creating the school, you&apos;ll be redirected to its detail page where you can
          create a site admin account.
        </p>
      </div>
    </div>
  );
}
