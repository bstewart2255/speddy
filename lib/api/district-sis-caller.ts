import { createServiceClient } from '@/lib/supabase/server';

/**
 * Resolve which district a caller may manage SIS connections for (SPE-396).
 *
 * The tech portal is for `district_tech`; `district_admin` is included because
 * the district admin creates that account and needs to be able to finish the
 * job themselves when the tech contact is unavailable — the same pair the
 * table's SELECT policy already admits (SPE-395).
 *
 * Named for what it RETURNS: a districtId when the caller is entitled to one,
 * or a denial reason. It never accepts a district from the request — the whole
 * point is that scope comes from the caller's own grants, so a request body
 * cannot widen it.
 *
 * Read through the service client on purpose: this decides authorization, and
 * must not itself depend on what the caller's session is permitted to select.
 */
export type DistrictSisCaller =
  | { ok: true; districtId: string; role: 'district_tech' | 'district_admin' }
  | { ok: false; denied: string };

export async function resolveDistrictSisCaller(userId: string): Promise<DistrictSisCaller> {
  if (!userId) return { ok: false, denied: 'no authenticated user' };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_permissions')
    .select('district_id, role')
    .eq('admin_id', userId)
    .in('role', ['district_tech', 'district_admin'])
    .not('district_id', 'is', null);

  if (error) return { ok: false, denied: `permission lookup failed: ${error.message}` };
  if (!data?.length) return { ok: false, denied: 'no district_tech or district_admin grant' };

  // Holding several grants is legal. Rather than guess, refuse — silently
  // picking one would let a multi-district admin write a credential to a
  // district they did not mean to touch. SPE-403 tracks the picker that makes
  // this a real choice instead of an error.
  const districts = [...new Set(data.map((p) => String(p.district_id)))];
  if (districts.length > 1) {
    return {
      ok: false,
      denied: `caller holds grants in ${districts.length} districts; district selection is not implemented (SPE-403)`,
    };
  }

  // Prefer the tech role in the reported value when the caller holds both.
  const role = data.some((p) => p.role === 'district_tech') ? 'district_tech' : 'district_admin';
  return { ok: true, districtId: districts[0], role };
}
