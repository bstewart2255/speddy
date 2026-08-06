/**
 * SPE-395 — drive `lib/sis/connections.ts` against the REAL database.
 *
 * Its sibling `verify-sis-connections-rls.ts` proves a browser cannot read a
 * credential. This proves the other half: that the server-side path the app
 * actually uses works, and that every rule the migration claims to enforce is
 * enforced by the database rather than only by the module.
 *
 * Why this cannot be a jest test. The unit suite mocks the Supabase client, so
 * a mocked write "succeeds" whether or not Postgres would have taken it. Every
 * assertion below is one a mock would have gotten wrong:
 *
 *   - the ciphertext_shape CHECK is a regex written by hand against a sample.
 *     If it disagrees with what encryptSisCredential() actually emits — one
 *     stray padding character — every credential write in production fails.
 *     Nothing but a real INSERT can tell us.
 *   - same for hint_shape and the multi-byte '••••' mask.
 *   - the DPA gate exists twice, in the module and in a CHECK. The module's
 *     copy is tested by jest; only this can show the database's copy is real,
 *     which is what makes the gate survive a future route that forgets it.
 *   - `created_by` -> profiles, `district_id` -> districts: FK shape and width
 *     (the varchar(20)/varchar(36) bug) only show up against real rows.
 *
 * Traps deliberately avoided (CLAUDE.md):
 *   - every negative check asserts WHY it was refused — the constraint name or
 *     the specific message — so a write rejected for some incidental reason
 *     cannot keep a check green after the guard it tests is gone;
 *   - every negative check runs against a FRESH fixture in the state that makes
 *     the guard meaningful, never one already in the target state;
 *   - persistence is asserted by reading the row back, never by a status code.
 *
 * Writes only to the sim district, and removes everything it wrote.
 * Requires a seeded sim district and SIS_CREDENTIAL_ENCRYPTION_KEY.
 * Usage: npm run sim:verify-sis-lifecycle
 */
import { createAdmin, requireEnv } from './lib';
import { DISTRICT, personaEmail } from './manifest';
import { credentialHint } from '../../lib/sis/credential-crypto';
import {
  disconnect,
  getConnection,
  getDecryptedCredential,
  listConnections,
  recordTestResult,
  setDpaCleared,
  storeCredential,
  createConnection,
} from '../../lib/sis/connections';

// Fail fast and loudly: without the key, storeCredential refuses by design and
// every credential check below would "pass" by never running.
requireEnv('SIS_CREDENTIAL_ENCRYPTION_KEY');

const admin = createAdmin();

// Realistic shapes. An Aeries certificate is 32 hex characters sent as the
// AERIES-CERT header value (lib/integrations/aeries/config.ts) — NOT a PEM. It
// matters here: a PEM ends '-----END CERTIFICATE-----', so every PEM masks to
// the same '••••----' and any assertion comparing hints would pass whether or
// not the value changed. The OneRoster secret carries punctuation.
const AERIES_CERT = 'sim395fakecert0000000000000da9f2';
const AERIES_CERT_ROTATED = 'sim395fakecert0000000000000db7c1';
const OR_CLIENT_ID = 'sim-oneroster-client-id-0001';
const OR_CLIENT_SECRET = 'sim~oneroster~secret!value.7f3e';

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(52)}${detail}`);
}

/** Read a row with the service role, including the columns clients cannot see. */
async function readRaw(id: string) {
  const { data, error } = await admin
    .from('district_sis_connections')
    .select(
      'id, sis_type, status, dpa_cleared_at, credential_hint, last_tested_at, last_test_result, ' +
        'aeries_certificate_encrypted, oneroster_client_id_encrypted, oneroster_client_secret_encrypted'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`readRaw failed: ${error.message}`);
  return data as Record<string, any> | null;
}

/** Run a thunk and return the error message, or null if it unexpectedly passed. */
async function refusedWith(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function main(): Promise<void> {
  console.log(`\nSPE-395 · SIS connection lifecycle against the real database`);
  console.log(`district: ${DISTRICT.id} (${DISTRICT.name})\n`);

  // A real profile id — created_by is a live FK to profiles.
  const { data: actor, error: actorError } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', personaEmail('theo'))
    .single();
  if (actorError || !actor) {
    console.error(`Could not resolve the sim district tech admin: ${actorError?.message}`);
    console.error('Run `npm run sim:reset -- --yes` first.');
    process.exit(1);
  }
  const actorId = (actor as { id: string }).id;

  const created: string[] = [];

  try {
    // Guard against a stale fixture silently satisfying later assertions.
    const preexisting = await listConnections(DISTRICT.id);
    check(preexisting.length === 0, 'fixture starts with no SIS connection',
      `${preexisting.length} row(s)`);

    console.log('\ncreate — a connection shell, before any DPA:');
    const shell = await createConnection({
      districtId: DISTRICT.id,
      sisType: 'aeries',
      actorId,
      baseUrl: 'https://sim.aeries.example.test',
    });
    created.push(shell.id);
    check(shell.status === 'pending_dpa', 'new connection enters pending_dpa', shell.status);
    check(shell.dpa_cleared_at === null, 'new connection has no DPA', String(shell.dpa_cleared_at));
    check(shell.credential_hint === null, 'new connection has no credential', String(shell.credential_hint));
    check(shell.district_id === DISTRICT.id, 'district_id round-trips', shell.district_id);

    // The sim district's id is short, so the round-trip above says nothing
    // about the varchar(20) -> varchar(36) fix. Districts created through
    // /api/internal/create-district get a 36-char UUID, and a narrow column
    // would reject them with value-too-long. Assert the declared width itself.
    // A 36-char id that is deliberately not a real district: if the column were
    // still varchar(20) this fails on length (22001) BEFORE the FK is consulted,
    // so "rejected by the FK" is precisely the evidence that the width is right.
    const probeId = '01234567-89ab-cdef-0123-456789abcdef';
    const { error: wideError } = await admin
      .from('district_sis_connections')
      .insert({ district_id: probeId, sis_type: 'aeries' });
    check(
      !!wideError && /foreign key|violates foreign key constraint/i.test(wideError.message),
      'district_id column accepts a 36-char id (fails on the FK, not on width)',
      wideError?.message?.slice(0, 90) ?? 'UNEXPECTEDLY INSERTED'
    );

    console.log('\nthe DPA gate — asserted on a fixture that has no DPA yet:');
    const moduleRefusal = await refusedWith(() =>
      storeCredential({ connectionId: shell.id, actorId, certificate: AERIES_CERT })
    );
    check(
      moduleRefusal !== null && /no recorded DPA/i.test(moduleRefusal),
      'module refuses a credential before the DPA',
      moduleRefusal ?? 'NOT REFUSED'
    );
    // And independently of the module: the database refuses it too. This is
    // what makes the gate survive a future writer that skips this module.
    const { error: dbGate } = await admin
      .from('district_sis_connections')
      .update({ aeries_certificate_encrypted: 'v1.aaaa.bbbb.cccc' })
      .eq('id', shell.id);
    check(
      !!dbGate && /no_credentials_before_dpa/.test(dbGate.message),
      'database refuses it too, by CHECK constraint',
      dbGate?.message?.slice(0, 90) ?? 'NOT REFUSED'
    );
    const stillEmpty = await readRaw(shell.id);
    check(stillEmpty?.aeries_certificate_encrypted === null,
      'no credential landed despite two attempts', String(stillEmpty?.aeries_certificate_encrypted));

    console.log('\nrecord the DPA:');
    await setDpaCleared({ connectionId: shell.id, actorId, cleared: true });
    const cleared = await readRaw(shell.id);
    check(!!cleared?.dpa_cleared_at, 'dpa_cleared_at persisted', String(cleared?.dpa_cleared_at));
    check(cleared?.status === 'awaiting_credentials',
      'pending_dpa lifts to awaiting_credentials', String(cleared?.status));

    console.log('\nstore a credential — the shapes the CHECK constraints police:');
    const stored = await storeCredential({
      connectionId: shell.id,
      actorId,
      certificate: AERIES_CERT,
    });
    const storedRaw = await readRaw(shell.id);
    // The headline assertion: real ciphertext from real code satisfied the
    // hand-written ciphertext_shape regex.
    check(
      typeof storedRaw?.aeries_certificate_encrypted === 'string' &&
        storedRaw.aeries_certificate_encrypted.startsWith('v1.'),
      'ciphertext_shape accepts real encryptSisCredential output',
      String(storedRaw?.aeries_certificate_encrypted).slice(0, 24) + '…'
    );
    check(
      !String(storedRaw?.aeries_certificate_encrypted).includes(AERIES_CERT),
      'stored value is not the plaintext certificate'
    );
    check(storedRaw?.credential_hint === credentialHint(AERIES_CERT),
      'hint_shape accepts the real mask', String(storedRaw?.credential_hint));
    // Derived, not copied from a fixture: a hardcoded expectation here would
    // assert my arithmetic rather than the code's.
    const hint = String(storedRaw?.credential_hint);
    check(
      hint.length === 8 && hint.startsWith('••••') && hint.slice(4) === AERIES_CERT.trim().slice(-4),
      'hint is the mask plus exactly 4 characters',
      hint
    );
    check(stored.status === 'testing', 'status moves to testing', stored.status);
    check(storedRaw?.last_tested_at === null, 'no test result is implied by storing');

    console.log('\ndecrypt — the round trip the connection test depends on:');
    const decrypted = await getDecryptedCredential(shell.id);
    check(
      decrypted?.sisType === 'aeries' && decrypted.certificate === AERIES_CERT,
      'certificate decrypts to the exact original',
      decrypted?.sisType === 'aeries' ? `${decrypted.certificate.length} chars` : 'MISMATCH'
    );

    console.log('\nrecord a test, then rotate:');
    await recordTestResult({ connectionId: shell.id, actorId, ok: true, result: { status: 200, area: 'students', message: 'ok' } });
    const tested = await readRaw(shell.id);
    check(tested?.status === 'connected', 'a passing test marks it connected', String(tested?.status));
    check(!!tested?.last_tested_at, 'last_tested_at persisted', String(tested?.last_tested_at));

    const beforeRotation = String(storedRaw?.aeries_certificate_encrypted);
    await storeCredential({ connectionId: shell.id, actorId, certificate: AERIES_CERT_ROTATED });
    const rotated = await readRaw(shell.id);
    // The hint check below is real now that the fixtures are hex certs ending
    // in different characters, but it is still the weaker assertion: the
    // substantive one is that the stored secret itself changed.
    check(
      String(rotated?.aeries_certificate_encrypted) !== beforeRotation,
      'rotation replaced the stored ciphertext'
    );
    const rotatedPlain = await getDecryptedCredential(shell.id);
    check(
      rotatedPlain?.sisType === 'aeries' && rotatedPlain.certificate === AERIES_CERT_ROTATED,
      'the rotated certificate is what decrypts now'
    );
    check(rotated?.credential_hint === credentialHint(AERIES_CERT_ROTATED),
      'hint matches the rotated credential', String(rotated?.credential_hint));
    check(rotated?.last_tested_at === null,
      'rotation clears the stale test result', String(rotated?.last_tested_at));
    check(rotated?.status === 'testing',
      'a rotated credential is no longer claimed connected', String(rotated?.status));

    console.log('\ncredential_shape — an Aeries row cannot hold OneRoster fields:');
    const { error: crossType } = await admin
      .from('district_sis_connections')
      .update({ oneroster_client_id_encrypted: 'v1.aaaa.bbbb.cccc' })
      .eq('id', shell.id);
    check(
      !!crossType && /credential_shape/.test(crossType.message),
      'database rejects a OneRoster secret on an Aeries row',
      crossType?.message?.slice(0, 90) ?? 'NOT REFUSED'
    );

    console.log('\nhint_shape — a full secret cannot be written to the one public column:');
    const { error: fatHint } = await admin
      .from('district_sis_connections')
      .update({ credential_hint: OR_CLIENT_SECRET })
      .eq('id', shell.id);
    check(
      !!fatHint && /hint_shape/.test(fatHint.message),
      'database rejects an unmasked hint',
      fatHint?.message?.slice(0, 90) ?? 'NOT REFUSED'
    );

    console.log('\nOneRoster — the paired-credential path:');
    const orShell = await createConnection({
      districtId: DISTRICT.id,
      sisType: 'oneroster',
      actorId,
      baseUrl: 'https://sim.oneroster.example.test/ims/oneroster/v1p1',
      tokenUrl: 'https://sim.oneroster.example.test/token',
    });
    created.push(orShell.id);
    await setDpaCleared({ connectionId: orShell.id, actorId, cleared: true });

    // All-or-nothing, asserted on a row that currently has NEITHER half — the
    // state where the constraint is actually load-bearing.
    const { error: halfPair } = await admin
      .from('district_sis_connections')
      .update({ oneroster_client_id_encrypted: 'v1.aaaa.bbbb.cccc' })
      .eq('id', orShell.id);
    check(
      !!halfPair && /credential_shape/.test(halfPair.message),
      'database rejects a client id with no secret',
      halfPair?.message?.slice(0, 90) ?? 'NOT REFUSED'
    );

    const orModuleRefusal = await refusedWith(() =>
      storeCredential({ connectionId: orShell.id, actorId, clientId: OR_CLIENT_ID })
    );
    check(
      orModuleRefusal !== null && /client id and a client secret/i.test(orModuleRefusal),
      'module refuses a half pair too',
      orModuleRefusal ?? 'NOT REFUSED'
    );

    await storeCredential({
      connectionId: orShell.id,
      actorId,
      clientId: OR_CLIENT_ID,
      clientSecret: OR_CLIENT_SECRET,
    });
    const orDecrypted = await getDecryptedCredential(orShell.id);
    check(
      orDecrypted?.sisType === 'oneroster' &&
        orDecrypted.clientId === OR_CLIENT_ID &&
        orDecrypted.clientSecret === OR_CLIENT_SECRET,
      'both halves decrypt to their originals'
    );
    const orRaw = await readRaw(orShell.id);
    check(orRaw?.credential_hint === credentialHint(OR_CLIENT_SECRET),
      'hint comes from the secret, not the id', String(orRaw?.credential_hint));

    console.log('\nrevoke the DPA — the credentials must go with it:');
    await setDpaCleared({ connectionId: orShell.id, actorId, cleared: false });
    const revoked = await readRaw(orShell.id);
    check(revoked?.dpa_cleared_at === null, 'dpa_cleared_at cleared', String(revoked?.dpa_cleared_at));
    check(
      revoked?.oneroster_client_id_encrypted === null &&
        revoked?.oneroster_client_secret_encrypted === null &&
        revoked?.credential_hint === null,
      'no credential survives a revoked DPA'
    );
    check(revoked?.status === 'pending_dpa', 'status returns to pending_dpa', String(revoked?.status));
    const afterRevoke = await getDecryptedCredential(orShell.id);
    check(afterRevoke === null, 'nothing left to decrypt', String(afterRevoke));

    console.log('\ndisconnect — credentials go, the record stays:');
    await disconnect({ connectionId: shell.id, actorId });
    const disconnected = await readRaw(shell.id);
    check(disconnected?.aeries_certificate_encrypted === null, 'certificate cleared');
    check(disconnected?.credential_hint === null, 'hint cleared');
    check(disconnected?.status === 'disabled', 'status is disabled', String(disconnected?.status));
    check(!!disconnected?.dpa_cleared_at, 'the DPA record survives the disconnect',
      String(disconnected?.dpa_cleared_at));

    console.log('\nthe audit trail — written, and free of secrets:');
    const { data: events, error: auditError } = await admin
      .from('audit_logs')
      .select('action, resource_id, metadata')
      .eq('resource_type', 'district_sis_connection')
      .in('resource_id', created);
    check(!auditError, 'audit rows readable', auditError?.message ?? '');
    const actions = new Set((events ?? []).map((e: any) => e.action));
    for (const expected of [
      'sis_connection_created',
      'sis_dpa_cleared',
      'sis_dpa_revoked',
      'sis_credential_stored',
      'sis_credential_rotated',
      'sis_connection_tested',
      'sis_connection_disconnected',
    ]) {
      check(actions.has(expected), `audited: ${expected}`);
    }
    const auditBlob = JSON.stringify(events ?? []);
    check(
      !auditBlob.includes(AERIES_CERT) && !auditBlob.includes(AERIES_CERT_ROTATED),
      'no certificate in the audit trail'
    );
    check(!auditBlob.includes(OR_CLIENT_SECRET), 'no client secret in the audit trail');
  } finally {
    console.log('\ncleanup:');
    for (const id of created) {
      const { error } = await admin.from('district_sis_connections').delete().eq('id', id);
      check(!error, `cleanup: connection ${id.slice(0, 8)} removed`, error?.message ?? 'deleted');
    }
    if (created.length > 0) {
      const { error: auditCleanup } = await admin
        .from('audit_logs')
        .delete()
        .eq('resource_type', 'district_sis_connection')
        .in('resource_id', created);
      check(!auditCleanup, 'cleanup: audit rows removed', auditCleanup?.message ?? 'deleted');
    }
    const { count } = await admin
      .from('district_sis_connections')
      .select('id', { count: 'exact', head: true })
      .eq('district_id', DISTRICT.id);
    check(count === 0, 'no SIS connection residue left in the fixture', `${count} row(s)`);
  }

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
