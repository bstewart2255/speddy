'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PasswordInput } from "../../components/auth/password-input";
import { logger } from '@/lib/logger';
import { handleClientError } from '@/lib/error-handler';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Double-check we're not accidentally in a GET scenario
    if (window.location.search.includes('password=')) {
      // Clear the URL if password was accidentally exposed
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    setError('');
    setLoading(true);

    logger.info('Login attempt', { email });

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        logger.warn('Login failed', { 
          email, 
          error: data.error,
          statusCode: response.status 
        });

        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      logger.info('Login successful', { email });

      // Use router.refresh() to ensure cookies are set before navigation
      router.refresh();
      router.push('/dashboard');
    } catch (err) {
      handleClientError(err, 'login-form');
      logger.error('Login error', err, { email });
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      method="POST"
      action="/api/auth/login"
      className="space-y-6"
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="teacher@school.edu"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <PasswordInput
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>

      <p className="hidden text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-500">
          Sign up
        </Link>
      </p>
      <div className="text-xs text-gray-500 mb-4 text-center">
        By using this service, you agree to our{' '}
        <Link href="/terms" className="text-blue-600 hover:text-blue-500">
          Terms of Service
        </Link>,{' '}
        <Link href="/privacy" className="text-blue-600 hover:text-blue-500">
          Privacy Policy
        </Link>, and{' '}
        <Link href="/ferpa" className="text-blue-600 hover:text-blue-500">
          FERPA Compliance
        </Link>
      </div>

      {/* Referral Program Link - with extra spacing */}
      <div className="hidden mt-12 text-center">
        <button
          type="button"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set('referral-program', 'true');
            window.history.pushState({}, '', url);
            window.dispatchEvent(new Event('popstate'));
          }}
          className="text-sm text-blue-600 hover:text-blue-500"
        >
          Learn about our referral program!
        </button>
      </div>
    </form>
  );
}