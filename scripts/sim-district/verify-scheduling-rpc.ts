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
 * Remove everything the probe copied into PROBE_YEAR.
 *
 * Every delete is checked. A silently-failed sweep would leave probe-year rows
 * behind, which then breaks `sim:verify`'s exact per-table counts AND makes the
 * NEXT run's first copy fail on "target year already has data" — a failure that
 * would be blamed on the RPC rather than on this teardown.
 */
async function cleanup(): Promise<void> {
  const fail = (what: string, message: string): never => {
    throw new Error(`probe cleanup failed (${what}): ${message} — probe-year rows may remain`);
  };

  // rotation_groups/members key off pair_id, not school_year alone — clear them
  // via the probe-year pairs first so nothing is orphaned.
  const { data: pairs, error: pairErr } = await admin
    .from('rotation_activity_pairs').select('id').eq('school_year', PROBE_YEAR);
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
    const { error } = await admin.from(table).delete().eq('school_year', PROBE_YEAR);
    if (error) fail(table, error.message);
  }
}

async function countIn(table: string, year: string): Promise<number> {
  const { count } = await admin
    .from(table).select('id', { count: 'exact', head: true })
    .eq('school_id', WILLOW).eq('school_year', year);
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
  const { error: seaErr } = await leah.rpc('copy_schedule_to_year', {
    p_school_id: WILLOW, p_from_year: '1900-1901', p_to_year: '1901-1902',
  });
  check(!!seaErr, 'a non-admin is REFUSED (SPE-511 — currently NOT enforced)',
    seaErr ? `code=${seaErr.code}` : 'EXECUTED — any signed-in user can write to any school');
  if (!seaErr) {
    console.log(
      '\n  ⚠️  SPE-511: copy_schedule_to_year is SECURITY DEFINER, granted to\n' +
      '      `authenticated`, and has no authorization check in its body. The\n' +
      '      only gate is client-side and merely checks the caller is signed in.\n' +
      '      This check is expected to fail until that ticket lands.'
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
