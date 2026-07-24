import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  PASSWORD_RECOVERY_COOKIE,
  passwordRecoveryCookieOptions,
} from '@/lib/auth/password-reset';

/**
 * Password-recovery callback (SPE-68).
 *
 * Supabase Auth sends the reset email; the link lands here and we establish a
 * session, then send the user to `/reset-password` to choose a new password.
 *
 * TWO link shapes are accepted, and the difference matters a lot in practice:
 *
 * 1. `?token_hash=&type=recovery` → `verifyOtp()`. **This is the one we want.**
 *    It carries no browser-bound secret, so it works when the reset is requested
 *    on one device and the email is opened on another — the normal case for a
 *    school user who requests on a classroom desktop and reads mail on a phone.
 *    Produced by the custom email template (see docs/ARCHITECTURE.md §5).
 * 2. `?code=` → `exchangeCodeForSession()`. The PKCE shape that Supabase's
 *    DEFAULT template sends. `@supabase/ssr` clients are PKCE by default and
 *    stash the code verifier in a browser cookie, so this shape **only works in
 *    the same browser that requested the reset**; from another device it fails
 *    as an expired link. Kept as a fallback so the flow still works before/if
 *    the dashboard template is customized, but it is not the intended path.
 *
 * Deliberately SEPARATE from `/auth/callback`. That route carries the SSO
 * provisioning gate, which *deletes* an auth user + profile it judges
 * unprovisioned. A password user would pass that gate (they always have an
 * 'email' identity), but a password-reset link must never run through
 * delete-the-account code. This route does one thing: verify and redirect.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
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

  if (!tokenHash && !code) {
    return redirectTo('/login?error=reset_invalid');
  }

  try {
    const supabase = await createClient();

    // Prefer the device-independent token_hash path when the link carries one.
    const { error } = tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      : await supabase.auth.exchangeCodeForSession(code as string);

    if (error) {
      logger.warn('Password reset verification failed', {
        error: error.message,
        shape: tokenHash ? 'token_hash' : 'code',
      });
      return redirectTo('/login?error=reset_expired');
    }
  } catch (e) {
    // Fail closed on any unexpected throw (client setup, verification).
    logger.error('Password reset callback failed', e);
    return redirectTo('/login?error=reset_invalid');
  }

  // Mark this browser as having just redeemed a recovery link. This is what
  // `POST /api/auth/reset-password` checks — an authenticated session alone is
  // NOT proof the caller controls the mailbox, so the reset endpoint refuses to
  // run without this marker.
  const response = redirectTo('/reset-password');
  response.cookies.set(PASSWORD_RECOVERY_COOKIE, '1', passwordRecoveryCookieOptions);
  return response;
}
