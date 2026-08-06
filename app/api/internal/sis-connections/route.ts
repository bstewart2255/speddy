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
export const POST = withRoute(
  {
    body: z.object({
      districtId: z.string().min(1),
      sisType: z.enum(['aeries', 'oneroster']),
      baseUrl: z.string().url().optional(),
      tokenUrl: z.string().url().optional(),
    }),
  },
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
      log.error('Failed to create SIS connection', {
        districtId: body.districtId,
        sisType: body.sisType,
        error: message,
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
