/**
 * SPE-372 — `upsert_students_atomic` (the import RPC hardened in PR #742), run
 * with REAL signed-in sessions.
 *
 * Why a script and not a jest test: our unit tests mock the Supabase client, so
 * they cannot see grants or RLS at all — they pass identically whether this RPC
 * enforces its provider check or enforces nothing. PR #742 shipped verified only
 * by reading the function definition, which is the same "confirmation" SPE-332
 * showed to be worthless.
 *
 * The contract asserted:
 *   - an authorized provider's insert PERSISTS — the student row, its details
 *     row, and one unscheduled session per sessions_per_week are all read back
 *     afterwards, not inferred from a 2xx;
 *   - a caller passing SOMEONE ELSE'S provider_id is refused, and refused for
 *     the right reason (SQLSTATE 42501 / 'Unauthorized'), not incidentally;
 *   - the refused call writes NOTHING — asserted by counting the victim's rows
 *     before and after, because "it errored" and "it changed nothing" are
 *     different claims;
 *   - an update to a student the caller does not own is refused too.
 *
 * The three traps from CLAUDE.md, and how this avoids them:
 *   - assert the write PERSISTED, not the status: every positive check re-reads
 *     the row through the same session;
 *   - assert WHY a refusal happened: the negative checks match the SQLSTATE and
 *     message, so a value rejected incidentally (a type coercion, an FK) cannot
 *     keep them green after the guard is gone;
 *   - negative checks use a FRESH target: the impersonation check names Tomás,
 *     who never becomes the caller, so it can never pass because the actor
 *     already had the right.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). It creates its
 * own probe student and removes it, but re-seed afterwards for a pristine
 * fixture.
 *
 * Usage: npm run sim:verify-import-rpc
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { derivePassword, personaEmail } from './manifest';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');

const admin = createAdmin();

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(62)} ${detail}`);
}

async function signIn(personaKey: string): Promise<SupabaseClient> {
  const email = personaEmail(personaKey);
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: derivePassword(secret, email),
  });
  if (error) {
    throw new Error(`sim login failed for ${email} — is the district seeded? (${error.message})`);
  }
  return client;
}

async function profileId(personaKey: string): Promise<string> {
  const { data, error } = await admin
    .from('profiles').select('id').eq('email', personaEmail(personaKey)).single();
  if (error) throw new Error(`profile lookup failed for ${personaKey}: ${error.message}`);
  return data.id as string;
}

const PROBE_INITIALS = 'ZZ';       // the authorized insert
const IMPERSONATION_INITIALS = 'YY'; // only ever lands if the guard is missing
/**
 * The probe-only identity marker, written into student_details by both inserts.
 *
 * Initials are NOT a safe identity predicate: seed.ts derives them from a SHA-1
 * of (provider, school, index) reduced to two A–Z letters, so 'ZZ' and 'YY' are
 * both reachable — a reseed with different student counts could hand one to a
 * real fixture student, whom this cleanup would then delete. These names are
 * written by nothing but this script.
 */
const PROBE_FIRST_NAME = 'SimProbe';
const PROBE_LAST_NAME = 'DoNotKeep';

/**
 * Remove this probe's rows — and ONLY this probe's rows.
 *
 * Three predicates, all required: the provider must be one of the two sim
 * personas, the initials must be one of the probe's, AND student_details must
 * carry the probe marker above. This runs against the production database, so
 * the cost of matching one row too many is a real deletion; the cost of
 * matching one too few is a leftover row that `sim:verify` will report.
 *
 * Also clears the `children` row the students_child_link insert trigger
 * creates: leaving it behind makes the next `sim:verify` fail on an exact
 * children count, which reads as fixture drift rather than probe litter.
 */
async function cleanup(providerIds: string[]): Promise<void> {
  if (providerIds.length === 0) return;
  const { data: marked, error: mErr } = await admin
    .from('student_details')
    .select('student_id')
    .eq('first_name', PROBE_FIRST_NAME)
    .eq('last_name', PROBE_LAST_NAME);
  if (mErr) throw new Error(`probe marker lookup failed: ${mErr.message}`);
  const markedIds = (marked ?? []).map(m => m.student_id as string);
  if (markedIds.length === 0) return;

  const { data: probes, error } = await admin
    .from('students')
    .select('id, child_id')
    .in('id', markedIds)
    .in('provider_id', providerIds)
    .in('initials', [PROBE_INITIALS, IMPERSONATION_INITIALS]);
  if (error) throw new Error(`probe cleanup lookup failed: ${error.message}`);

  for (const p of probes ?? []) {
    await admin.from('schedule_sessions').delete().eq('student_id', p.id);
    await admin.from('student_details').delete().eq('student_id', p.id);
    const { error: delErr } = await admin.from('students').delete().eq('id', p.id);
    if (delErr) throw new Error(`probe student delete failed: ${delErr.message}`);

    if (p.child_id) {
      // Only if nothing else points at it — a shared child must survive.
      const { count } = await admin
        .from('students').select('id', { count: 'exact', head: true }).eq('child_id', p.child_id);
      if ((count ?? 0) === 0) {
        const { error: childErr } = await admin.from('children').delete().eq('id', p.child_id);
        if (childErr) throw new Error(`probe child delete failed: ${childErr.message}`);
      }
    }
  }
}

async function main(): Promise<void> {
  console.log('\nSPE-372 — import RPC (upsert_students_atomic) with real sessions\n');

  const rachelId = await profileId('rachel');
  const tomasId = await profileId('tomas');
  const probeProviders = [rachelId, tomasId];
  await cleanup(probeProviders); // an aborted run must not make today's checks lie

  const rachel = await signIn('rachel');

  // School fields are copied from a real seeded row rather than hardcoded: the
  // students table has NOT NULL and check constraints on them, and a probe that
  // guesses wrong fails for its own reasons instead of testing the RPC.
  const { data: sibling } = await admin
    .from('students')
    .select('school_site, school_id, district_id, state_id')
    .eq('provider_id', rachelId).limit(1).maybeSingle();
  if (!sibling) throw new Error('no seeded student for Rachel — re-seed the district');

  const newStudent = {
    action: 'insert',
    initials: PROBE_INITIALS, // short: students.check_initials_length is strict
    gradeLevel: '3',
    schoolSite: sibling.school_site,
    schoolId: sibling.school_id,
    districtId: sibling.district_id,
    stateId: sibling.state_id,
    sessionsPerWeek: 2,
    minutesPerSession: 30,
    firstName: PROBE_FIRST_NAME,
    lastName: PROBE_LAST_NAME,
    goals: ['probe goal'],
  };

  // --- 1. the authorized insert PERSISTS -------------------------------------
  const { data: okResult, error: okErr } = await rachel.rpc('upsert_students_atomic', {
    p_provider_id: rachelId,
    p_students: [newStudent],
  });
  check(!okErr, 'authorized provider can call the import RPC', okErr ? okErr.message : 'no error');
  check(
    !!okResult && okResult.inserted === 1 && okResult.errors === 0,
    'RPC reports exactly one insert and no per-row errors',
    okResult
      ? `inserted=${okResult.inserted} errors=${okResult.errors}` +
        (okResult.errors ? ` — ${okResult.results?.[0]?.error ?? ''}`.slice(0, 90) : '')
      : 'no payload'
  );

  // Read it back rather than trusting the return value — the whole point. And
  // read it through RACHEL'S OWN SESSION, not the service role: `admin`
  // bypasses RLS, so an admin readback proves the row is in the table while
  // saying nothing about whether the provider who imported it can see it. That
  // gap is exactly SPE-332 — a policy that crashed for seven months behind
  // green checks. The claim worth asserting is "the importer can read what she
  // imported".
  const { data: persisted, error: readErr } = await rachel
    .from('students').select('id, provider_id, initials, sessions_per_week')
    .eq('provider_id', rachelId).eq('initials', PROBE_INITIALS);
  check(!readErr && (persisted ?? []).length === 1,
    'the importing provider can read the row back (RLS included)',
    readErr ? readErr.message : `${(persisted ?? []).length} row(s)`);

  // Diagnostic only: if Rachel sees nothing, say whether the row is missing or
  // merely invisible to her. Those need different fixes.
  if (!readErr && (persisted ?? []).length === 0) {
    const { count: adminCount } = await admin
      .from('students').select('id', { count: 'exact', head: true })
      .eq('provider_id', rachelId).eq('initials', PROBE_INITIALS);
    console.log(
      `       ↳ service role sees ${adminCount ?? 0} row(s): ` +
        `${(adminCount ?? 0) > 0 ? 'the row EXISTS but RLS hides it from its own provider' : 'the row was never written'}`
    );
  }

  const probeId = persisted?.[0]?.id as string | undefined;
  check(persisted?.[0]?.provider_id === rachelId, 'the row is owned by the calling provider',
    `provider_id ${persisted?.[0]?.provider_id === rachelId ? 'matches' : 'MISMATCH'}`);

  if (probeId) {
    const { data: det, error: detErr } = await rachel
      .from('student_details').select('student_id, first_name').eq('student_id', probeId);
    check(!detErr && (det ?? []).length === 1,
      'the details row was written in the same transaction',
      detErr ? detErr.message : `${(det ?? []).length} row(s)`);

    const { count: sessionCount, error: sessErr } = await rachel
      .from('schedule_sessions').select('id', { count: 'exact', head: true }).eq('student_id', probeId);
    check(!sessErr && sessionCount === 2,
      'one unscheduled session per sessions_per_week was created',
      sessErr ? sessErr.message : `${sessionCount} session(s), expected 2`);
  } else {
    // Do not let a missing row silently skip two checks and still report
    // "All checks passed" — that is the failure mode this whole PR exists to
    // stop. Count them as failures explicitly.
    check(false, 'the details row was written in the same transaction', 'SKIPPED — no probe row');
    check(false, 'one unscheduled session per sessions_per_week was created', 'SKIPPED — no probe row');
  }

  // --- 2. impersonating another provider is refused, for the right reason -----
  // Tomás is the victim and never the caller, so this cannot pass because the
  // actor already had the right.
  const { count: tomasBefore } = await admin
    .from('students').select('id', { count: 'exact', head: true }).eq('provider_id', tomasId);

  const { error: impErr } = await rachel.rpc('upsert_students_atomic', {
    p_provider_id: tomasId,
    p_students: [{ ...newStudent, initials: IMPERSONATION_INITIALS }],
  });
  check(!!impErr, 'passing another provider_id is REFUSED', impErr ? 'refused' : 'ACCEPTED — LEAK');
  // BOTH signals, not either. The RPC's guard raises 42501 *with* the message
  // "Unauthorized" — observed, not assumed — so requiring both pins the actual
  // contract. `||` would accept any 42501 the database happens to raise, and a
  // plain permission error on some unrelated table would keep this green after
  // the provider-ID guard was gone. (The scheduling probe's equivalent check
  // matches both signals the same way now that SPE-511 has landed; it used a
  // looser `||` only while that gate was still missing.)
  check(
    impErr?.code === '42501' && /unauthorized/i.test(impErr?.message ?? ''),
    'refused with the RPC\'s own guard (42501 AND Unauthorized)',
    impErr ? `code=${impErr.code} msg=${impErr.message.slice(0, 48)}` : 'n/a'
  );

  // "It errored" and "it wrote nothing" are different claims.
  const { count: tomasAfter } = await admin
    .from('students').select('id', { count: 'exact', head: true }).eq('provider_id', tomasId);
  check(tomasBefore === tomasAfter, 'the refused call wrote nothing to the victim',
    `${tomasBefore} -> ${tomasAfter}`);

  // --- 3. updating a student you do not own is refused ------------------------
  // Throw rather than skip when the target is missing. `if (tomasStudent)`
  // meant an empty fixture silently dropped three authorization assertions and
  // the script still printed "All checks passed" — a probe reporting success
  // for a path it never exercised.
  const { data: tomasStudent, error: tomasErr } = await admin
    .from('students').select('id, grade_level').eq('provider_id', tomasId).limit(1).maybeSingle();
  if (tomasErr) throw new Error(`ownership-test target lookup failed: ${tomasErr.message}`);
  if (!tomasStudent) {
    throw new Error(
      'no student found for Tomás — the cross-owner update check cannot run. ' +
        'Re-seed with: npm run sim:reset -- --yes'
    );
  }
  {
    const { data: updResult } = await rachel.rpc('upsert_students_atomic', {
      p_provider_id: rachelId,
      p_students: [{ action: 'update', studentId: tomasStudent.id, gradeLevel: '12' }],
    });
    // The RPC catches per-row failures rather than aborting, so the refusal
    // shows up as an error entry, not a thrown error.
    const rowError: string = updResult?.results?.[0]?.error ?? '';
    check(
      !!updResult && updResult.updated === 0 && updResult.errors === 1,
      'updating a student owned by someone else is refused per-row',
      updResult ? `updated=${updResult.updated} errors=${updResult.errors}` : 'no payload'
    );
    // Assert the REASON, not just that something failed: an unrelated per-row
    // exception would otherwise keep this green after the ownership guard is
    // gone — the exact trap CLAUDE.md names.
    check(
      /not found or not owned by provider/i.test(rowError),
      'refused by the ownership guard, not incidentally',
      rowError ? rowError.slice(0, 52) : 'no error text'
    );
    const { data: after } = await admin
      .from('students').select('grade_level').eq('id', tomasStudent.id).single();
    check(after?.grade_level === tomasStudent.grade_level,
      'the victim\'s grade_level is unchanged',
      `${tomasStudent.grade_level} -> ${after?.grade_level}`);
  }

  await cleanup(probeProviders);
  console.log(
    failures === 0
      ? '\nAll checks passed. Re-seed (npm run sim:reset -- --yes) to restore the fixture.\n'
      : `\n${failures} check(s) failed.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async err => {
  // Best-effort: resolve the ids again so the sweep stays provider-scoped even
  // when the failure happened before they were available.
  await Promise.all([profileId('rachel'), profileId('tomas')])
    .then(ids => cleanup(ids))
    .catch(() => {});
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
