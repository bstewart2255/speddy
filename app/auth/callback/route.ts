import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * OAuth callback for Supabase social sign-in (currently Google).
 *
 * Provisioning gate: Speddy accounts are created by admins (and, for some
 * provider roles, self-signup) — never implicitly by SSO. We only allow a
 * social sign-in to proceed if the account ALREADY existed before this Google
 * login, detected by the presence of a non-Google ('email') identity.
 *
 * We do NOT gate on a `profiles` row: an `on_auth_user_created` trigger
 * (`handle_new_user()`) auto-creates a profile (default role 'resource') for
 * every new auth user, so "profile exists" is always true. A genuinely
 * provisioned account always has an `email` (password) identity, and Supabase
 * auto-links Google to it by verified email; a first-time Google sign-in is
 * google-only. For a google-only account we sign out and delete the orphan
 * auth user AND its trigger-created profile (profiles.id -> auth.users.id is
 * NO ACTION, so the profile must be removed explicitly), then bounce to
 * /login. Net effect: SSO can sign existing users in, but can never create a
 * new account.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');
  const nextParam = url.searchParams.get('next');
  // Only allow internal redirects to avoid open-redirect abuse.
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/dashboard';

  // Build the redirect base from a configured canonical origin when set,
  // otherwise the request's own origin. We intentionally do NOT trust the raw
  // `x-forwarded-host` header — it's client-controllable and would be an
  // open-redirect primitive. Set NEXT_PUBLIC_SITE_URL to the public origin
  // (e.g. https://www.speddy.xyz) in production so redirects land on the
  // canonical domain regardless of proxy host resolution.
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
  const base = configuredOrigin || url.origin;
  const redirectTo = (path: string) => NextResponse.redirect(`${base}${path}`);

  if (oauthError) {
    logger.warn('OAuth callback returned a provider error', { oauthError });
    return redirectTo('/login?error=oauth_failed');
  }
  if (!code) {
    return redirectTo('/login?error=oauth_failed');
  }

  // Everything that touches Supabase runs inside this try so any throw — client
  // setup, code exchange, or the provisioning lookup — fails closed with a
  // redirect rather than bubbling into a 500. `supabaseRef` is captured so the
  // catch can still attempt a best-effort sign-out.
  let supabaseRef: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    const supabase = await createClient();
    supabaseRef = supabase;

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      logger.warn('OAuth code exchange failed', { error: error?.message });
      return redirectTo('/login?error=oauth_failed');
    }

    const user = data.user;

    // Provisioning gate. A `profiles` row is NOT a reliable signal: an
    // `on_auth_user_created` trigger auto-creates a profile (defaulting role to
    // 'resource') for EVERY new auth user, including a first-time Google
    // sign-in. Instead we gate on identities: a genuinely provisioned account
    // (admin-created, or a prior self-signup) always has a non-Google ('email')
    // identity, and Supabase auto-links Google to it by verified email. A
    // first-time Google sign-in yields a google-only account — reject that.
    const admin = createServiceClient();
    const { data: fullUser, error: lookupError } = await admin.auth.admin.getUserById(user.id);

    if (lookupError || !fullUser?.user) {
      // Couldn't verify identities → fail closed WITHOUT deleting; never destroy
      // an account we can't confirm is unprovisioned.
      logger.error('SSO identity lookup failed; rejecting without deleting', lookupError);
      await supabase.auth.signOut();
      return redirectTo('/login?error=oauth_failed');
    }

    const identities = fullUser.user.identities ?? [];
    const isProvisioned = identities.some((identity) => identity.provider !== 'google');

    if (!isProvisioned) {
      // First-time Google identity with no pre-existing Speddy account. Clean up
      // the orphan Supabase just created. The `on_auth_user_created` trigger
      // also created a `profiles` row, and `profiles.id -> auth.users.id` is
      // NO ACTION (no cascade), so delete the profile explicitly BEFORE the auth
      // user — otherwise the FK blocks deleteUser. Sign-out is best effort. If
      // either delete fails, fail closed instead of claiming a clean rejection.
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        logger.warn('Failed to clear SSO session for an unprovisioned account', signOutError);
      }

      const { error: profileDeleteError } = await admin.from('profiles').delete().eq('id', user.id);
      if (profileDeleteError) {
        logger.error('Failed to delete trigger-created profile for unprovisioned SSO account', profileDeleteError);
        return redirectTo('/login?error=oauth_failed');
      }

      const { error: userDeleteError } = await admin.auth.admin.deleteUser(user.id);
      if (userDeleteError) {
        logger.error('Failed to delete unprovisioned SSO auth user', userDeleteError);
        return redirectTo('/login?error=oauth_failed');
      }

      logger.warn('Rejected SSO sign-in for an unprovisioned (Google-only) account', { userId: user.id });
      return redirectTo('/login?error=not_provisioned');
    }
  } catch (e) {
    // Fail closed on any unexpected throw (client setup, code exchange,
    // provisioning lookup).
    logger.error('SSO provisioning check failed; rejecting sign-in', e);
    try {
      if (supabaseRef) await supabaseRef.auth.signOut();
    } catch {
      // best effort
    }
    return redirectTo('/login?error=oauth_failed');
  }

  logger.info('SSO sign-in succeeded for a provisioned account');
  return redirectTo(next);
}
