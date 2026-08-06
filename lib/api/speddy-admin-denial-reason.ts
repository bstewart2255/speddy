import { createServiceClient } from '@/lib/supabase/server';

/**
 * Why a caller may NOT act as Speddy staff — or null if they may.
 *
 * Named for what it RETURNS, not what it enforces. `requireSpeddyAdmin` read as
 * a boolean guard, but null means allowed and a string means denied, so
 * `if (await requireSpeddyAdmin(id)) return forbidden()` — the obvious reading —
 * would have inverted it and let everyone through, silently.
 *
 * `is_speddy_admin` is checked through the service client on purpose: the flag
 * gates the /internal surface, so reading it must not itself depend on what the
 * caller's own session is permitted to select. Middleware already redirects
 * non-staff away from /internal pages, but middleware guards navigation, not
 * fetch() — an API route has to check for itself.
 *
 * Returns null when the caller is staff, or a reason string when they are not.
 * Callers turn that into a 403; the reason is for logs, not for the response.
 */
export async function speddyAdminDenialReason(userId: string): Promise<string | null> {
  if (!userId) return 'no authenticated user';

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('is_speddy_admin')
    .eq('id', userId)
    .maybeSingle();

  if (error) return `profile lookup failed: ${error.message}`;
  if (!data) return 'profile not found';
  if (!data.is_speddy_admin) return 'not a speddy admin';
  return null;
}
