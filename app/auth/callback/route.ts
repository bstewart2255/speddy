import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * OAuth callback for Supabase social sign-in (currently Google).
 *
 * Provisioning gate: Speddy accounts are created by admins (and, for some
 * provider roles, self-signup) — never implicitly by SSO. We only allow a
 * social sign-in to proceed if we ALREADY have an account for the user,
 * detected by the presence of a `profiles` row. There is no trigger on
 * `auth.users` (profiles are created by explicit RPC during signup/admin
 * creation — see 20250117_create_profile_on_signup.sql), so a brand-new
 * Google user has an auth row but no profile. When there's no profile we
 * delete the just-created orphan auth user and bounce them back to /login
 * with an explanation. Net effect: SSO can sign existing users in, but can
 * never create a new account.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');
  const nextParam = url.searchParams.get('next');
  // Only allow internal redirects to avoid open-redirect abuse.
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/dashboard';

  // Honor the proxy host in production (Vercel) so redirects stay on the public origin.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  const base = isLocalEnv || !forwardedHost ? url.origin : `https://${forwardedHost}`;
  const redirectTo = (path: string) => NextResponse.redirect(`${base}${path}`);

  if (oauthError) {
    logger.warn('OAuth callback returned a provider error', { oauthError });
    return redirectTo('/login?error=oauth_failed');
  }
  if (!code) {
    return redirectTo('/login?error=oauth_failed');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    logger.warn('OAuth code exchange failed', { error: error?.message });
    return redirectTo('/login?error=oauth_failed');
  }

  const user = data.user;

  try {
    // Authoritative provisioning check via the service role (bypasses RLS so a
    // legitimately provisioned user is never falsely rejected).
    const admin = createServiceClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      // No Speddy account for this identity. Sign out and remove the orphan
      // auth user that Supabase created for this OAuth sign-in.
      await supabase.auth.signOut();
      await admin.auth.admin.deleteUser(user.id);
      logger.warn('Rejected SSO sign-in for an unprovisioned account', { userId: user.id });
      return redirectTo('/login?error=not_provisioned');
    }
  } catch (e) {
    // Fail closed: if provisioning can't be verified, do not grant access.
    logger.error('SSO provisioning check failed; rejecting sign-in', e);
    try {
      await supabase.auth.signOut();
    } catch {
      // best effort
    }
    return redirectTo('/login?error=oauth_failed');
  }

  logger.info('SSO sign-in succeeded for a provisioned account');
  return redirectTo(next);
}
