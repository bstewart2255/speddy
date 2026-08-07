import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/with-route';
import { resolveDistrictSisCaller } from '@/lib/api/district-sis-caller';
import { logger } from '@/lib/logger';
import { getDecryptedCredential, listConnections, recordTestResult } from '@/lib/sis/connections';
import {
  runOneRosterConnectionTest,
  toStoredOneRosterTestResult,
} from '@/lib/sis/oneroster-setup';

const log = logger.child({ module: 'tech-sis-oneroster-test' });

/**
 * POST /api/tech/sis/oneroster/test — check the stored credentials, step by step.
 *
 * The OneRoster counterpart to the Aeries test route, and the same idea: rather
 * than "it didn't work", the district gets the exact step that failed. Here the
 * steps are sign-in, then orgs, then schools — and the distinction that earns
 * its keep is sign-in versus everything after it, because a sign-in failure
 * almost always means the certificate was pasted where the Consumer ID and
 * Secret belong.
 *
 * Both decrypted secrets exist only inside this request. They are fetched, used
 * for the exchange, and dropped; the response carries diagnostics only, and what
 * is persisted is narrower still (`toStoredOneRosterTestResult` drops counts).
 *
 * Rate-limited harder than the credential write: each call reaches out to the
 * district's own SIS several times.
 */
export const POST = withRoute(
  { rateLimit: { requests: 6, windowSeconds: 60, name: 'tech-sis-oneroster-test' } },
  async ({ userId }) => {
    const caller = await resolveDistrictSisCaller(userId);
    if (!caller.ok) {
      log.warn('Non-district-tech tried to test a OneRoster connection', {
        userId,
        denied: caller.denied,
      });
      return NextResponse.json(
        { error: 'Forbidden: district tech admin access required' },
        { status: 403 },
      );
    }

    // Wrapped for the same reason the write route wraps it: withRoute's catch
    // echoes error.message to the client when NODE_ENV=development, and a
    // Supabase error names tables and constraints.
    let connections;
    try {
      connections = await listConnections(caller.districtId);
    } catch (err) {
      log.error('Failed to load SIS connections', err, { districtId: caller.districtId });
      return NextResponse.json({ error: 'Could not load your connection.' }, { status: 500 });
    }
    const connection = connections.find((c) => c.sis_type === 'oneroster');
    if (!connection) {
      return NextResponse.json({ error: 'No OneRoster connection to test.' }, { status: 404 });
    }

    // Decryption throws when the ciphertext can't be opened — most plausibly
    // after an encryption-key rotation. That reads to the district exactly like
    // "no credentials stored", and the fix is the same, so say so rather than
    // returning a 500 they can do nothing with.
    let credential: Awaited<ReturnType<typeof getDecryptedCredential>> = null;
    try {
      credential = await getDecryptedCredential(connection.id);
    } catch (err) {
      log.error('Could not decrypt the stored OneRoster credentials', err, {
        connectionId: connection.id,
      });
    }
    if (!credential || credential.sisType !== 'oneroster') {
      // Not an error state: a connection can legitimately exist with no
      // credentials yet. Say what to do rather than reporting a failure.
      return NextResponse.json(
        { error: 'Enter your Consumer ID and Secret Key first, then run the test.' },
        { status: 409 },
      );
    }
    if (!connection.base_url) {
      return NextResponse.json(
        {
          error: 'This connection has no OneRoster address saved. Re-enter it and save again.',
        },
        { status: 409 },
      );
    }
    // A missing token address is NOT an error any more. It is a field the
    // district's own console never shows them (SPE-426), so it is optional on
    // the form and derived from the base URL here.

    const report = await runOneRosterConnectionTest({
      baseUrl: connection.base_url,
      tokenUrl: connection.token_url ?? undefined,
      clientId: credential.clientId,
      clientSecret: credential.clientSecret,
    });

    // Reported, never written back — see the note in the Aeries test route for
    // why persisting a resolved address is a trap. Logged so we can see which
    // districts are on a non-default token endpoint without touching their row.
    if (report.usedTokenUrl) {
      log.info('OneRoster signed in at a different token endpoint than the one stored', {
        connectionId: connection.id,
        stored: connection.token_url,
        answered: report.usedTokenUrl,
        ok: report.ok,
      });
    }

    try {
      await recordTestResult({
        connectionId: connection.id,
        actorId: userId,
        ok: report.ok,
        result: toStoredOneRosterTestResult(report),
      });
    } catch (err) {
      // The exchange already ran. Turning a bookkeeping failure into a 500 would
      // hide a completed report AND invite the district to run it again, sending
      // more requests at their SIS to learn what we already know.
      log.error('Failed to record OneRoster test result', err, {
        connectionId: connection.id,
      });
    }

    log.info('OneRoster connection tested', {
      districtId: caller.districtId,
      connectionId: connection.id,
      ok: report.ok,
    });

    return NextResponse.json({ report });
  },
);
