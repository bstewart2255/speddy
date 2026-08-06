import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { resolveDistrictSisCaller } from '@/lib/api/district-sis-caller';
import { logger } from '@/lib/logger';
import { listConnections, storeCredential } from '@/lib/sis/connections';
import {
  normalizeOneRosterBaseUrl,
  normalizeOneRosterTokenUrl,
} from '@/lib/sis/oneroster-setup';

const log = logger.child({ module: 'tech-sis-oneroster' });

/**
 * POST /api/tech/sis/oneroster — a district submits its OneRoster credentials.
 *
 * The Aeries sibling of this route (`../aeries/route.ts`) carries the same three
 * guarantees, and they hold here for the same reasons: the district comes from
 * the caller's own grants and never the request body; both secrets are
 * encrypted before reaching the database and are never echoed back; and the DPA
 * gate is enforced beneath this in `storeCredential` and again by a CHECK
 * constraint, so this route cannot bypass it even by mistake.
 *
 * WHAT IS DIFFERENT: two credentials and two URLs instead of one of each. The
 * shape of the validation below is deliberately loose on the credentials — see
 * the note on the schema.
 */
export const POST = withRoute(
  {
    body: z.object({
      baseUrl: z.string().min(1, 'Enter your OneRoster address'),
      tokenUrl: z.string().min(1, 'Enter your OneRoster token address'),
      // No format regex on either credential, unlike the Aeries certificate's
      // 32-character shape. OneRoster consumer IDs and secrets have no length
      // or character set defined by the standard, and they differ per vendor —
      // there is no shape to check that would not eventually lock out a
      // legitimate district. A wrong value fails the connection test in one
      // click with a specific message, which is the cheaper failure.
      clientId: z.string().trim().min(1, 'Enter the Consumer ID'),
      clientSecret: z.string().trim().min(1, 'Enter the Consumer Secret Key'),
    }),
    rateLimit: { requests: 10, windowSeconds: 60, name: 'tech-sis-oneroster-store' },
  },
  async ({ userId, body }) => {
    const caller = await resolveDistrictSisCaller(userId);
    if (!caller.ok) {
      log.warn('Non-district-tech tried to store a OneRoster credential', {
        userId,
        denied: caller.denied,
      });
      return NextResponse.json(
        { error: 'Forbidden: district tech admin access required' },
        { status: 403 },
      );
    }

    let baseUrl: string;
    let tokenUrl: string;
    try {
      baseUrl = normalizeOneRosterBaseUrl(body.baseUrl);
      tokenUrl = normalizeOneRosterTokenUrl(body.tokenUrl);
    } catch (err) {
      // Written for the district administrator and containing nothing
      // sensitive — passing them through is the point.
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'That OneRoster address is not valid.' },
        { status: 400 },
      );
    }

    // Wrapped rather than left to the route wrapper: withRoute's catch echoes
    // error.message to the client when NODE_ENV=development, and a Supabase
    // error names tables and constraints.
    let connections;
    try {
      connections = await listConnections(caller.districtId);
    } catch (err) {
      log.error('Failed to load SIS connections', err, { districtId: caller.districtId });
      return NextResponse.json({ error: 'Could not load your connection.' }, { status: 500 });
    }

    const connection = connections.find((c) => c.sis_type === 'oneroster');
    if (!connection) {
      return NextResponse.json(
        {
          error:
            'OneRoster setup has not been opened for your district yet. Your Speddy contact will enable it.',
        },
        { status: 409 },
      );
    }
    if (!connection.dpa_cleared_at) {
      return NextResponse.json(
        {
          error:
            "Your district's data privacy agreement is not on file yet. Your Speddy contact will let you know when setup can begin.",
        },
        { status: 409 },
      );
    }

    try {
      const updated = await storeCredential({
        connectionId: connection.id,
        actorId: userId,
        baseUrl,
        tokenUrl,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
      });
      log.info('OneRoster credentials stored', {
        districtId: caller.districtId,
        connectionId: connection.id,
      });
      return NextResponse.json({ connection: updated });
    } catch (err) {
      log.error('Failed to store OneRoster credentials', err, {
        districtId: caller.districtId,
      });
      // Fixed message: the underlying error can name constraints and columns.
      return NextResponse.json({ error: 'Could not save the credentials.' }, { status: 500 });
    }
  },
);
