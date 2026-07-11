/**
 * Shared helpers for the calendar OAuth route handlers (SPE-205).
 */
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database';

/** CSRF state cookie, scoped to the OAuth routes only. */
export const STATE_COOKIE = 'gcal_oauth_state';

/**
 * Canonical public origin for OAuth redirect URLs. Mirrors the sign-in
 * callback's posture (see .env.example): trust NEXT_PUBLIC_SITE_URL in
 * production, fall back to the request origin locally, never read
 * x-forwarded-host. The redirect URI built from this must be registered on
 * the Google OAuth client.
 */
export function canonicalOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return request.nextUrl.origin;
}

/**
 * Where to land after connect/callback. Admins live under /dashboard/admin
 * (middleware bounces them off /dashboard/meetings), so the return path is
 * role-dependent.
 */
export async function meetingsPathForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'site_admin' || data?.role === 'district_admin'
    ? '/dashboard/admin/meetings'
    : '/dashboard/meetings';
}
