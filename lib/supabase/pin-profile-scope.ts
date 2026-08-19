import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pin a newly created profile's structured scope (school, district, state)
 * from the school it belongs to.
 *
 * WHY THIS EXISTS. `create_profile_for_new_user` resolves scope by fuzzy NAME
 * matching (`find_school_ids_by_names`), and that matcher's district lookup is
 * gated on a non-empty state name AND district name. Every admin/SIS creation
 * path passes `state: ''` and `school_district: ''`, so all three structured
 * ids come back NULL and each caller has to pin them afterwards. Four callers
 * pinned only `school_id` — which left 114 production profiles with no district
 * and no state, invisible to any district-level count (SPE-570).
 *
 * The school is the authoritative source here, not the caller's admin grant:
 * `admin_permissions.state_id` is not normalized (production holds both 'CA'
 * and 'ca'), whereas `districts.state_id` is the reference table.
 *
 * Callers that provision a school-less role (district_admin, district_tech)
 * cannot use this — they pin from their own grant instead, as
 * `app/api/admin/district/tech-admin/route.ts` does.
 *
 * Throws when the school is unknown or the update touches no row. A profile
 * that silently stays unscoped is precisely the failure this prevents.
 */
export async function pinProfileScopeFromSchool(
  admin: SupabaseClient,
  profileId: string,
  schoolId: string
): Promise<void> {
  const { data: school, error: schoolError } = await admin
    .from('schools')
    .select('district_id')
    .eq('id', schoolId)
    .single();

  if (schoolError || !school?.district_id) {
    throw new Error(
      `Profile scoping failed: could not resolve a district for school ${schoolId}` +
        (schoolError ? `: ${schoolError.message}` : '')
    );
  }

  // Read the state from the district in its own query rather than embedding it
  // in the school select: a to-one embed comes back shaped inconsistently and
  // SPE-559 shipped a live bug from exactly that assumption. Two plain reads
  // cannot be misread.
  const { data: district, error: districtError } = await admin
    .from('districts')
    .select('state_id')
    .eq('id', school.district_id)
    .single();

  if (districtError || !district?.state_id) {
    throw new Error(
      `Profile scoping failed: could not resolve a state for district ${school.district_id}` +
        (districtError ? `: ${districtError.message}` : '')
    );
  }

  const { data: updated, error: updateError } = await admin
    .from('profiles')
    .update({
      school_id: schoolId,
      district_id: school.district_id,
      state_id: district.state_id,
    })
    .eq('id', profileId)
    .select('id');

  if (updateError) {
    throw new Error(`Profile scoping update failed: ${updateError.message}`);
  }

  // PostgREST reports a filtered-out UPDATE as 2xx with an empty body, so the
  // absence of an error proves nothing on its own. Assert the row moved.
  if (!updated?.length) {
    throw new Error(`Profile scoping update affected no row for profile ${profileId}`);
  }
}
