import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from './reset-password-form';

// The recovery session is established per-request by /auth/reset-callback, so
// this page must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * "Choose a new password" step of the self-service reset (SPE-68).
 *
 * Reached only from `/auth/reset-callback`, which exchanges the emailed code
 * for a session first. The route is public in `middleware.ts` (an unauthenticated
 * visitor must be able to land here), so the session check lives here: without a
 * valid recovery session there is nothing to reset, and `updateUser` would fail
 * anyway — bounce to login with copy that explains why.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?error=reset_invalid');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <span className="text-3xl font-logo text-gray-900">Speddy</span>
          <h2 className="mt-6 text-2xl font-bold text-gray-900">Choose a new password</h2>
          <p className="mt-2 text-sm text-gray-600">
            Set a new password for <span className="font-medium">{user.email}</span>.
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow rounded-lg">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
