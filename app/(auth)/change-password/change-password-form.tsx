'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '../../components/auth/password-input';
import { validatePassword, getPasswordStrength } from '@/lib/utils/password-validation';

export default function ChangePasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    const validation = validatePassword(value);
    setValidationErrors(validation.errors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate password
    const validation = validatePassword(password);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }

    // Check passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to change password');
        setLoading(false);
        return;
      }

      // Success! Redirect to dashboard
      router.refresh();
      router.push('/dashboard');
    } catch (err) {
      console.error('Change password error:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const passwordStrength = password ? getPasswordStrength(password) : null;
  const strengthColors = {
    weak: 'bg-red-500',
    medium: 'bg-yellow-500',
    strong: 'bg-green-500',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          New Password
        </label>
        <PasswordInput
          id="password"
          name="password"
          value={password}
          onChange={(e) => handlePasswordChange(e.target.value)}
          required
        />
        {/* Password strength indicator */}
        {password && (
          <div className="mt-2">
            <div className="flex gap-1">
              <div className={`h-1 flex-1 rounded ${passwordStrength === 'weak' ? strengthColors.weak : 'bg-gray-200'}`} />
              <div className={`h-1 flex-1 rounded ${passwordStrength === 'medium' || passwordStrength === 'strong' ? strengthColors.medium : 'bg-gray-200'}`} />
              <div className={`h-1 flex-1 rounded ${passwordStrength === 'strong' ? strengthColors.strong : 'bg-gray-200'}`} />
            </div>
            <p className={`mt-1 text-xs ${passwordStrength === 'weak' ? 'text-red-600' : passwordStrength === 'medium' ? 'text-yellow-600' : 'text-green-600'}`}>
              Password strength: {passwordStrength}
            </p>
          </div>
        )}
      </div>

      {/* Password requirements */}
      {validationErrors.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm font-medium text-yellow-800 mb-2">Password requirements:</p>
          <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
            {validationErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
          Confirm New Password
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        {confirmPassword && password !== confirmPassword && (
          <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || validationErrors.length > 0 || password !== confirmPassword || !password}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Changing Password...' : 'Change Password'}
      </button>
    </form>
  );
}
