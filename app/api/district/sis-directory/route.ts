import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { resolveDistrictSisCaller } from '@/lib/api/district-sis-caller';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getDecryptedCredential, listConnections } from '@/lib/sis/connections';
import {
  DIRECTORY_AREAS,
  fetchDirectoryPage,
  type DirectoryArea,
} from '@/lib/sis/oneroster-directory';

const log = logger.child({ module: 'district-sis-directory' });

const querySchema = z.object({
  area: z.enum(DIRECTORY_AREAS),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

/**
 * GET /api/district/sis-directory?area=teachers — one read-only directory
 * page, live from the caller's own district's OneRoster server (SPE-436).
 *
 * Authorization is `resolveDistrictSisCaller` (SPE-396's seam): district_admin
 * or district_tech, the district comes from the caller's own grants, and a
 * request can never name one. The decrypted credential exists only inside this
 * request; the response carries the picked rows and aggregate stats, nothing
 * else — see `oneroster-directory.ts` for why the pick is the contract.
 *
 * Rate-limited like the SIS test routes: every call reaches a school
 * district's production server (teachers/students cost the area read plus the
 * school-name map — up to six upstream reads for a district with hundreds of
 * schools).
 */
export const GET = withRoute(
  {
    query: querySchema,
    rateLimit: { requests: 12, windowSeconds: 60, name: 'district-sis-directory' },
  },
  async ({ userId, query }) => {
    const caller = await resolveDistrictSisCaller(userId);
    if (!caller.ok) {
      log.warn('Non-district-admin tried to read the SIS directory', {
        userId,
        denied: caller.denied,
      });
      return NextResponse.json(
        { error: 'Forbidden: district admin access required' },
        { status: 403 },
      );
    }

    // DIRECTORIES ARE DISTRICT-ADMIN ONLY. The shared seam admits
    // district_tech too — right for connection management, wrong here:
    // `district_tech` has no right to student data (SPE-393), and this route
    // serves student names, IDs and grades. The seam also REPORTS
    // district_tech when a caller holds both grants, so a tech-role answer
    // gets one more look at the grants before it is refused (Codex, PR #830).
    if (caller.role !== 'district_admin') {
      const { data: adminGrant } = await createServiceClient()
        .from('admin_permissions')
        .select('id')
        .eq('admin_id', userId)
        .eq('role', 'district_admin')
        .eq('district_id', caller.districtId)
        .limit(1)
        .maybeSingle();
      if (!adminGrant) {
        log.warn('district_tech tried to read the SIS directory', {
          userId,
          districtId: caller.districtId,
        });
        return NextResponse.json(
          { error: 'Forbidden: directories are for district admins.' },
          { status: 403 },
        );
      }
    }

    // Wrapped: withRoute's catch echoes error.message to the client in
    // development, and a Supabase error names tables and constraints.
    let connections;
    try {
      connections = await listConnections(caller.districtId);
    } catch (err) {
      log.error('Failed to load SIS connections for the directory', err, {
        districtId: caller.districtId,
      });
      return NextResponse.json({ error: 'Could not load your connection.' }, { status: 500 });
    }

    const connection = connections.find((c) => c.sis_type === 'oneroster');
    if (!connection || !connection.base_url) {
      // Not an error state: directories simply need the OneRoster connection
      // to exist first. The page words this as setup guidance.
      return NextResponse.json(
        { error: 'Directories need a OneRoster connection. Set one up in the tech portal first.' },
        { status: 409 },
      );
    }

    let credential: Awaited<ReturnType<typeof getDecryptedCredential>> = null;
    try {
      credential = await getDecryptedCredential(connection.id);
    } catch (err) {
      // Distinct from "not stored yet": telling an admin to enter credentials
      // that exist hides an operational fault (likely a key rotation) behind
      // setup guidance (CodeRabbit, PR #830).
      log.error('Could not decrypt the stored SIS credential for the directory', err, {
        connectionId: connection.id,
      });
      return NextResponse.json(
        { error: 'Your stored OneRoster credential could not be read. Re-save it in the tech portal.' },
        { status: 500 },
      );
    }
    if (!credential || credential.sisType !== 'oneroster') {
      return NextResponse.json(
        { error: 'No OneRoster credentials are stored yet, so there is nothing to show.' },
        { status: 409 },
      );
    }

    try {
      const page = await fetchDirectoryPage({
        baseUrl: connection.base_url,
        tokenUrl: connection.token_url,
        clientId: credential.clientId,
        clientSecret: credential.clientSecret,
        area: query.area,
        offset: query.offset,
      });

      // Counts only — the established SIS logging discipline. Which area a
      // district admin browsed is operational; what it contained is not ours
      // to keep.
      log.info('SIS directory page served', {
        districtId: caller.districtId,
        role: caller.role,
        area: page.area,
        offset: page.offset,
        rows: page.rows.length,
      });

      return NextResponse.json(page);
    } catch (err) {
      // The lib throws for unreachable/refusing servers and guard refusals.
      // The admin's fix is the same either way: run the connection test in
      // the tech portal, where the step-by-step diagnostics live.
      log.error('SIS directory fetch failed', err, {
        districtId: caller.districtId,
        area: query.area,
      });
      return NextResponse.json(
        {
          error:
            'Could not reach your OneRoster server just now. Run the connection test in the tech portal to see exactly what is wrong.',
        },
        { status: 502 },
      );
    }
  },
);
