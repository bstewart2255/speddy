import { NextResponse } from 'next/server';
import { requireDistrictAdmin } from '@/lib/api/district-admin-gate';
import { logger } from '@/lib/logger';
import { resolveOneRosterConnection } from '@/lib/sis/connections';

const log = logger.child({ module: 'district-oneroster-gate' });

/**
 * The admission gate shared by the district-admin sync surfaces (SPE-540;
 * extracted verbatim from the SPE-438 teacher-sync route so a third surface
 * cannot re-type — and subtly drift — the auth block).
 *
 * What it decides, in order:
 *   1. The caller holds a district grant at all (their OWN district, resolved
 *      from grants — a request can never name a district or a connection).
 *   2. The caller is a DISTRICT ADMIN, not just `district_tech`: these
 *      surfaces serve student/teacher PII and write real records, both outside
 *      the tech role's integrations-only line (SPE-393). A dual-role caller is
 *      re-checked against `admin_permissions` scoped to caller AND role AND
 *      district — dropping any one filter would admit an admin of a DIFFERENT
 *      district.
 *   3. The district has a OneRoster connection with a stored, decryptable
 *      credential.
 *
 * Refusals come back as a ready NextResponse so every surface refuses with
 * the same status shapes; the two surface-specific sentences are parameters
 * so existing user-facing wording stays byte-identical.
 */

export interface DistrictOneRosterConnection {
  id: string;
  district_id: string;
  base_url: string;
  token_url: string | null;
}

export type DistrictOneRosterGateResult =
  | {
      ok: true;
      districtId: string;
      connection: DistrictOneRosterConnection;
      credential: { clientId: string; clientSecret: string };
    }
  | { ok: false; response: NextResponse };

export async function requireDistrictAdminOneRoster(
  userId: string,
  surface: {
    /** For log lines only — counts and fixed words, never data. */
    logLabel: string;
    /** Verbatim 403 body for a tech-role caller without an admin grant. */
    adminOnlyMessage: string;
    /** Verbatim 409 body when the district has no OneRoster connection. */
    noConnectionMessage: string;
  },
): Promise<DistrictOneRosterGateResult> {
  const refuse = (body: { error: string }, status: number): DistrictOneRosterGateResult => ({
    ok: false,
    response: NextResponse.json(body, { status }),
  });

  const admitted = await requireDistrictAdmin(userId, {
    logLabel: surface.logLabel,
    adminOnlyMessage: surface.adminOnlyMessage,
  });
  if (!admitted.ok) return { ok: false, response: admitted.response };
  const districtId = admitted.districtId;

  // Connection + credential resolution is SHARED with the unattended runner
  // (resolveOneRosterConnection, SPE-545) so the attended and unattended
  // paths cannot drift on "does this district have a dialable setup". This
  // gate owns only the mapping to its pinned HTTP refusals.
  const resolved = await resolveOneRosterConnection(districtId);
  if (resolved.status === 'load-failed') {
    if (resolved.phase === 'connections') {
      log.error(`Failed to load SIS connections for the ${surface.logLabel}`, undefined, {
        districtId: districtId,
      });
      return refuse({ error: 'Could not load your connection.' }, 500);
    }
    log.error('Could not decrypt the stored SIS credential', undefined, {
      connectionId: resolved.connectionId,
    });
    return refuse(
      { error: 'Your stored OneRoster credential could not be read. Re-save it in the tech portal.' },
      500,
    );
  }
  if (resolved.status === 'no-connection') {
    return refuse({ error: surface.noConnectionMessage }, 409);
  }
  if (resolved.status === 'no-credential') {
    return refuse(
      { error: 'No OneRoster credentials are stored yet, so there is nothing to sync.' },
      409,
    );
  }

  return {
    ok: true,
    districtId: districtId,
    connection: resolved.connection,
    credential: resolved.credential,
  };
}
