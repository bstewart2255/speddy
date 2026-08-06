import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { speddyAdminDenialReason } from '@/lib/api/speddy-admin-denial-reason';
import { logger } from '@/lib/logger';
import { createConnection, listConnections } from '@/lib/sis/connections';

const log = logger.child({ module: 'internal-sis-connections' });

const forbidden = () =>
  NextResponse.json({ error: 'Forbidden: Speddy admin access required' }, { status: 403 });

/** List a district's SIS connections. Status only — never credentials. */
export const GET = withRoute(
  { query: z.object({ districtId: z.string().min(1) }) },
  async ({ userId, query }) => {
    const denied = await speddyAdminDenialReason(userId);
    if (denied) {
      log.warn('Non-speddy-admin tried to read SIS connections', { userId, denied });
      return forbidden();
    }

    const connections = await listConnections(query.districtId);
    return NextResponse.json({ connections });
  }
);

/**
 * Create a connection shell for a district, in `pending_dpa`.
 *
 * Deliberately does not accept a DPA date or credentials: recording the DPA is
 * a separate, separately-audited action, and credentials never come through
 * /internal at all — the district's own tech admin enters those.
 */
/**
 * Exported so it can be tested as the real thing. The https constraint below is
 * the sort of rule that is silently deleted in a refactor, and a copy of the
 * schema in a test file would keep passing after that happened.
 */
export const createSisConnectionBody = z.object({
  districtId: z.string().min(1),
  sisType: z.enum(['aeries', 'oneroster']),
  // https only, on both. A bare `.url()` accepts http://, and this route is the
  // one way an http:// base can reach the table — the district-facing path goes
  // through normalizeAeriesBaseUrl, which refuses it. A stored http:// base
  // would put the district's SIS credential on the wire in cleartext on every
  // probe, so it is refused at the boundary rather than re-checked wherever the
  // row is later read.
  baseUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), {
      message: 'baseUrl must start with https:// so credentials stay encrypted',
    })
    .optional(),
  tokenUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), {
      message: 'tokenUrl must start with https:// so credentials stay encrypted',
    })
    .optional(),
});

export const POST = withRoute(
  { body: createSisConnectionBody },
  async ({ userId, body }) => {
    const denied = await speddyAdminDenialReason(userId);
    if (denied) {
      log.warn('Non-speddy-admin tried to create a SIS connection', { userId, denied });
      return forbidden();
    }

    try {
      const connection = await createConnection({
        districtId: body.districtId,
        sisType: body.sisType,
        actorId: userId,
        baseUrl: body.baseUrl,
        tokenUrl: body.tokenUrl,
      });
      return NextResponse.json({ connection });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create SIS connection';
      log.error('Failed to create SIS connection', err, {
        districtId: body.districtId,
        sisType: body.sisType,
      });
      // The unique constraint is the one failure a staff member can trigger by
      // double-clicking, so name it rather than returning a raw Postgres string.
      if (message.includes('district_sis_connections_district_sis_key')) {
        return NextResponse.json(
          { error: 'This district already has a connection for that SIS.' },
          { status: 409 }
        );
      }
      // Fixed message, not `message`: a PostgREST error carries constraint,
      // column and foreign-key names. The detail belongs in the log line above.
      return NextResponse.json({ error: 'Failed to create SIS connection' }, { status: 500 });
    }
  }
);
