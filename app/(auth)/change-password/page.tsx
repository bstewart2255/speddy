'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ChangePasswordForm from './change-password-form';

export default function ChangePasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          // Not logged in, redirect to login
          router.replace('/login');
          return;
        }

        // Check if user must change password
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('must_change_password')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          router.replace('/dashboard');
          return;
        }

        if (!profile?.must_change_password) {
          // User doesn't need to change password, redirect to dashboard
          router.replace('/dashboard');
          return;
        }

        setAuthorized(true);
      } catch (err) {
        console.error('Error checking auth:', err);
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!authorized) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <span className="text-3xl font-logo text-gray-900">Speddy</span>
          <h2 className="mt-6 text-2xl font-bold text-gray-900">
            Change Your Password
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Your password has been reset by an administrator. Please create a new password to continue.
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow rounded-lg">
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
