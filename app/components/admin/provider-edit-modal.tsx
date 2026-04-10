'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';

const PROVIDER_ROLES = [
  { value: 'resource', label: 'Resource Specialist' },
  { value: 'speech', label: 'Speech Therapist' },
  { value: 'ot', label: 'Occupational Therapist' },
  { value: 'counseling', label: 'Counselor' },
  { value: 'sea', label: 'Special Education Assistant' },
  { value: 'psychologist', label: 'School Psychologist' },
  { value: 'intervention', label: 'Intervention Teacher' },
];

interface Provider {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
}

interface ProviderEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  provider: Provider | null;
}

export function ProviderEditModal({
  isOpen,
  onClose,
  onSuccess,
  provider,
}: ProviderEditModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (provider) {
      setFullName(provider.full_name || '');
      setEmail(provider.email || '');
      setRole(provider.role || '');
      setError(null);
    }
  }, [provider]);

  if (!isOpen || !provider) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!role) {
      setError('Role is required');
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/admin/district/providers/${provider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update provider');
      }

      onSuccess();
    } catch (err) {
      console.error('Error updating provider:', err);
      setError(err instanceof Error ? err.message : 'Failed to update provider');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 m-4 max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Edit Provider</h2>
          <p className="text-sm text-gray-500 mt-1">
            Update provider information
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="" disabled>Select a role</option>
              {PROVIDER_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
