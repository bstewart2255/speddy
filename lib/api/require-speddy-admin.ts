import { createServiceClient } from '@/lib/supabase/server';

/**
 * Verify a caller holds the Speddy-staff flag.
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
export async function requireSpeddyAdmin(userId: string): Promise<string | null> {
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
