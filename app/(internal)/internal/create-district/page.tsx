'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAllStates } from '@/lib/supabase/queries/internal-admin';

interface State {
  id: string;
  name: string;
  full_name: string;
}

export default function CreateDistrictPage() {
  const router = useRouter();
  const [states, setStates] = useState<State[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [stateId, setStateId] = useState('');
  const [city, setCity] = useState('');
  const [county, setCounty] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [mailingAddress, setMailingAddress] = useState('');
  const [zip, setZip] = useState('');

  useEffect(() => {
    const loadStates = async () => {
      try {
        const statesData = await getAllStates();
        setStates(statesData || []);
      } catch (err) {
        console.error('Failed to load states:', err);
      }
    };
    loadStates();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/internal/create-district', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          stateId,
          city: city || null,
          county: county || null,
          phone: phone || null,
          website: website || null,
          mailingAddress: mailingAddress || null,
          zip: zip || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create district');
      }

      // Redirect to the new district's detail page
      router.push(`/internal/districts/${data.districtId}`);
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
        <span className="mx-2">/</span>
        <span className="text-white">Create District</span>
      </nav>

      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h1 className="text-xl font-bold text-white mb-6">Create New District</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-600/50 rounded-md">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* District Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
              District Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., Springfield Public Schools"
            />
          </div>

          {/* State */}
          <div>
            <label htmlFor="state" className="block text-sm font-medium text-slate-300 mb-2">
              State <span className="text-red-400">*</span>
            </label>
            <select
              id="state"
              value={stateId}
              onChange={(e) => setStateId(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Select a state...</option>
              {states.map((state) => (
                <option key={state.id} value={state.id}>
                  {state.full_name} ({state.name})
                </option>
              ))}
            </select>
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
              placeholder="e.g., Springfield"
            />
          </div>

          {/* County */}
          <div>
            <label htmlFor="county" className="block text-sm font-medium text-slate-300 mb-2">
              County
            </label>
            <input
              type="text"
              id="county"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., Sangamon County"
            />
          </div>

          {/* Two column layout for contact info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Phone */}
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

            {/* Website */}
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
                placeholder="e.g., www.springfield.k12.il.us"
              />
            </div>
          </div>

          {/* Mailing Address */}
          <div>
            <label htmlFor="mailingAddress" className="block text-sm font-medium text-slate-300 mb-2">
              Mailing Address
            </label>
            <input
              type="text"
              id="mailingAddress"
              value={mailingAddress}
              onChange={(e) => setMailingAddress(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., 1900 W Monroe St"
            />
          </div>

          {/* ZIP */}
          <div className="w-1/3">
            <label htmlFor="zip" className="block text-sm font-medium text-slate-300 mb-2">
              ZIP Code
            </label>
            <input
              type="text"
              id="zip"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="e.g., 62704"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-700">
            <Link
              href="/internal/districts"
              className="text-slate-400 hover:text-slate-300 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !name || !stateId}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
            >
              {loading ? 'Creating...' : 'Create District'}
            </button>
          </div>
        </form>
      </div>

      {/* Info box */}
      <div className="mt-6 p-4 bg-slate-800/50 border border-slate-700 rounded-md">
        <p className="text-sm text-slate-400">
          After creating the district, you&apos;ll be redirected to its detail page where you can create a district admin account.
        </p>
      </div>
    </div>
  );
}
