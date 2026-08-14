/**
 * SPE-372 — `copy_schedule_to_year` (the scheduling RPC from PR #770), run with
 * REAL signed-in sessions.
 *
 * ⚠️ THIS SCRIPT CURRENTLY FAILS ONE CHECK, ON PURPOSE. See SPE-511.
 *
 * The authorization check below asserts the guard this RPC *should* have. It
 * does not have one: the function is SECURITY DEFINER, EXECUTE is granted to
 * `authenticated`, and its body never asks whether the caller has anything to
 * do with `p_school_id`. The only gate is client-side in
 * lib/supabase/queries/school-year-copy.ts, and it only checks that the caller
 * is signed in — which is not a gate at all, since anyone can call
 * `supabase.rpc(...)` directly with the session they already hold.
 *
 * That was found by running this script, not by reading the function, and it is
 * exactly why SPE-372 exists: unit tests mock the Supabase client, so they
 * cannot see grants or RLS and pass identically either way. The failing check
 * stays failing as standing evidence until SPE-511 lands; it is not flaky and
 * should not be "fixed" by softening the assertion.
 *
 * For whoever implements SPE-511: this check requires the refusal to be an
 * AUTHORIZATION error — SQLSTATE 42501, or a message matching "not authorized"
 * / "unauthorized" / "permission denied". That is the house convention already
 * used by upsert_students_atomic. It is deliberately narrow: accepting any
 * error would let an unrelated failure (year validation, an empty source year)
 * turn this check green while the hole is still open.
 *
 * The rest of the contract asserted:
 *   - an authorized copy PERSISTS — the copied rows are read back from the
 *     target year afterwards, not inferred from the returned counts;
 *   - the "target year already has data" guard fires, with its own message, so
 *     a second copy cannot silently duplicate a school's schedule.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). It copies into
 * a throwaway school year and deletes those rows again, but re-seed afterwards
 * for a pristine fixture.
 *
 * Usage: npm run sim:verify-scheduling-rpc
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { WILLOW, derivePassword, personaEmail } from './manifest';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');

const admin = createAdmin();

/** A year no fixture uses, so a copy into it can never collide with real data. */
const PROBE_YEAR = '2098-2099';
/**
 * The authorization probe's source and target. The source is asserted EMPTY
 * before the call (see main), so that if the RPC lets a non-admin through — as
 * it currently does — the copy moves nothing. That assertion is the difference
 * between a safety property and a hope: this probe must never become the thing
 * that writes a schedule it wasn't authorized to write.
 */
const SEA_SOURCE_YEAR = '1900-1901';
const SEA_TARGET_YEAR = '1901-1902';
/** Tables copy_schedule_to_year writes, in FK-safe delete order. */
const COPIED_TABLES = [
  'rotation_group_members',
  'rotation_groups',
  'rotation_activity_pairs',
  'instruction_schedules',
  'yard_duty_assignments',
  'activity_type_availability',
  'special_activities',
  'bell_schedules',
] as const;

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

/**
 * Remove everything the probe copied into PROBE_YEAR — and ONLY that.
 *
 * Scoped to WILLOW as well as the year. PROBE_YEAR is picked so no fixture uses
 * it, but that is an assumption about other people's data, and this runs with
 * the service role against the production database: a sweep keyed on
 * `school_year` alone would hard-delete another school's schedule if one ever
 * carried that year. The year is not ours to match on by itself. The six
 * non-rotation tables all have `school_id`; `rotation_groups` and
 * `rotation_group_members` do not, and are reached through the (now
 * school-scoped) probe-year pairs instead.
 *
 * Every delete is checked. A silently-failed sweep would leave probe-year rows
 * behind, which then breaks `sim:verify`'s exact per-table counts AND makes the
 * NEXT run's first copy fail on "target year already has data" — a failure that
 * would be blamed on the RPC rather than on this teardown.
 */
async function cleanupYear(year: string): Promise<void> {
  const fail = (what: string, message: string): never => {
    throw new Error(`probe cleanup failed (${what}): ${message} — probe-year rows may remain`);
  };

  // rotation_groups/members key off pair_id, not school_year alone — clear them
  // via the probe-year pairs first so nothing is orphaned.
  const { data: pairs, error: pairErr } = await admin
    .from('rotation_activity_pairs').select('id')
    .eq('school_id', WILLOW).eq('school_year', year);
  if (pairErr) fail('rotation_activity_pairs lookup', pairErr.message);
  const pairIds = (pairs ?? []).map(p => p.id);
  if (pairIds.length) {
    const { data: groups, error: gErr } = await admin
      .from('rotation_groups').select('id').in('pair_id', pairIds);
    if (gErr) fail('rotation_groups lookup', gErr.message);
    const groupIds = (groups ?? []).map(g => g.id);
    if (groupIds.length) {
      const { error: mErr } = await admin
        .from('rotation_group_members').delete().in('group_id', groupIds);
      if (mErr) fail('rotation_group_members', mErr.message);
      const { error: grpErr } = await admin.from('rotation_groups').delete().in('id', groupIds);
      if (grpErr) fail('rotation_groups', grpErr.message);
    }
    const { error: pDelErr } = await admin
      .from('rotation_activity_pairs').delete().in('id', pairIds);
    if (pDelErr) fail('rotation_activity_pairs', pDelErr.message);
  }
  for (const table of COPIED_TABLES) {
    if (table.startsWith('rotation_')) continue;
    const { error } = await admin.from(table).delete()
      .eq('school_id', WILLOW).eq('school_year', year);
    if (error) fail(table, error.message);
  }
}

/** Sweep both years this probe can write to. */
async function cleanup(): Promise<void> {
  await cleanupYear(PROBE_YEAR);
  await cleanupYear(SEA_TARGET_YEAR);
}

/**
 * Count rows for WILLOW in a year, THROWING on a query error.
 *
 * Swallowing the error and returning 0 would make the persistence check compare
 * 0 to 0 and pass — reporting that a copy landed when in fact neither count
 * could be read. A probe whose failure mode is a false "ok" is worse than one
 * that crashes.
 */
async function countIn(table: string, year: string): Promise<number> {
  const { count, error } = await admin
    .from(table).select('id', { count: 'exact', head: true })
    .eq('school_id', WILLOW).eq('school_year', year);
  if (error) throw new Error(`count failed for ${table} ${year}: ${error.message}`);
  return count ?? 0;
}

async function main(): Promise<void> {
  console.log('\nSPE-372 — scheduling RPC (copy_schedule_to_year) with real sessions\n');
  await cleanup();

  const dana = await signIn('dana');   // district admin — the intended caller
  const leah = await signIn('leah');   // SEA — no admin_permissions at all

  const sourceYear = (
    await admin.from('bell_schedules').select('school_year')
      .eq('school_id', WILLOW).limit(1).maybeSingle()
  ).data?.school_year as string | undefined;
  if (!sourceYear) throw new Error('no seeded bell_schedules for the sim school — re-seed');
  const sourceCount = await countIn('bell_schedules', sourceYear);
  console.log(`  source year ${sourceYear} has ${sourceCount} bell_schedules\n`);

  // --- 1. an authorized copy PERSISTS ----------------------------------------
  const { data: copied, error: copyErr } = await dana.rpc('copy_schedule_to_year', {
    p_school_id: WILLOW, p_from_year: sourceYear, p_to_year: PROBE_YEAR,
  });
  check(!copyErr, 'an admin can run the copy', copyErr ? copyErr.message : 'no error');
  check(!!copied && copied.bell_schedules > 0, 'the RPC reports rows copied',
    copied ? `bell_schedules=${copied.bell_schedules}` : 'no payload');

  // Read the target year back rather than trusting the counts it returned.
  const landed = await countIn('bell_schedules', PROBE_YEAR);
  check(landed === sourceCount, 'the copied rows are actually in the target year',
    `${landed} in ${PROBE_YEAR}, expected ${sourceCount}`);

  // --- 2. the already-populated guard fires, with its own message -------------
  const { error: secondErr } = await dana.rpc('copy_schedule_to_year', {
    p_school_id: WILLOW, p_from_year: sourceYear, p_to_year: PROBE_YEAR,
  });
  check(!!secondErr, 'a second copy into the same year is refused',
    secondErr ? 'refused' : 'ACCEPTED — would duplicate the schedule');
  check(/already has data/i.test(secondErr?.message ?? ''),
    'refused by the target-year guard, not incidentally',
    secondErr ? secondErr.message.slice(0, 52) : 'n/a');

  await cleanup();

  // --- 3. THE AUTHORIZATION CHECK — currently fails (SPE-511) ------------------
  // Leah is a SEA with zero admin_permissions rows, and WILLOW is not hers to
  // administer. An empty source year is used deliberately so that if the call
  // IS allowed through it copies nothing: this probe must not become the thing
  // that corrupts a school's schedule.
  //
  // PROVE the source is empty rather than assuming it. The RPC currently lets
  // this call through, so "the source has no rows" is the only thing standing
  // between this probe and an unauthorized write to a real school year. If that
  // ever stops being true, refuse to make the call at all.
  const sourceRows = await Promise.all(
    COPIED_TABLES.filter(t => !t.startsWith('rotation_group'))
      .map(async t => [t, await countIn(t, SEA_SOURCE_YEAR)] as const)
  );
  const nonEmpty = sourceRows.filter(([, n]) => n > 0);
  if (nonEmpty.length) {
    throw new Error(
      `refusing to run the authorization probe: source year ${SEA_SOURCE_YEAR} is NOT empty ` +
        `(${nonEmpty.map(([t, n]) => `${t}=${n}`).join(', ')}). The call is currently allowed ` +
        'through, so running it would copy real rows. Clear that year or pick another.'
    );
  }

  let seaErr: { code?: string; message: string } | null = null;
  try {
    ({ error: seaErr } = await leah.rpc('copy_schedule_to_year', {
      p_school_id: WILLOW, p_from_year: SEA_SOURCE_YEAR, p_to_year: SEA_TARGET_YEAR,
    }));
  } finally {
    // Sweep the target unconditionally. Today the source is empty so nothing
    // lands, but that is asserted above rather than guaranteed forever, and a
    // probe that can write rows must own removing them on every path.
    await cleanupYear(SEA_TARGET_YEAR);
  }
  // Match the AUTHORIZATION error specifically, not merely "something failed".
  // `!!seaErr` would go green the day the RPC starts validating year ranges or
  // rejecting an empty source — and this probe deliberately passes an empty
  // source year, so that is the likely way it breaks. A probe that reports
  // "non-admins are refused" because of an unrelated error is worse than no
  // probe: it would close SPE-511 while the hole is still open for a populated
  // source year. 42501 / "not authorized" is the house convention here —
  // upsert_students_atomic already refuses impersonation exactly that way.
  const refusedByAuth =
    seaErr?.code === '42501' || /not authorized|unauthorized|permission denied/i.test(seaErr?.message ?? '');
  check(refusedByAuth, 'a non-admin is REFUSED by an authorization guard (SPE-511)',
    seaErr
      ? `code=${seaErr.code} msg=${seaErr.message.slice(0, 44)}`
      : 'EXECUTED — any signed-in user can write to any school');
  if (!seaErr) {
    console.log(
      '\n  ⚠️  SPE-511: copy_schedule_to_year is SECURITY DEFINER, granted to\n' +
      '      `authenticated`, and has no authorization check in its body. The\n' +
      '      only gate is client-side and merely checks the caller is signed in.\n' +
      '      This check is expected to fail until that ticket lands.'
    );
  } else if (!refusedByAuth) {
    console.log(
      '\n  ⚠️  The call was refused, but NOT by an authorization guard. Do not\n' +
      '      read this as SPE-511 being fixed — an unrelated failure (year\n' +
      '      validation, an empty source year) refuses this call while a\n' +
      '      populated source year may still be exploitable. Re-test with a\n' +
      '      real source year before closing SPE-511.'
    );
  }

  console.log(
    failures === 0
      ? '\nAll checks passed. Re-seed (npm run sim:reset -- --yes) to restore the fixture.\n'
      : `\n${failures} check(s) failed — see SPE-511 if it is the authorization one.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async err => {
  await cleanup().catch(() => {});
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
