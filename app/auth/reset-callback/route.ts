import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Password-recovery callback (SPE-68).
 *
 * Supabase Auth sends the reset email; its link verifies at Supabase and then
 * lands here with a PKCE `?code=`. We exchange that code for a session and send
 * the user to `/reset-password` to choose a new password.
 *
 * Deliberately SEPARATE from `/auth/callback`. That route carries the SSO
 * provisioning gate, which *deletes* an auth user + profile it judges
 * unprovisioned. A password user would pass that gate (they always have an
 * 'email' identity), but a password-reset link must never run through
 * delete-the-account code. This route does one thing: exchange and redirect.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  // Supabase appends these when the link is expired, already used, or revoked.
  const errorCode = url.searchParams.get('error_code');
  const authError = url.searchParams.get('error');

  // Same origin posture as `/auth/callback`: trust a configured canonical
  // origin when set, otherwise the request's own origin. Never `x-forwarded-host`
  // (client-controllable → open-redirect primitive).
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
  const base = configuredOrigin || url.origin;
  const redirectTo = (path: string) => NextResponse.redirect(`${base}${path}`);

  if (authError || errorCode) {
    // Expired or already-used link is the common, expected case — not an error
    // worth paging on. Send them back to login with actionable copy.
    logger.info('Password reset link rejected by Supabase', { errorCode, authError });
    return redirectTo('/login?error=reset_expired');
  }

  if (!code) {
    return redirectTo('/login?error=reset_invalid');
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logger.warn('Password reset code exchange failed', { error: error.message });
      return redirectTo('/login?error=reset_expired');
    }
  } catch (e) {
    // Fail closed on any unexpected throw (client setup, exchange).
    logger.error('Password reset callback failed', e);
    return redirectTo('/login?error=reset_invalid');
  }

  return redirectTo('/reset-password');
}
