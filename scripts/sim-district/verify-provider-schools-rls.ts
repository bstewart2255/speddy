/**
 * SPE-399 — `provider_schools` must never be self-writable, run with REAL
 * signed-in sessions.
 *
 * Same reason this is a script and not a jest test as its siblings
 * (verify-profiles-rls.ts, verify-multi-school-rls.ts, ...): our unit tests mock
 * the Supabase client, so they cannot see RLS at all — they pass identically
 * whether a policy permits a write or denies every one.
 *
 * WHY THIS TABLE IS SPECIAL. `provider_schools` is not ordinary user data — it
 * is an authorization INPUT. `get_my_school_ids()` returns
 * `profiles.school_id UNION provider_schools.school_id WHERE provider_id = auth.uid()`,
 * so a row here grants the caller a school's worth of reads: care_referrals,
 * care_cases, care_action_items, care_meeting_notes, iep_meetings,
 * student_parent_contacts, site_meeting_rules, special_activities,
 * teacher_availability_prefs, and the school branch of profiles_select.
 *
 * Before SPE-399 all three write commands were gated on ownership alone
 * (`provider_id = auth.uid()`), so "it's my row" was the entire check — and any
 * authenticated user could hand themselves any school. That was reproduced for
 * a district_tech (0 -> 4 readable care_referrals from one insert), a teacher,
 * and an SEA. Writes are now admin/service-role only.
 *
 * The contract asserted here:
 *   - no persona, of any role, can INSERT itself into a school;
 *   - a provider who legitimately HAS rows cannot repoint one at another school
 *     via UPDATE, nor remove one via DELETE;
 *   - and the escalation genuinely does not land: the same session still reads
 *     no care_referrals at the school it tried to claim;
 *   - while reads are untouched — a multi-school provider still sees exactly
 *     their own assigned schools, so the fix did not overshoot into a lockout.
 *
 * Three traps this deliberately avoids (CLAUDE.md):
 *   - assert the ROWS, not the HTTP status. `USING (false)` makes UPDATE and
 *     DELETE match zero rows, which PostgREST reports as a perfectly happy 2xx
 *     with an empty body — indistinguishable from a permitted write of nothing.
 *     So those two are checked by re-reading the row afterwards and proving it
 *     is unchanged / still present, not by looking for an error.
 *   - assert WHY a refusal happened. The negative INSERT matches `42501`
 *     specifically, so a row rejected incidentally (a NOT NULL giving 23502,
 *     say) cannot keep this green after the guard it tests is gone.
 *   - use a fresh fixture. Every check runs against seeded state and the
 *     script writes nothing that survives it — there is no already-escalated
 *     target that would make a negative pass for the wrong reason.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`).
 *
 * Usage: npm run sim:verify-provider-schools-rls
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { JUNIPER, MAPLE, WILLOW, derivePassword, personaEmail } from './manifest';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');

const admin = createAdmin();

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(64)} ${detail}`);
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

/** The self-insert that used to work, for one persona. Must be refused 42501. */
async function assertCannotSelfAttach(
  personaKey: string,
  label: string,
  targetSchool: string,
): Promise<void> {
  const client = await signIn(personaKey);
  const { data: { user } } = await client.auth.getUser();

  // Baseline BEFORE the attempt. Not "reads zero" — several personas legitimately
  // read referrals already (a teacher sees the ones they filed, a district admin
  // sees their district). The escalation claim is that the count GROWS, so that
  // is what gets asserted; a fixed zero would be wrong for most roles and would
  // have to be relaxed into meaninglessness.
  const { data: refsBefore } = await client.from('care_referrals').select('id').limit(50);
  const baseline = refsBefore?.length ?? 0;

  const { data, error } = await client
    .from('provider_schools')
    .insert({
      provider_id: user!.id,
      school_id: targetSchool,
      school_district: 'Sim Unified School District',
      school_site: 'probe',
      district_id: 'SIM-D001',
      state_id: 'CA',
      is_primary: false,
    })
    .select();

  check(
    error?.code === '42501',
    `${label}: self-insert into ${targetSchool} refused`,
    error ? `code=${error.code}` : `NO ERROR — inserted ${data?.length ?? 0} row(s)`,
  );

  // Belt and braces: prove the escalation did not land even if the insert
  // somehow slipped through — this is the consequence the policy exists to stop.
  const { data: refsAfter } = await client.from('care_referrals').select('id').limit(50);
  check(
    (refsAfter?.length ?? 0) === baseline,
    `${label}: care_referrals reach did not grow`,
    `${baseline} -> ${refsAfter?.length ?? 0}`,
  );

  await client.auth.signOut();
}

async function main(): Promise<void> {
  console.log('provider_schools is admin-writable only (SPE-399):\n');

  // 1. Personas with NO legitimate rows here. Each holds a different role, to
  //    show the guard is not role-specific — the old policy let all of them in.
  console.log('self-attach, personas with no assignment (must be refused):');
  await assertCannotSelfAttach('theo', 'district_tech (Theo)', WILLOW);
  await assertCannotSelfAttach('nora', 'teacher      (Nora)', MAPLE);
  await assertCannotSelfAttach('dana', 'district_adm (Dana)', WILLOW);

  // 2. A provider who legitimately HAS rows: Maria is itinerant across Maple +
  //    Juniper. She must not be able to repoint one at a school she does not
  //    serve, nor delete one. Both commands now match zero rows rather than
  //    erroring, so these are asserted by re-reading the row.
  console.log('\nlegitimate multi-school provider (Maria: Maple + Juniper):');
  const maria = await signIn('maria');
  const { data: { user: mariaUser } } = await maria.auth.getUser();

  const { data: before } = await maria
    .from('provider_schools')
    .select('id, school_id')
    .order('school_id');
  // Compare as sets, not positionally — MAPLE is SIM-S002 and JUNIPER SIM-S003,
  // so a sorted array puts them in the opposite order to how they read.
  const beforeIds = new Set((before ?? []).map(r => r.school_id));
  check(
    beforeIds.size === 2 && beforeIds.has(MAPLE) && beforeIds.has(JUNIPER),
    'reads exactly her own two schools (reads untouched)',
    [...beforeIds].join(', ') || 'none',
  );

  const targetRow = before?.[0];
  if (!targetRow) {
    check(false, 'fixture sanity: Maria has provider_schools rows', 'none found');
  } else {
    // UPDATE: repoint a real row at Willow, which she does not serve.
    await maria
      .from('provider_schools')
      .update({ school_id: WILLOW, school_site: 'Sim Willow Elementary' })
      .eq('id', targetRow.id);

    const { data: afterUpdate } = await admin
      .from('provider_schools')
      .select('school_id')
      .eq('id', targetRow.id)
      .single();
    check(
      afterUpdate?.school_id === targetRow.school_id,
      'cannot repoint an owned row at an unassigned school',
      `school_id=${afterUpdate?.school_id} (was ${targetRow.school_id})`,
    );

    // DELETE: drop a real row.
    await maria.from('provider_schools').delete().eq('id', targetRow.id);

    const { count } = await admin
      .from('provider_schools')
      .select('id', { count: 'exact', head: true })
      .eq('id', targetRow.id);
    check(count === 1, 'cannot delete an owned row', `${count} row(s) remain`);
  }

  // The service client — how the real admin flows write — must still work.
  // (sim:reset already proves this at scale; re-assert it here so this script
  // fails loudly if a future tightening catches the admin path too.)
  const probeId = '00000000-0000-4000-8000-00000000e399';
  const { error: adminInsertErr } = await admin.from('provider_schools').insert({
    id: probeId,
    provider_id: mariaUser!.id,
    school_id: WILLOW,
    school_district: 'Sim Unified School District',
    school_site: 'Sim Willow Elementary',
    district_id: 'SIM-D001',
    state_id: 'CA',
    is_primary: false,
  });
  check(!adminInsertErr, 'service role can still write (admin assignment path)',
    adminInsertErr ? adminInsertErr.message : 'inserted');
  await admin.from('provider_schools').delete().eq('id', probeId);

  await maria.auth.signOut();

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
