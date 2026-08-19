import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'account-provisioning' });

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
 * and 'ca'), whereas `districts.state_id` is the reference table and matches
 * `states.id`, which `profiles.state_id` is FK-constrained to. A grant's 'ca'
 * would not merely look odd — it would violate that FK.
 *
 * Callers that provision a school-less role (district_admin, district_tech)
 * cannot use this: with no school there is nothing to derive from, so they
 * pin from their own grant, as `app/api/admin/district/tech-admin/route.ts`
 * does. That leaves them exposed to the un-normalized `state_id` above —
 * latent today only because the one lowercase grant in production belongs to
 * a site_admin, who cannot reach those routes. Tracked separately rather than
 * fixed here; this helper is not a path they can take.
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

/**
 * Undo a half-provisioned account: profile row FIRST, then the auth user.
 *
 * THE ORDER IS LOAD-BEARING. `profiles.id` references `auth.users(id)` with
 * `ON DELETE NO ACTION` (confirmed against the live schema), so deleting the
 * auth user while its profile still exists is REJECTED by the foreign key.
 * Worse, the admin API RESOLVES with `{ error }` rather than rejecting, so a
 * caller that ignores the return value logs a clean rollback while leaving an
 * orphaned, sign-in-capable account behind — and the email stays permanently
 * taken, so the admin's retry fails too.
 *
 * `lib/sis/teacher-directory-sync.ts` learned this in PR #833 and has always
 * done it in this order; the four account-creation routes did not, and each
 * throw added by SPE-570 is a new way to reach their broken path.
 *
 * Never throws: a failed rollback must not mask the original error. Each step
 * is guarded SEPARATELY — a single try around both would let a throw in the
 * profile delete skip the auth-user delete entirely, which is the very outcome
 * this function exists to prevent. Both inspect their own error and log loudly
 * by id (our own UUID, no PII): an orphaned account nothing will retry is
 * exactly what an operator needs to hear about.
 */
export async function rollbackProvisionedAccount(
  admin: SupabaseClient,
  accountId: string
): Promise<void> {
  try {
    const { error: profileError } = await admin.from('profiles').delete().eq('id', accountId);
    if (profileError) {
      log.error('Rollback could not remove the profile of an orphaned account', undefined, {
        accountId,
        reason: profileError.message,
      });
    }
  } catch (err) {
    log.error('Rollback threw while removing the profile of an orphaned account', err, {
      accountId,
    });
  }

  try {
    const { error: userError } = await admin.auth.admin.deleteUser(accountId);
    if (userError) {
      log.error('Rollback could not remove the auth user of an orphaned account', undefined, {
        accountId,
        reason: userError.message,
      });
    }
  } catch (err) {
    log.error('Rollback threw while removing the auth user of an orphaned account', err, {
      accountId,
    });
  }
}
