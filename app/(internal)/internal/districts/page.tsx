'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getAllStates, getDistrictsByState } from '@/lib/supabase/queries/internal-admin';

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
  phone: string | null;
  website: string | null;
}

const PAGE_SIZE = 20;

export default function DistrictsPage() {
  const [states, setStates] = useState<State[]>([]);
  const [selectedState, setSelectedState] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [districts, setDistricts] = useState<District[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  // Load states on mount
  useEffect(() => {
    const loadStates = async () => {
      try {
        const data = await getAllStates();
        setStates(data || []);
      } catch (error) {
        console.error('Failed to load states:', error);
      } finally {
        setLoading(false);
      }
    };
    loadStates();
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(0); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load districts when state or search changes
  const loadDistricts = useCallback(async () => {
    if (!selectedState) {
      setDistricts([]);
      setTotalCount(0);
      return;
    }

    setLoadingDistricts(true);
    try {
      const { districts: data, totalCount: count } = await getDistrictsByState(
        selectedState,
        debouncedSearch,
        currentPage,
        PAGE_SIZE
      );
      setDistricts(data || []);
      setTotalCount(count);
    } catch (error) {
      console.error('Failed to load districts:', error);
    } finally {
      setLoadingDistricts(false);
    }
  }, [selectedState, debouncedSearch, currentPage]);

  useEffect(() => {
    loadDistricts();
  }, [loadDistricts]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Browse Districts</h1>
          <p className="mt-1 text-slate-400">
            Select a state and search for school districts
          </p>
        </div>
        <Link
          href="/internal/create-district"
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
        >
          Create District
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* State selector */}
        <div className="w-full sm:w-64">
          <label htmlFor="state" className="block text-sm font-medium text-slate-300 mb-1">
            State
          </label>
          <select
            id="state"
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setCurrentPage(0);
            }}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">Select a state...</option>
            {states.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name} - {state.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Search input */}
        <div className="flex-1">
          <label htmlFor="search" className="block text-sm font-medium text-slate-300 mb-1">
            Search Districts
          </label>
          <input
            id="search"
            type="text"
            placeholder="Search by district name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={!selectedState}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Results */}
      {!selectedState ? (
        <div className="text-center py-12 text-slate-400">
          Select a state to view districts
        </div>
      ) : loadingDistricts ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
        </div>
      ) : districts.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          {debouncedSearch
            ? `No districts found matching "${debouncedSearch}"`
            : 'No districts found in this state'}
        </div>
      ) : (
        <>
          {/* Results count */}
          <div className="text-sm text-slate-400">
            Showing {currentPage * PAGE_SIZE + 1}-
            {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} of {totalCount} districts
          </div>

          {/* Districts table */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    District Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    City
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {districts.map((district) => (
                  <tr key={district.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/internal/districts/${district.id}`}
                        className="text-purple-400 hover:text-purple-300 font-medium"
                      >
                        {district.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {district.city || '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {district.phone || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/internal/create-admin?type=district_admin&district=${district.id}&state=${district.state_id}`}
                        className="text-sm text-purple-400 hover:text-purple-300"
                      >
                        Create Admin
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
              >
                Previous
              </button>
              <span className="text-slate-400">
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
