/**
 * SPE-372 / SPE-511 — `copy_schedule_to_year`, run with REAL signed-in sessions.
 *
 * This script found SPE-511 by running the function rather than reading it: the
 * RPC was SECURITY DEFINER, EXECUTE was granted to `authenticated`, and its body
 * never asked whether the caller had anything to do with `p_school_id`. A SEA
 * with zero admin_permissions could copy a schedule into any school in any
 * district. Unit tests mock the Supabase client, so they cannot see grants or
 * SECURITY DEFINER behaviour at all — they passed identically either way.
 *
 * The gate landed in 20260814_spe511_authorize_copy_schedule_to_year.sql. This
 * script is now what pins it. The policy it asserts:
 *
 *   - a district_admin may copy for any school in their district;
 *   - a site_admin may copy for the school on their grant, and NO other;
 *   - everyone else is refused, with SQLSTATE 42501.
 *
 * The gate had been shipped once before (20260402) and was silently dropped by
 * three successive CREATE OR REPLACE migrations. That is the specific regression
 * these checks exist to catch, so they assert the refusal is an AUTHORIZATION
 * error — not merely that something failed. An unrelated future failure (year
 * validation, a bad source year) must not be able to keep them green.
 *
 * The negative checks deliberately use a REAL, POPULATED source year. While the
 * hole was open they used an empty source so a successful bypass would copy
 * nothing; now that the guard exists, that dodge would test almost nothing — a
 * guard that only refuses empty copies is useless. They target a throwaway year,
 * assert the refusal, and then assert the target year is still EMPTY, so a
 * regression is caught by measurement rather than by trusting the error.
 *
 * The rest of the contract asserted:
 *   - an authorized copy PERSISTS — rows are read back from the target year,
 *     not inferred from the returned counts;
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
 * Remove everything the probe copied into a year — and ONLY that.
 *
 * Scoped to WILLOW as well as the year. PROBE_YEAR is picked so no fixture uses
 * it, but that is an assumption about other people's data, and this runs with
 * the service role against the production database: a sweep keyed on
 * `school_year` alone would hard-delete another school's schedule if one ever
 * carried that year. The year is not ours to match on by itself. The six
 * non-rotation tables all have `school_id`; `rotation_groups` and
 * `rotation_group_members` do not, and are reached through the (school-scoped)
 * probe-year pairs instead.
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

const cleanup = () => cleanupYear(PROBE_YEAR);

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

/** Total rows the probe year holds across every table the RPC writes. */
async function probeYearRows(year: string): Promise<number> {
  let total = 0;
  for (const t of COPIED_TABLES) {
    if (t.startsWith('rotation_group')) continue; // no school_id; covered via pairs
    total += await countIn(t, year);
  }
  return total;
}

/**
 * Is this the SPE-511 gate refusing, specifically?
 *
 * Requires BOTH signals. While the guard did not exist this was an `||`,
 * because the script could not dictate the message of a gate nobody had written
 * yet. The gate now exists and raises 42501 with "Not authorized …", so pinning
 * both is the house convention (upsert_students_atomic is matched the same way)
 * and stops an unrelated permission error elsewhere from keeping these green.
 */
function isAuthRefusal(err: { code?: string; message: string } | null): boolean {
  if (!err) return false;
  return err.code === '42501' && /not authorized/i.test(err.message);
}

async function main(): Promise<void> {
  console.log('\nSPE-372 / SPE-511 — scheduling RPC (copy_schedule_to_year), real sessions\n');
  await cleanup();

  const dana = await signIn('dana');     // district_admin, SIM-D001 — Willow's district
  const priya = await signIn('priya');   // site_admin, Willow — the school under test
  const elena = await signIn('elena');   // site_admin, MAPLE — right role, wrong school
  const leah = await signIn('leah');     // SEA — no admin_permissions at all

  const sourceYear = (
    await admin.from('bell_schedules').select('school_year')
      .eq('school_id', WILLOW).limit(1).maybeSingle()
  ).data?.school_year as string | undefined;
  if (!sourceYear) throw new Error('no seeded bell_schedules for the sim school — re-seed');
  const sourceCount = await countIn('bell_schedules', sourceYear);
  if (sourceCount === 0) throw new Error(`source year ${sourceYear} is empty — re-seed`);
  console.log(`  source year ${sourceYear} has ${sourceCount} bell_schedules\n`);

  // --- 1. a DISTRICT ADMIN can copy, and it PERSISTS --------------------------
  const { data: copied, error: copyErr } = await dana.rpc('copy_schedule_to_year', {
    p_school_id: WILLOW, p_from_year: sourceYear, p_to_year: PROBE_YEAR,
  });
  check(!copyErr, 'district admin can copy for a school in their district',
    copyErr ? copyErr.message : 'no error');
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

  // --- 3. a SITE ADMIN can copy for their OWN school --------------------------
  const { error: siteErr } = await priya.rpc('copy_schedule_to_year', {
    p_school_id: WILLOW, p_from_year: sourceYear, p_to_year: PROBE_YEAR,
  });
  check(!siteErr, 'site admin can copy for their own school',
    siteErr ? siteErr.message : 'no error');
  const siteLanded = await countIn('bell_schedules', PROBE_YEAR);
  check(siteLanded === sourceCount, "the site admin's copy actually persisted",
    `${siteLanded} in ${PROBE_YEAR}, expected ${sourceCount}`);

  await cleanup();

  // --- 4. THE SPE-511 REFUSALS ------------------------------------------------
  // Both use the REAL source year against a throwaway target: a guard that only
  // refuses empty copies would be worthless, so the call has to be one that
  // WOULD write if it got through. Each is followed by a count, because "it
  // errored" and "it wrote nothing" are different claims.
  const refusals: Array<{ who: string; client: SupabaseClient; label: string }> = [
    { who: 'elena', client: elena, label: 'a site admin of ANOTHER school is refused' },
    { who: 'leah', client: leah, label: 'a non-admin (SEA) is refused' },
  ];

  for (const { client, label } of refusals) {
    const { error } = await client.rpc('copy_schedule_to_year', {
      p_school_id: WILLOW, p_from_year: sourceYear, p_to_year: PROBE_YEAR,
    });
    check(isAuthRefusal(error), label,
      error ? `code=${error.code} msg=${error.message.slice(0, 40)}` : 'EXECUTED — SPE-511 IS OPEN');

    const wrote = await probeYearRows(PROBE_YEAR);
    check(wrote === 0, `  ↳ and wrote nothing`, `${wrote} row(s) in ${PROBE_YEAR}`);
    if (wrote > 0) await cleanup(); // a regression must not litter the fixture
  }

  // --- 5. the DISTRICT branch has its own negative ----------------------------
  // Without this, every check above stays green if a rewrite drops the district
  // match or the `v_district_id IS NOT NULL` guard: the sim has exactly one
  // district and dana is legitimately entitled to Willow, so the positive case
  // cannot distinguish "matched her district" from "matched anything".
  //
  // An unknown school id resolves to a NULL district, which must NOT match her
  // grant. Nothing is written even on a regression — the gate runs before the
  // first INSERT, and no such school exists to copy from.
  //
  // Gap worth naming: "district admin of district A is refused school in
  // district B" is not covered, because the fixture seeds one district and the
  // only other districts in this database belong to real customers.
  const { error: unknownErr } = await dana.rpc('copy_schedule_to_year', {
    p_school_id: 'SIM-NOSUCHSCHOOL', p_from_year: sourceYear, p_to_year: PROBE_YEAR,
  });
  check(isAuthRefusal(unknownErr),
    'district admin is refused a school outside their district',
    unknownErr ? `code=${unknownErr.code} msg=${unknownErr.message.slice(0, 40)}` : 'EXECUTED — district scope not enforced');

  await cleanup();

  console.log(
    failures === 0
      ? '\nAll checks passed. Re-seed (npm run sim:reset -- --yes) to restore the fixture.\n'
      : `\n${failures} check(s) failed.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async err => {
  await cleanup().catch(() => {});
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
