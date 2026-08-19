import { NextResponse } from 'next/server';
import { resolveDistrictSisCaller } from '@/lib/api/district-sis-caller';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'district-admin-gate' });

/**
 * "Is this caller a district admin, and of WHICH district?" — extracted from
 * `requireDistrictAdminOneRoster` (SPE-540) so a surface that needs the same
 * admission but not a SIS connection can share it rather than re-type it.
 *
 * Re-typing is the specific risk: the block below re-checks `admin_permissions`
 * scoped to caller AND role AND district, and dropping any one of those filters
 * would admit an admin of a DIFFERENT district. One copy, two callers.
 *
 * What it decides, in order:
 *   1. The caller holds a district grant at all — their OWN district, resolved
 *      from their grants. A request can never name a district.
 *   2. The caller is a DISTRICT ADMIN, not merely `district_tech`. Surfaces
 *      behind this gate serve student PII and write real records, both outside
 *      the tech role's integrations-only line (SPE-393).
 *
 * Read through the service client on purpose: this decides authorization and
 * must not depend on what the caller's own session is permitted to select —
 * `students_select` has no district branch at all, so a district admin reads
 * zero students through RLS (SPE-447 scoping).
 */
export type DistrictAdminGateResult =
  | { ok: true; districtId: string }
  | { ok: false; response: NextResponse };

export async function requireDistrictAdmin(
  userId: string,
  surface: {
    /** For log lines only — counts and fixed words, never data. */
    logLabel: string;
    /** Verbatim 403 body for a tech-role caller without an admin grant. */
    adminOnlyMessage: string;
  },
): Promise<DistrictAdminGateResult> {
  const refuse = (body: { error: string }, status: number): DistrictAdminGateResult => ({
    ok: false,
    response: NextResponse.json(body, { status }),
  });

  const caller = await resolveDistrictSisCaller(userId);
  if (!caller.ok) {
    log.warn(`Non-district-admin tried the ${surface.logLabel}`, {
      userId,
      denied: caller.denied,
    });
    return refuse({ error: 'Forbidden: district admin access required' }, 403);
  }

  if (caller.role !== 'district_admin') {
    const { data: adminGrant, error: grantError } = await createServiceClient()
      .from('admin_permissions')
      .select('id')
      .eq('admin_id', userId)
      .eq('role', 'district_admin')
      .eq('district_id', caller.districtId)
      .limit(1)
      .maybeSingle();
    if (grantError) {
      // Fail-closed either way, but a database fault must not read as a
      // missing grant in the logs.
      log.error('The district_admin grant re-check failed; refusing', grantError, {
        userId,
        districtId: caller.districtId,
      });
    }
    if (!adminGrant) {
      log.warn(`district_tech tried the ${surface.logLabel}`, {
        userId,
        districtId: caller.districtId,
      });
      return refuse({ error: surface.adminOnlyMessage }, 403);
    }
  }

  return { ok: true, districtId: caller.districtId };
}
