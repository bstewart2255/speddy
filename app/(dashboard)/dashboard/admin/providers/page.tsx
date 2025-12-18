'use client';

import { useState, useEffect } from 'react';
import { getCurrentAdminPermissions, getSchoolStaff } from '@/lib/supabase/queries/admin-accounts';
import Link from 'next/link';
import { Card } from '@/app/components/ui/card';
import { LongHoverTooltip } from '@/app/components/ui/long-hover-tooltip';
import { TeacherCredentialsModal } from '@/app/components/admin/teacher-credentials-modal';

type Provider = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  isPrimarySchool: boolean;
};

// Map role codes to display names
const roleDisplayNames: Record<string, string> = {
  resource: 'Resource Specialist',
  speech: 'Speech Therapist',
  ot: 'Occupational Therapist',
  counseling: 'Counselor',
  specialist: 'Specialist',
  sea: 'Special Education Assistant',
};

function formatRole(role: string | null): string {
  if (!role) return 'Unknown';
  return roleDisplayNames[role] || role;
}

export default function ProviderDirectoryPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{
    email: string;
    temporaryPassword: string;
    userName: string;
  } | null>(null);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get admin permissions to find school_id
      const permissions = await getCurrentAdminPermissions();
      if (!permissions || permissions.length === 0) {
        setError('No admin permissions found');
        return;
      }

      const schoolId = permissions[0]?.school_id;
      if (!schoolId) {
        setError('No school assigned to your account');
        return;
      }

      // Fetch staff data
      const staff = await getSchoolStaff(schoolId);
      setProviders(staff.specialists || []);
    } catch (err) {
      console.error('Error loading providers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const filteredProviders = providers.filter(provider => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    const name = (provider.full_name || '').toLowerCase();
    const email = (provider.email || '').toLowerCase();
    const role = formatRole(provider.role).toLowerCase();
    return name.includes(searchLower) || email.includes(searchLower) || role.includes(searchLower);
  });

  const handleResetPassword = async (providerId: string, providerName: string) => {
    if (!confirm(`Are you sure you want to reset the password for ${providerName}? They will need to use the new password to log in.`)) {
      return;
    }

    try {
      setResettingId(providerId);
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: providerId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      // Show the credentials modal
      setResetCredentials({
        email: data.credentials.email,
        temporaryPassword: data.credentials.temporaryPassword,
        userName: providerName,
      });
    } catch (err) {
      console.error('Error resetting password:', err);
      alert(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setResettingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading providers...</p>
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
              <h3 className="text-sm font-medium text-red-800">Error loading providers</h3>
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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Provider Directory</h1>
            <p className="mt-2 text-gray-600">
              View providers and specialists at your school
            </p>
          </div>
          <LongHoverTooltip content="Create a new provider account. A password will be generated that you can share with them.">
            <Link
              href="/dashboard/admin/create-account"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Provider
            </Link>
          </LongHoverTooltip>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="p-4 mb-6">
        <div className="relative">
          <label htmlFor="provider-search" className="sr-only">
            Search providers by name, email, or role
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="provider-search"
            type="text"
            placeholder="Search by name, email, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </Card>

      {/* Providers Table */}
      {filteredProviders.length === 0 ? (
        <Card className="p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No providers found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm ? 'Try adjusting your search criteria' : 'No providers are currently assigned to your school'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assignment
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProviders.map((provider) => (
                <tr key={provider.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {provider.full_name || (
                        <span className="text-gray-400 italic">No name</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {provider.email || (
                        <span className="text-gray-400 italic">No email</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatRole(provider.role)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {provider.isPrimarySchool ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Primary
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Secondary
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <LongHoverTooltip content="Reset the password of a provider. You can share the new password with them after it's been generated.">
                      <button
                        onClick={() => handleResetPassword(provider.id, provider.full_name || 'this provider')}
                        disabled={resettingId === provider.id}
                        className="text-blue-600 hover:text-blue-900 disabled:text-gray-400"
                      >
                        {resettingId === provider.id ? (
                          <span className="inline-block animate-spin">⏳</span>
                        ) : (
                          'Reset Password'
                        )}
                      </button>
                    </LongHoverTooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="mt-6 flex justify-between items-center text-sm text-gray-600">
        <div>
          Showing {filteredProviders.length} of {providers.length} providers
        </div>
        <Link
          href="/dashboard/admin"
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Back to dashboard
        </Link>
      </div>

      {/* Password Reset Credentials Modal */}
      <TeacherCredentialsModal
        isOpen={!!resetCredentials}
        onClose={() => setResetCredentials(null)}
        credentials={resetCredentials || { email: '', temporaryPassword: '' }}
        userName={resetCredentials?.userName}
        mode="reset"
      />
    </div>
  );
}
