import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { resolveDistrictSisCaller } from '@/lib/api/district-sis-caller';
import { logger } from '@/lib/logger';
import { listConnections, storeCredential } from '@/lib/sis/connections';
import { normalizeAeriesBaseUrl } from '@/lib/sis/aeries-setup';

const log = logger.child({ module: 'tech-sis-aeries' });

/**
 * POST /api/tech/sis/aeries — a district submits its Aeries credential.
 *
 * This is the only route in the app that accepts a SIS certificate. Three
 * things are true of it by construction:
 *
 *  - the district comes from the caller's own grants, never the request body,
 *    so a tech admin cannot write a credential into another district's row;
 *  - the certificate is encrypted before it reaches the database and is never
 *    echoed back — the response carries connection status only;
 *  - the DPA gate is enforced beneath this, in `storeCredential` and again by a
 *    CHECK constraint, so this route cannot bypass it even by mistake.
 *
 * Rate-limited: this is an unauthenticated-adjacent secret-submission endpoint
 * in the sense that matters — a bug here is expensive, and there is no
 * legitimate reason to call it in a loop.
 */
export const POST = withRoute(
  {
    body: z.object({
      baseUrl: z.string().min(1, 'Enter your Aeries web address'),
      certificate: z
        .string()
        .trim()
        // 32 alphanumerics, matching the error text. Deliberately NOT tightened
        // to hex, even though every certificate we have seen is hex and the docs
        // say "32-char": the costs are asymmetric. Rejecting a valid certificate
        // locks a district out with no workaround; accepting a malformed one
        // costs one connection test that fails with a clear message. Aeries' own
        // docs call it "case-sensitive", which hex would not need to be — so the
        // character set is not certain enough to refuse on.
        .regex(/^[A-Za-z0-9]{32}$/, 'An Aeries certificate is 32 letters and numbers'),
    }),
    rateLimit: { requests: 10, windowSeconds: 60, name: 'tech-sis-aeries-store' },
  },
  async ({ userId, body }) => {
    const caller = await resolveDistrictSisCaller(userId);
    if (!caller.ok) {
      log.warn('Non-district-tech tried to store an Aeries credential', {
        userId,
        denied: caller.denied,
      });
      return NextResponse.json(
        { error: 'Forbidden: district tech admin access required' },
        { status: 403 },
      );
    }

    let baseUrl: string;
    try {
      baseUrl = normalizeAeriesBaseUrl(body.baseUrl);
    } catch (err) {
      // These messages are written for the district administrator and contain
      // nothing sensitive — passing them through is the point.
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'That Aeries address is not valid.' },
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
    const connection = connections.find((c) => c.sis_type === 'aeries');
    if (!connection) {
      return NextResponse.json(
        {
          error:
            'Aeries setup has not been opened for your district yet. Your Speddy contact will enable it.',
        },
        { status: 409 },
      );
    }
    if (!connection.dpa_cleared_at) {
      // The gate, stated in the district's terms rather than as a constraint
      // violation. They cannot fix this themselves — say who can.
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
        certificate: body.certificate,
      });
      log.info('Aeries credential stored', {
        districtId: caller.districtId,
        connectionId: connection.id,
      });
      return NextResponse.json({ connection: updated });
    } catch (err) {
      // `err` in the second position, not folded into the meta object: the
      // logger sends an Error's message and stack to Sentry but deliberately
      // withholds meta (it can carry student PII, SPE-167). Passing the cause
      // as meta made this alert arrive with no cause at all — the OneRoster
      // twin of this route has always had it right (SPE-417).
      log.error('Failed to store Aeries credential', err, { districtId: caller.districtId });
      // Fixed message: the underlying error can name constraints and columns.
      return NextResponse.json({ error: 'Could not save the credential.' }, { status: 500 });
    }
  },
);
