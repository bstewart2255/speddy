/**
 * SPE-362 — the RLS paths that scoped a provider by their PRIMARY school only,
 * run with REAL signed-in sessions.
 *
 * Same reason this is a script and not a jest test as its siblings
 * verify-profiles-rls.ts / verify-children-rls.ts / verify-special-activities-rls.ts:
 * our unit tests mock the Supabase client, so they cannot see RLS at all — they
 * pass identically whether a policy permits a write or denies every one.
 *
 * Three policies are covered (the fourth path in SPE-362, `profiles_update`'s
 * site-admin branch, was deliberately left out of this change):
 *
 *   1. `teachers_insert` — a provider could only CREATE a teacher at their
 *      primary school, while `teachers_select` already unioned
 *      `provider_schools`. So they saw teachers at every assigned school but
 *      could add at only one. The one path here with live impact.
 *   2. `students_select` (SEA branch) — SPE-384 REMOVED this branch entirely.
 *      It granted an SEA school-wide reads, which disagreed with the product:
 *      the Students and Plan pages go through `get_sea_students()`, scoped by
 *      session assignment. Assignment-scoped won, so the policy was narrowed to
 *      match the UI rather than the UI widened to match the policy. This
 *      supersedes SPE-362's widening of the same branch.
 *   3. `children_select` (SEA branch) — the same branch, same removal.
 *
 * The contract asserted here:
 *   - a multi-school provider can create a teacher at a NON-primary assigned
 *     school, and still at their primary one;
 *   - and at NO school they are unassigned to — this widens to
 *     `provider_schools`, not to the district;
 *   - an SEA reads exactly their caseload — the students they are assigned to
 *     through a session — and NOT the rest of their own school;
 *   - an SEA assigned to nobody reads nothing, at any of their schools, which is
 *     the cleanest read on the removed branch since it was their only route;
 *   - and no other role loses anything: the removed branch was gated on
 *     `role = 'sea'`, so a non-SEA must still read exactly what they read
 *     before, via the provider and session branches.
 *
 * Three traps this deliberately avoids (CLAUDE.md):
 *   - assert the ROWS, not the HTTP status — an RLS-filtered write is a 2xx
 *     with an empty body, exactly like a permitted write of nothing;
 *   - assert WHY a refusal happened — the negative INSERT matches `42501`
 *     specifically, so a row rejected incidentally (a later NOT NULL giving
 *     23502, say) cannot keep this green after the guard it tests is gone;
 *   - expected row sets come from the service client at runtime, never from a
 *     hardcoded count, so a seed change cannot quietly make a check vacuous.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`), including the
 * multi-school SEA persona `omar` added for this ticket. Teacher rows this
 * script creates are removed again on the way out, pass or fail.
 *
 * Usage: npm run sim:verify-multi-school-rls
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { CEDAR, JUNIPER, MAPLE, WILLOW, derivePassword, personaEmail } from './manifest';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');

const admin = createAdmin();

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(60)} ${detail}`);
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
  if (error) throw new Error(`sim login failed for ${email} — is the district seeded? (${error.message})`);
  return client;
}

/** Every student id at a school, per the service client (ground truth). */
async function fixtureStudentIds(schoolId: string): Promise<Set<string>> {
  const { data, error } = await admin.from('students').select('id').eq('school_id', schoolId);
  if (error) throw new Error(`fixture lookup failed for ${schoolId}: ${error.message}`);
  const ids = new Set((data ?? []).map(r => r.id as string));
  if (ids.size === 0) {
    throw new Error(`no students seeded at ${schoolId} — has the seed changed? ` +
      'A zero-row fixture would make every check here vacuously true.');
  }
  return ids;
}

/** Every child id reachable from a school's students (ground truth). */
async function fixtureChildIds(schoolId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('students').select('child_id').eq('school_id', schoolId).not('child_id', 'is', null);
  if (error) throw new Error(`child fixture lookup failed for ${schoolId}: ${error.message}`);
  const ids = new Set((data ?? []).map(r => r.child_id as string));
  if (ids.size === 0) throw new Error(`no linked children at ${schoolId} — has the seed changed?`);
  return ids;
}

async function visibleStudentIds(client: SupabaseClient, schoolId: string): Promise<Set<string>> {
  const { data, error } = await client.from('students').select('id').eq('school_id', schoolId);
  if (error) throw new Error(`session student read failed for ${schoolId}: ${error.message}`);
  return new Set((data ?? []).map(r => r.id as string));
}

/**
 * Children are not school-scoped themselves, so this asks the session for the
 * specific child ids the school's students link to, rather than filtering
 * `children` by a school column it does not have.
 */
async function visibleChildIds(client: SupabaseClient, want: Set<string>): Promise<Set<string>> {
  const ids = [...want];
  const { data, error } = await client.from('children').select('id').in('id', ids);
  if (error) throw new Error(`session child read failed: ${error.message}`);
  return new Set((data ?? []).map(r => r.id as string));
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every(id => b.has(id));
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter(id => b.has(id)));
}

async function profileIdFor(personaKey: string): Promise<string> {
  const { data, error } = await admin
    .from('profiles').select('id').eq('email', personaEmail(personaKey)).single();
  if (error) throw new Error(`profile lookup failed for ${personaKey}: ${error.message}`);
  return data.id as string;
}

/**
 * An SEA's caseload per the service client: the students they are assigned to
 * through an SEA-DELIVERED session. After SPE-384 this is their whole world.
 *
 * `delivered_by` is filtered here for the same reason the policy filters it —
 * the column is nullable, so a CHECK constraint cannot guarantee that an
 * `assigned_to_sea_id` row is SEA-delivered. Deriving the expectation the same
 * way the policy does is what keeps this a real check rather than a tautology.
 */
async function caseloadStudentIds(seaId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('schedule_sessions').select('student_id')
    .eq('assigned_to_sea_id', seaId)
    .eq('delivered_by', 'sea');
  if (error) throw new Error(`caseload lookup failed for ${seaId}: ${error.message}`);
  return new Set((data ?? []).map(r => r.student_id as string));
}

async function childIdsForStudents(studentIds: Set<string>): Promise<Set<string>> {
  if (studentIds.size === 0) return new Set();
  const { data, error } = await admin
    .from('students').select('child_id').in('id', [...studentIds]).not('child_id', 'is', null);
  if (error) throw new Error(`child link lookup failed: ${error.message}`);
  return new Set((data ?? []).map(r => r.child_id as string));
}

/** A fully-populated teacher row: see the header note on 23502 vs 42501. */
function teacherRow(schoolId: string, tag: string): Record<string, unknown> {
  return {
    first_name: 'Probe', last_name: `Teacher-${tag}`,
    email: `spe362.${tag}.${schoolId}@example.invalid`,
    classroom_number: '101', phone_number: '555-0100',
    school_id: schoolId, grade_level: '4',
  };
}

const createdTeacherIds: string[] = [];

async function attemptTeacherInsert(
  client: SupabaseClient, schoolId: string, tag: string,
): Promise<{ rows: number; code: string | null }> {
  const { data, error } = await client
    .from('teachers').insert(teacherRow(schoolId, tag)).select('id');
  for (const r of data ?? []) createdTeacherIds.push(r.id as string);
  return { rows: data?.length ?? 0, code: error?.code ?? null };
}

/** Ground truth that the row really landed — not just that PostgREST said 2xx. */
async function teacherExists(schoolId: string, tag: string): Promise<boolean> {
  const { data, error } = await admin
    .from('teachers').select('id').eq('email', `spe362.${tag}.${schoolId}@example.invalid`);
  if (error) throw new Error(`teacher readback failed: ${error.message}`);
  return (data ?? []).length > 0;
}

async function main(): Promise<void> {
  const stamp = String(process.hrtime.bigint()).slice(-8);

  const tomas = await signIn('tomas'); // speech: Willow (primary) + Juniper + Cedar
  const omar = await signIn('omar');   // sea:    Willow (primary) + Juniper
  const leah = await signIn('leah');   // sea:    Willow only

  console.log('teachers_insert — a provider may add at any ASSIGNED school (SPE-362):');
  {
    // Control: the primary school worked before the fix and must still work.
    const atPrimary = await attemptTeacherInsert(tomas, WILLOW, `${stamp}-primary`);
    check(atPrimary.rows === 1 && await teacherExists(WILLOW, `${stamp}-primary`),
      'Tomás CAN add a teacher at Willow (his primary)',
      `rows=${atPrimary.rows} code=${atPrimary.code ?? 'none'}`);

    // The regression this script exists for. Before the fix this was 0 rows / 42501.
    const atJuniper = await attemptTeacherInsert(tomas, JUNIPER, `${stamp}-secondary`);
    check(atJuniper.rows === 1 && await teacherExists(JUNIPER, `${stamp}-secondary`),
      'Tomás CAN add a teacher at Juniper (assigned, NOT primary)',
      `rows=${atJuniper.rows} code=${atJuniper.code ?? 'none'}`);

    const atCedar = await attemptTeacherInsert(tomas, CEDAR, `${stamp}-third`);
    check(atCedar.rows === 1 && await teacherExists(CEDAR, `${stamp}-third`),
      'Tomás CAN add a teacher at Cedar (his third school)',
      `rows=${atCedar.rows} code=${atCedar.code ?? 'none'}`);
  }

  console.log('...and NOT at a school they are unassigned to:');
  {
    // Maple is in the same district — if the fix had widened to "any school"
    // rather than "my schools", this is where it would show. The code must be
    // 42501 (RLS), not merely "some error".
    const atMaple = await attemptTeacherInsert(tomas, MAPLE, `${stamp}-forbidden`);
    check(atMaple.rows === 0 && atMaple.code === '42501',
      'Tomás CANNOT add a teacher at Maple — refused by RLS',
      `rows=${atMaple.rows} code=${atMaple.code ?? 'none'}`);
    check(!(await teacherExists(MAPLE, `${stamp}-forbidden`)),
      'and no Maple teacher row was created');
  }

  console.log('students_select — an SEA sees their CASELOAD, not their school (SPE-384):');
  {
    const willow = await fixtureStudentIds(WILLOW);
    const juniper = await fixtureStudentIds(JUNIPER);

    // Leah is assigned to a handful of Willow students. The contract is that she
    // sees exactly those — not the other ~40 at the same school.
    const leahCaseload = await caseloadStudentIds(await profileIdFor('leah'));
    const expected = intersect(leahCaseload, willow);
    check(expected.size > 0 && expected.size < willow.size,
      'fixture is non-vacuous: Leah has a caseload smaller than her school',
      `caseload ${expected.size} of ${willow.size} at Willow`);

    const leahWillow = await visibleStudentIds(leah, WILLOW);
    // Before the narrowing this was all 43 — the whole school.
    check(sameSet(leahWillow, expected),
      'Leah sees exactly her caseload at Willow, not the school',
      `${leahWillow.size}/${willow.size} (caseload ${expected.size})`);

    // Omar is assigned to nobody, so for him the school-wide grant was the ONLY
    // thing making students visible. He is the cleanest read on its removal.
    const omarWillow = await visibleStudentIds(omar, WILLOW);
    const omarJuniper = await visibleStudentIds(omar, JUNIPER);
    check(omarWillow.size === 0 && omarJuniper.size === 0,
      'unassigned SEA sees NO students at either assigned school',
      `willow ${omarWillow.size}/${willow.size}, juniper ${omarJuniper.size}/${juniper.size}`);
  }

  console.log('...and no other role loses anything:');
  {
    // The removed branch was gated on `role = 'sea'`, so a non-SEA must read
    // exactly what they read before: their own students, via provider or session.
    const juniper = await fixtureStudentIds(JUNIPER);
    const tomasJuniper = await visibleStudentIds(tomas, JUNIPER);
    check(tomasJuniper.size > 0 && tomasJuniper.size < juniper.size,
      'non-SEA at Juniper still sees their OWN students (unchanged)',
      `${tomasJuniper.size}/${juniper.size}`);
  }

  console.log('children_select — same narrowing, through students:');
  {
    const willowKids = await fixtureChildIds(WILLOW);
    const juniperKids = await fixtureChildIds(JUNIPER);

    // Leah's caseload children only — not every child at Willow.
    const leahCaseload = await caseloadStudentIds(await profileIdFor('leah'));
    const expectedKids = await childIdsForStudents(leahCaseload);
    const leahWillowKids = await visibleChildIds(leah, willowKids);
    check(expectedKids.size > 0 && expectedKids.size < willowKids.size,
      'fixture is non-vacuous: Leah\'s caseload children are fewer than the school\'s',
      `${expectedKids.size} of ${willowKids.size}`);
    check(sameSet(leahWillowKids, intersect(expectedKids, willowKids)),
      'Leah sees only her caseload\'s children at Willow',
      `${leahWillowKids.size}/${willowKids.size}`);

    const omarWillowKids = await visibleChildIds(omar, willowKids);
    const omarJuniperKids = await visibleChildIds(omar, juniperKids);
    check(omarWillowKids.size === 0 && omarJuniperKids.size === 0,
      'unassigned SEA sees NO children at either assigned school',
      `willow ${omarWillowKids.size}/${willowKids.size}, juniper ${omarJuniperKids.size}/${juniperKids.size}`);
  }

  if (failures === 0) {
    console.log('\nAll checks passed.');
  } else {
    console.log(`\n${failures} check(s) failed.`);
  }
  // Deliberately no process.exit() here: it is synchronous and would preempt
  // the `.finally()` below, leaking this run's probe teachers into the fixture.
  // The exit code is set there, after cleanup.
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    failures = failures || 1;
  })
  .finally(async () => {
    // Leave the fixture as we found it, pass or fail — otherwise a re-run hits
    // duplicate probe teachers and the next reader cannot tell them from seed.
    if (createdTeacherIds.length > 0) {
      const { error } = await admin.from('teachers').delete().in('id', createdTeacherIds);
      if (error) {
        // Fail the command: leftover probe teachers are fixture drift, and a
        // green exit here would hide it behind a passing set of checks.
        console.error(`cleanup failed for ${createdTeacherIds.length} teacher row(s): ${error.message}`);
        failures++;
      }
    }
    process.exit(failures === 0 ? 0 : 1);
  });
