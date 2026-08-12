/**
 * SPE-458 — the scheduler's bell schedule / special activity reads are scoped
 * to the current school year, checked with a REAL signed-in session.
 *
 * Same reason this is a script and not a jest test as its siblings: our unit
 * tests mock the Supabase client, so they cannot see RLS at all. They pass
 * identically whether the database returns the rows or refuses them. This is a
 * change to what the scheduler READS from the browser, so it has to be
 * exercised against the real database through a provider's own session.
 *
 * It drives the ACTUAL SchedulingDataManager.fetchForSchool() — not a re-typed
 * copy of its query — with the session injected, so what runs here is the code
 * the app runs.
 *
 * The contract asserted here:
 *   - the current year's rows all come back under RLS (the SPE-463 failure
 *     mode is the dangerous one: "nothing" means the auto-scheduler books
 *     straight over lunch, silently);
 *   - a different school year returns NOTHING through that same code path.
 *
 * That second check is what makes this discriminating rather than decorative.
 * The sim district holds a single school year, so "prior year is empty" would
 * be trivially true if it were asserted on its own. Asserted through the same
 * call that just returned 120 rows for the current year, it is not: with the
 * school_year filter removed, the prior-year call returns those same 120 rows
 * (verified by reverting the fix), because an unfiltered read unions every
 * year the school has ever stored. That union IS the bug.
 *
 * Traps deliberately avoided (CLAUDE.md):
 *   - the fixture is proven non-empty with the service client FIRST, so the
 *     exclusion check cannot pass for the wrong reason;
 *   - fetchErrors is asserted empty, because a malformed filter fails into an
 *     empty result that looks identical to correct exclusion;
 *   - the row count is compared to ground truth, not merely to zero, so a
 *     filter that strands half the rows cannot pass.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). Read-only —
 * it does not modify sim data.
 *
 * Usage: npm run sim:verify-scheduler-year-scope
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { derivePassword, personaEmail } from './manifest';
import { SchedulingDataManager } from '@/lib/scheduling/scheduling-data-manager';
import { getCurrentSchoolYear } from '@/lib/school-year';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');
const admin = createAdmin();

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(56)} ${detail}`);
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

(async () => {
  const thisYear = getCurrentSchoolYear();
  const startYear = parseInt(thisYear.split('-')[0], 10);
  const priorYear = `${startYear - 1}-${startYear}`;

  console.log(`\nSPE-458 scheduler year scoping — current school year ${thisYear}\n`);

  // Rachel is a resource provider at Sim Willow Elementary.
  const session = await signIn('rachel');

  const { data: schools } = await session
    .from('provider_schools')
    .select('school_id, school_site')
    .limit(1);
  const school = (schools || [])[0] as { school_id: string | null; school_site: string | null };
  check(!!school, 'provider resolves a school through their own session',
    school ? (school.school_site ?? school.school_id ?? '') : 'none');
  if (!school) {
    process.exit(1);
  }

  // Ground truth via the service client: what SHOULD be visible for this school
  // this year. Compared against, not just "> 0", so a filter that strands some
  // rows cannot slip through.
  let truth = admin
    .from('bell_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('school_year', thisYear);
  truth = school.school_id
    ? truth.eq('school_id', school.school_id)
    : truth.eq('school_site', school.school_site!);
  const { count: expected } = await truth;
  check((expected ?? 0) > 0, 'fixture actually HAS current-year bell schedules',
    `service-client count=${expected}`);

  // Drive the real code path with the real session.
  const mgr = SchedulingDataManager.getInstance() as unknown as {
    supabase: SupabaseClient;
    cacheMetadata: { lastFetched: Date; isStale: boolean; fetchErrors: string[]; queryCount: number };
    schoolId: string | null;
    schoolSite: string | null;
    schoolYear: string;
    fetchForSchool: (t: string, l: string) => Promise<Array<{ school_year: string }>>;
  };
  mgr.supabase = session;
  mgr.cacheMetadata = { lastFetched: new Date(), isStale: false, fetchErrors: [], queryCount: 0 };
  mgr.schoolId = school.school_id;
  mgr.schoolSite = school.school_site;

  mgr.schoolYear = thisYear;
  const current = await mgr.fetchForSchool('bell_schedules', 'Bell schedules');
  check(current.length > 0, 'current year returns rows under RLS', `rows=${current.length}`);
  check(current.length === expected, 'and returns ALL of them, not a subset',
    `got=${current.length} expected=${expected}`);
  check(mgr.cacheMetadata.fetchErrors.length === 0,
    'no query errors (a failed filter reads as empty)',
    mgr.cacheMetadata.fetchErrors.join('; ') || 'none');
  check(current.every((r) => r.school_year === thisYear),
    'every row returned really is the current year');

  mgr.schoolYear = priorYear;
  mgr.cacheMetadata.fetchErrors = [];
  const prior = await mgr.fetchForSchool('bell_schedules', 'Bell schedules');
  check(prior.length === 0, `prior year (${priorYear}) is excluded`, `rows=${prior.length}`);
  check(mgr.cacheMetadata.fetchErrors.length === 0,
    'exclusion is a real filter, not a query error',
    mgr.cacheMetadata.fetchErrors.join('; ') || 'none');

  mgr.schoolYear = thisYear;
  const activities = await mgr.fetchForSchool('special_activities', 'Special activities');
  check(activities.length > 0, 'special activities: current year returns rows',
    `rows=${activities.length}`);
  check(activities.every((r) => r.school_year === thisYear),
    'special activities: every row is the current year');

  mgr.schoolYear = priorYear;
  const priorActivities = await mgr.fetchForSchool('special_activities', 'Special activities');
  check(priorActivities.length === 0, 'special activities: prior year is excluded',
    `rows=${priorActivities.length}`);

  await session.auth.signOut();

  if (failures > 0) {
    console.log(`\n${failures} check(s) FAILED.\n`);
    process.exit(1);
  }
  console.log('\nAll checks passed.\n');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
