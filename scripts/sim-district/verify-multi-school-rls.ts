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
 *   2. `students_select` (SEA branch) — a multi-school SEA saw school-wide
 *      students at their primary school alone.
 *   3. `children_select` (SEA branch) — the same gap on the child record.
 *
 * The contract asserted here:
 *   - a multi-school provider can create a teacher at a NON-primary assigned
 *     school, and still at their primary one;
 *   - and at NO school they are unassigned to — this widens to
 *     `provider_schools`, not to the district;
 *   - a multi-school SEA reads students and children at EVERY assigned school;
 *   - a single-school SEA is unchanged (no accidental widening of the common case);
 *   - and — the check that matters most — a multi-school NON-SEA provider does
 *     NOT pick up school-wide student reads. The SEA branch is gated on
 *     `role = 'sea'`; widening the school-id half of it must not leak the
 *     school-wide grant to everyone else assigned to that school.
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

  console.log('students_select — a multi-school SEA reads every assigned school:');
  {
    const willow = await fixtureStudentIds(WILLOW);
    const juniper = await fixtureStudentIds(JUNIPER);
    const maple = await fixtureStudentIds(MAPLE);

    const omarWillow = await visibleStudentIds(omar, WILLOW);
    check(sameSet(omarWillow, willow), 'Omar sees Willow students (his primary — worked before)',
      `${omarWillow.size}/${willow.size}`);

    // Before the fix this was 0.
    const omarJuniper = await visibleStudentIds(omar, JUNIPER);
    check(sameSet(omarJuniper, juniper), 'Omar sees Juniper students (assigned, NOT primary)',
      `${omarJuniper.size}/${juniper.size}`);

    const omarMaple = await visibleStudentIds(omar, MAPLE);
    check(omarMaple.size === 0, 'Omar sees NO Maple students (not assigned)',
      `count=${omarMaple.size}/${maple.size}`);

    const leahWillow = await visibleStudentIds(leah, WILLOW);
    const leahJuniper = await visibleStudentIds(leah, JUNIPER);
    check(sameSet(leahWillow, willow) && leahJuniper.size === 0,
      'single-school SEA unchanged: Willow only',
      `willow ${leahWillow.size}/${willow.size}, juniper ${leahJuniper.size}`);
  }

  console.log('...but the school-wide grant stays SEA-only:');
  {
    // The SEA branch is `school_id IN (my schools) AND role = 'sea'`. Widening
    // the school-id half must not hand school-wide reads to a non-SEA who is
    // also assigned to that school. Tomás should see only students he is
    // actually tied to at Juniper — as provider, or via a session.
    const juniper = await fixtureStudentIds(JUNIPER);
    const tomasJuniper = await visibleStudentIds(tomas, JUNIPER);
    check(tomasJuniper.size > 0 && tomasJuniper.size < juniper.size,
      'non-SEA at Juniper sees only their OWN students, not school-wide',
      `${tomasJuniper.size}/${juniper.size}`);
  }

  console.log('children_select — same SEA branch, through students:');
  {
    const willowKids = await fixtureChildIds(WILLOW);
    const juniperKids = await fixtureChildIds(JUNIPER);

    const omarWillowKids = await visibleChildIds(omar, willowKids);
    check(sameSet(omarWillowKids, willowKids), 'Omar sees Willow children (primary)',
      `${omarWillowKids.size}/${willowKids.size}`);

    // Before the fix this was 0.
    const omarJuniperKids = await visibleChildIds(omar, juniperKids);
    check(sameSet(omarJuniperKids, juniperKids), 'Omar sees Juniper children (assigned, NOT primary)',
      `${omarJuniperKids.size}/${juniperKids.size}`);

    const leahJuniperKids = await visibleChildIds(leah, juniperKids);
    check(leahJuniperKids.size === 0, 'single-school SEA sees NO Juniper children',
      `count=${leahJuniperKids.size}/${juniperKids.size}`);
  }

  if (failures === 0) {
    console.log('\nAll checks passed.');
  } else {
    console.log(`\n${failures} check(s) failed.`);
  }
  process.exit(failures === 0 ? 0 : 1);
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
      if (error) console.error(`cleanup failed for ${createdTeacherIds.length} teacher row(s): ${error.message}`);
    }
    process.exit(failures === 0 ? 0 : 1);
  });
