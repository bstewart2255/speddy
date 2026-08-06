/**
 * SPE-395 — `district_sis_connections` must expose connection STATUS to the
 * district's own staff while never exposing a credential to any browser.
 *
 * Same reason this is a script and not a jest test as its siblings: our unit
 * tests mock the Supabase client, so they cannot see RLS or column grants at
 * all — they pass identically whether a credential is readable or not.
 *
 * WHY THIS TABLE IS DIFFERENT. Row-level security cannot hide a COLUMN. A
 * policy that lets a district_tech read their connection row would also hand
 * them the ciphertext, which is what `calendar_connections` does. A district's
 * Aeries certificate unlocks every student record in that district, so this
 * table additionally uses column-level grants: `authenticated` holds SELECT on
 * the non-secret columns only and cannot name a credential column.
 *
 * The contract asserted here:
 *   - the district's tech admin and district admin CAN read connection status;
 *   - neither can read any credential column — refused with 42501, asserted by
 *     CODE, not merely "the request failed";
 *   - `select('*')` fails too, since `*` expands to columns they may not read;
 *   - a site admin, and another district's staff, see nothing at all;
 *   - browser writes are refused even for the district's own tech admin;
 *   - the service role CAN round-trip a credential, so the app path works.
 *
 * Traps deliberately avoided (CLAUDE.md):
 *   - assert WHY a read was refused (42501), so a row simply not matching RLS
 *     cannot masquerade as a column-grant refusal;
 *   - assert status AND rows, so a dead session cannot pass a negative;
 *   - every write is undone on the way out, pass or fail, and the cleanup is
 *     itself asserted.
 *
 * Requires a seeded sim district and SIS_CREDENTIAL_ENCRYPTION_KEY.
 * Usage: npm run sim:verify-sis-rls
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { assertProjectRef, createAdmin, requireEnv } from './lib';
import { DISTRICT, derivePassword, personaEmail } from './manifest';
import {
  credentialHint,
  decryptSisCredential,
  encryptSisCredential,
} from '../../lib/sis/credential-crypto';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');
assertProjectRef();

const admin = createAdmin();
const CREDENTIAL_COLUMNS = [
  'aeries_certificate_encrypted',
  'oneroster_client_id_encrypted',
  'oneroster_client_secret_encrypted',
];
const SAFE_COLUMNS = 'id,district_id,sis_type,status,credential_hint,dpa_cleared_at';

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(60)} ${detail}`);
}

async function signIn(personaKey: string): Promise<{ client: SupabaseClient; token: string }> {
  const email = personaEmail(personaKey);
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({
    email, password: derivePassword(secret, email),
  });
  if (error) throw new Error(`sim login failed for ${email} — is the district seeded? (${error.message})`);
  const token = (await client.auth.getSession()).data.session!.access_token;
  return { client, token };
}

/** Raw PostgREST read, so the HTTP status and PostgREST error code are visible. */
async function read(token: string, select: string) {
  const res = await fetch(
    `${url}/rest/v1/district_sis_connections?select=${encodeURIComponent(select)}`,
    { headers: { apikey: anon, Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* error bodies are not always arrays */ }
  const code = parsed && !Array.isArray(parsed) ? (parsed as { code?: string }).code : undefined;
  return { status: res.status, code, rows: Array.isArray(parsed) ? parsed : [], body: text.slice(0, 140) };
}

async function main(): Promise<void> {
  const CERT = 'FAKE-AERIES-CERT-FOR-SIM-VERIFICATION-a9f2';
  let connectionId: string | null = null;

  try {
    // Service-role write: the path the real API routes use.
    const { data: created, error: createErr } = await admin
      .from('district_sis_connections')
      .insert({
        district_id: DISTRICT.id,
        sis_type: 'aeries',
        base_url: 'https://sim.aeries.test',
        status: 'connected',
        dpa_cleared_at: new Date().toISOString(),
        aeries_certificate_encrypted: encryptSisCredential(CERT),
        credential_hint: credentialHint(CERT),
      })
      .select('id')
      .single();
    check(!createErr, 'service role can create a connection (the app write path)',
      createErr ? createErr.message : 'created');
    if (createErr) throw new Error('cannot continue without a connection row');
    connectionId = created!.id;

    // Round-trip through the DB, proving what we stored is what we get back.
    const { data: stored } = await admin
      .from('district_sis_connections')
      .select('aeries_certificate_encrypted, credential_hint')
      .eq('id', connectionId).single();
    check(decryptSisCredential(stored!.aeries_certificate_encrypted!) === CERT,
      'credential round-trips through the database');
    check(!stored!.aeries_certificate_encrypted!.includes(CERT),
      'stored value is ciphertext, not the plaintext');
    // Derived, not hardcoded — a literal copied from another fixture passes or
    // fails on whether the two happened to share a suffix, which is exactly the
    // kind of check that looks green for the wrong reason.
    check(stored!.credential_hint === credentialHint(CERT),
      'hint stored masked', String(stored!.credential_hint));
    // Asserted by SHAPE, not by containment. The obvious
    // `!hint.includes(CERT.slice(0, -4))` cannot fail: the hint is 8 characters
    // and that prefix is 38, so an 8-character string can never contain it —
    // the check stayed green no matter what the hint held.
    const hint = String(stored!.credential_hint);
    check(
      hint.length === 8 && hint.startsWith('••••') && hint.slice(4) === CERT.slice(-4),
      'hint is the mask plus exactly the last 4, nothing more', hint);

    console.log('\ndistrict staff — status readable, credentials NOT:');
    for (const [persona, label] of [['theo', 'district_tech (Theo)'], ['dana', 'district_adm (Dana)']] as const) {
      const { client, token } = await signIn(persona);

      const safe = await read(token, SAFE_COLUMNS);
      check(safe.status === 200 && safe.rows.length === 1,
        `${label}: reads connection status`, `HTTP ${safe.status}, ${safe.rows.length} row(s)`);

      for (const col of CREDENTIAL_COLUMNS) {
        const r = await read(token, col);
        check(r.status === 403 && r.code === '42501',
          `${label}: refused ${col}`, `HTTP ${r.status} code=${r.code ?? 'none'}`);
      }

      const star = await read(token, '*');
      check(star.status === 403 && star.code === '42501',
        `${label}: select('*') refused (expands to denied columns)`,
        `HTTP ${star.status} code=${star.code ?? 'none'}`);

      // Browser writes denied outright — every mutation is server-side.
      // Assert WHY it was refused. `!wErr ? count === 0 : true` passed for ANY
      // error — a renamed column, a bad payload, a dropped connection — which
      // is exactly the trap this file's header says it avoids. An RLS-denied
      // UPDATE is either 0 rows affected (policy filtered it) or 42501 (the
      // column grant refused first); nothing else counts.
      const { error: wErr, count } = await client
        .from('district_sis_connections')
        .update({ status: 'disabled' }, { count: 'exact' })
        .eq('id', connectionId);
      check(wErr ? wErr.code === '42501' : count === 0,
        `${label}: cannot modify the connection from a browser`,
        wErr ? `err=${wErr.code}` : `${count} row(s) affected`);

      await client.auth.signOut();
    }

    console.log('\nnegative space — nobody else sees it at all:');
    const site = await signIn('priya');
    const siteRead = await read(site.token, SAFE_COLUMNS);
    check(siteRead.status === 200 && siteRead.rows.length === 0,
      'site admin sees no connection', `HTTP ${siteRead.status}, ${siteRead.rows.length} row(s)`);
    await site.client.auth.signOut();

    const provider = await signIn('rachel');
    const provRead = await read(provider.token, SAFE_COLUMNS);
    check(provRead.status === 200 && provRead.rows.length === 0,
      'a provider sees no connection', `HTTP ${provRead.status}, ${provRead.rows.length} row(s)`);
    await provider.client.auth.signOut();
  } finally {
    if (connectionId) {
      const { error } = await admin.from('district_sis_connections').delete().eq('id', connectionId);
      check(!error, 'cleanup: connection row removed', error?.message ?? 'deleted');
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
