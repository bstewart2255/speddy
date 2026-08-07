import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/with-route';
import { speddyAdminDenialReason } from '@/lib/api/speddy-admin-denial-reason';
import { logger } from '@/lib/logger';
import { getConnection, getDecryptedCredential, recordTestResult } from '@/lib/sis/connections';
import { runAeriesConnectionTest, toStoredTestResult } from '@/lib/sis/aeries-setup';
import {
  runOneRosterConnectionTest,
  toStoredOneRosterTestResult,
} from '@/lib/sis/oneroster-setup';
import type { SisTestResult } from '@/lib/sis/connections';

const log = logger.child({ module: 'internal-sis-test' });

/** One probed area or step, flattened across the two connectors (SPE-427). */
interface StaffCheck {
  key: string;
  label: string;
  status: 'ok' | 'denied' | 'error' | 'untested';
  message: string;
  count?: number;
}

/**
 * POST /api/internal/sis-connections/[connectionId]/test — run a district's
 * connection test from the Speddy side (SPE-427).
 *
 * WHY THIS EXISTS. Until now only the district's own `district_tech` could run
 * the test, so every check cost a round-trip to a person at the district.
 * SPE-426 is that cost measured: a tech admin ran the test nine times in six
 * minutes against a bug he could not have fixed, and after shipping the fix we
 * still had no way to confirm it worked without asking him to click again.
 *
 * IT RUNS THE DISTRICT'S OWN TEST, deliberately — the same
 * `runAeriesConnectionTest` / `runOneRosterConnectionTest` behind their button.
 * A separate staff-side implementation could disagree with theirs, and then a
 * green check here would prove nothing about what they see.
 *
 * WHAT IT CAN REACH. This lets Speddy staff cause requests to a district's SIS
 * using that district's stored credential, which is worth naming rather than
 * burying. It is bounded by what the test already is: read-only probes,
 * aggregate-only (one non-identifying field, one row), so no student record is
 * ever read (SPE-393). The decrypted credential exists only inside this request
 * and is never returned.
 *
 * Rate-limited to match the district's own test route: each call fans out to
 * several requests against a school district's production server.
 */
export const POST = withRoute<{ connectionId: string }>(
  { rateLimit: { requests: 6, windowSeconds: 60, name: 'internal-sis-test' } },
  async ({ userId, params }) => {
    const denied = await speddyAdminDenialReason(userId);
    if (denied) {
      log.warn('Non-speddy-admin tried to run a SIS connection test', {
        userId,
        connectionId: params.connectionId,
        denied,
      });
      return NextResponse.json(
        { error: 'Forbidden: Speddy admin access required' },
        { status: 403 },
      );
    }

    // Wrapped rather than left to the route wrapper: withRoute's catch echoes
    // error.message to the client when NODE_ENV=development, and a Supabase
    // error names tables and constraints.
    let connection;
    try {
      connection = await getConnection(params.connectionId);
    } catch (err) {
      log.error('Failed to load the SIS connection', err, {
        connectionId: params.connectionId,
      });
      return NextResponse.json({ error: 'Could not load that connection.' }, { status: 500 });
    }
    if (!connection) {
      return NextResponse.json({ error: 'No such SIS connection.' }, { status: 404 });
    }

    // Decryption throws when the ciphertext cannot be opened — most plausibly
    // after an encryption-key rotation. To an operator that reads the same as
    // "no credential stored" and has the same fix, so say so rather than
    // returning a 500 they can do nothing with.
    let credential: Awaited<ReturnType<typeof getDecryptedCredential>> = null;
    try {
      credential = await getDecryptedCredential(connection.id);
    } catch (err) {
      log.error('Could not decrypt the stored SIS credential', err, {
        connectionId: connection.id,
      });
    }
    if (!credential) {
      // Not an error state: a connection legitimately exists with no credential
      // until the district enters one.
      return NextResponse.json(
        { error: 'This district has not entered credentials yet, so there is nothing to test.' },
        { status: 409 },
      );
    }
    if (!connection.base_url) {
      return NextResponse.json(
        { error: 'This connection has no address saved, so there is nothing to test.' },
        { status: 409 },
      );
    }

    // The two reports are the same shape under different names — Aeries calls
    // them `areas`, OneRoster calls them `steps`. Flattened to one list here so
    // the panel has a single renderer; the district-facing shapes are untouched.
    let ok: boolean;
    let summary: string;
    let checks: StaffCheck[];
    let stored: SisTestResult;
    let usedAddress: string | undefined;

    if (credential.sisType === 'aeries') {
      const report = await runAeriesConnectionTest({
        baseUrl: connection.base_url,
        certificate: credential.certificate,
      });
      ({ ok, summary } = report);
      checks = report.areas;
      stored = toStoredTestResult(report);
      usedAddress = report.usedBaseUrl;
    } else {
      const report = await runOneRosterConnectionTest({
        baseUrl: connection.base_url,
        tokenUrl: connection.token_url ?? undefined,
        clientId: credential.clientId,
        clientSecret: credential.clientSecret,
      });
      ({ ok, summary } = report);
      checks = report.steps;
      stored = toStoredOneRosterTestResult(report);
      usedAddress = report.usedTokenUrl;
    }

    try {
      await recordTestResult({
        connectionId: connection.id,
        actorId: userId,
        ok,
        result: stored,
      });
    } catch (err) {
      // Every probe already ran. Turning a bookkeeping failure into a 500 would
      // hide a completed report AND invite another run, sending more requests at
      // a district's SIS to learn what we already know.
      log.error('Failed to record the SIS test result', err, {
        connectionId: connection.id,
      });
    }

    log.info('SIS connection tested by Speddy staff', {
      connectionId: connection.id,
      districtId: connection.district_id,
      sisType: credential.sisType,
      actorId: userId,
      ok,
      // Which address answered, when resolution had to move off the stored one.
      // The reason we can now see this without asking the district (SPE-426).
      usedAddress,
    });

    return NextResponse.json({
      sisType: credential.sisType,
      ok,
      summary,
      checks,
      usedAddress,
    });
  },
);
