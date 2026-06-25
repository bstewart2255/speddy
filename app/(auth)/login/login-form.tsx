'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PasswordInput } from "../../components/auth/password-input";
import { logger } from '@/lib/logger';
import { handleClientError } from '@/lib/error-handler';
import { getSupabaseClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // We're on the login page (unauthenticated), so any leftover idle-timeout
    // timestamp is from a prior, now-ended session (e.g. cookies expired without
    // a clean sign-out). Clear it so a fresh login isn't immediately signed out
    // by the cross-close idle check in use-activity-tracker.
    localStorage.removeItem('lastActivity');

    // Surface errors handed back by the OAuth callback (?error=...).
    const err = new URLSearchParams(window.location.search).get('error');
    if (err === 'not_provisioned') {
      setError(
        "This Google account isn't set up in Speddy yet. Ask your administrator to create your account first, then sign in."
      );
    } else if (err === 'oauth_failed') {
      setError("Google sign-in didn't complete. Please try again.");
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    logger.info('Google sign-in attempt');

    try {
      const supabase = getSupabaseClient();
      const hostedDomain = process.env.NEXT_PUBLIC_GOOGLE_HD;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
            ...(hostedDomain ? { hd: hostedDomain } : {}),
          },
        },
      });

      if (error) {
        logger.warn('Google sign-in failed to start', { error: error.message });
        setError('Could not start Google sign-in. Please try again.');
        setLoading(false);
      }
      // On success the browser is redirected to Google.
    } catch (err) {
      handleClientError(err, 'login-form-google');
      logger.error('Google sign-in error', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

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

      // Check if user must change their password
      if (data.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      handleClientError(err, 'login-form');
      logger.error('Login error', err, { email });
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;

    try {
      // Submit the email to trigger password reset request notification
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      // Always show success (API returns success regardless of email validity)
      setForgotSubmitted(true);
    } catch (err) {
      // Even on error, show success to avoid revealing anything
      setForgotSubmitted(true);
    }
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setForgotEmail('');
    setForgotSubmitted(false);
  };

  // Forgot password view
  if (showForgotPassword) {
    return (
      <div className="space-y-6">
        {forgotSubmitted ? (
          // Success message after submitting email
          <div className="text-center space-y-4">
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-4 rounded-lg">
              <p className="font-medium">Contact Your Site Admin</p>
              <p className="mt-2 text-sm">
                Reach out to your site admin for your temporary password. Once you receive it, return here to log in.
              </p>
            </div>
            <button
              type="button"
              onClick={handleBackToLogin}
              className="text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              ← Back to login
            </button>
          </div>
        ) : (
          // Email input form
          <form onSubmit={handleForgotPassword} className="space-y-6">
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your email"
              />
            </div>
            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={handleBackToLogin}
              className="w-full text-sm font-medium text-gray-600 hover:text-gray-500"
            >
              ← Back to login
            </button>
          </form>
        )}
      </div>
    );
  }

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
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <button
            type="button"
            onClick={() => setShowForgotPassword(true)}
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            Forgot password?
          </button>
        </div>
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

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-gray-50 px-2 text-gray-500">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Continue with Google
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
    </form>
  );
}