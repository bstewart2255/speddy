import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/with-route';
import { resolveDistrictSisCaller } from '@/lib/api/district-sis-caller';
import { logger } from '@/lib/logger';
import {
  getDecryptedCredential,
  listConnections,
  recordTestResult,
} from '@/lib/sis/connections';
import { runAeriesConnectionTest, toStoredTestResult } from '@/lib/sis/aeries-setup';

const log = logger.child({ module: 'tech-sis-aeries-test' });

/**
 * POST /api/tech/sis/aeries/test — check the stored credential, area by area.
 *
 * The feature that removes most onboarding back-and-forth: instead of "it
 * didn't work", the district gets a list of the exact permission boxes that
 * are and aren't ticked, in Aeries' own wording.
 *
 * The decrypted certificate exists only inside this request. It is fetched,
 * used for the probes, and dropped; the response carries diagnostics only, and
 * what is persisted is narrower still (`toStoredTestResult` drops the counts).
 *
 * Rate-limited harder than the credential write: each call fans out to four
 * requests against the district's SIS, and hammering a school district's
 * production server from our side is not acceptable behaviour.
 */
export const POST = withRoute(
  { rateLimit: { requests: 6, windowSeconds: 60, name: 'tech-sis-aeries-test' } },
  async ({ userId }) => {
    const caller = await resolveDistrictSisCaller(userId);
    if (!caller.ok) {
      log.warn('Non-district-tech tried to test an Aeries connection', {
        userId,
        denied: caller.denied,
      });
      return NextResponse.json(
        { error: 'Forbidden: district tech admin access required' },
        { status: 403 },
      );
    }

    const connections = await listConnections(caller.districtId);
    const connection = connections.find((c) => c.sis_type === 'aeries');
    if (!connection) {
      return NextResponse.json({ error: 'No Aeries connection to test.' }, { status: 404 });
    }

    // Decryption throws when the ciphertext can't be opened — most plausibly
    // after an encryption-key rotation. That reads to the district exactly like
    // "no credential stored", and the fix is the same, so say so rather than
    // returning a 500 they can do nothing with.
    let credential: Awaited<ReturnType<typeof getDecryptedCredential>> = null;
    try {
      credential = await getDecryptedCredential(connection.id);
    } catch (err) {
      log.error('Could not decrypt the stored Aeries credential', err, {
        connectionId: connection.id,
      });
    }
    if (!credential || credential.sisType !== 'aeries') {
      // Not an error state: a connection can legitimately exist with no
      // credential yet. Say what to do rather than reporting a failure.
      return NextResponse.json(
        { error: 'Enter your Aeries certificate first, then run the test.' },
        { status: 409 },
      );
    }
    if (!connection.base_url) {
      return NextResponse.json(
        { error: 'This connection has no Aeries web address saved. Re-enter it and save again.' },
        { status: 409 },
      );
    }

    const report = await runAeriesConnectionTest({
      baseUrl: connection.base_url,
      certificate: credential.certificate,
    });

    try {
      await recordTestResult({
        connectionId: connection.id,
        actorId: userId,
        ok: report.ok,
        result: toStoredTestResult(report),
      });
    } catch (err) {
      // Every probe already ran. Turning a bookkeeping failure into a 500 would
      // hide a completed report AND invite the district to run it again, sending
      // four more requests at their SIS to learn what we already know.
      log.error('Failed to record Aeries test result', err, {
        connectionId: connection.id,
      });
    }

    log.info('Aeries connection tested', {
      districtId: caller.districtId,
      connectionId: connection.id,
      ok: report.ok,
    });

    // The full per-area report goes back to the caller for this one response —
    // it is the whole point of the feature — while the stored copy stays
    // narrow. Nothing here carries a record or the certificate; that is pinned
    // by tests in __tests__/unit/lib/sis/aeries-setup.test.ts.
    return NextResponse.json({ report });
  },
);
