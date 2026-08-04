/**
 * SPE-361 — `special_activities` SELECT scoping, run with REAL signed-in sessions.
 *
 * Same reason this is a script and not a jest test as its siblings
 * verify-profiles-rls.ts / verify-children-rls.ts: our unit tests mock the
 * Supabase client, so they cannot see RLS at all — they pass identically
 * whether a policy returns every row or none.
 *
 * The bug: `special_activities_select` scoped school-wide reads through
 * `profiles.school_id` alone — the caller's single "primary" school — so an
 * itinerant provider saw special activities at exactly one of their schools.
 * Special activities are the constraints the scheduler schedules AROUND, so a
 * provider planning at a non-primary site was working from an incomplete
 * picture of when classes are unavailable.
 *
 * The contract asserted here:
 *   - a multi-school provider reads special activities at EVERY assigned
 *     school, not just the primary one (Tomás: Willow primary + Juniper;
 *     Maria: Maple primary + Juniper);
 *   - and at NO school they are unassigned to — the fix widens to
 *     provider_schools, not to the district;
 *   - a single-school provider's visibility is unchanged (no accidental
 *     widening for the common case);
 *   - the teacher and owning-provider read branches still work;
 *   - the fix is SELECT-only: a provider still cannot write an activity they
 *     do not own at a non-primary school.
 *
 * Three traps this deliberately avoids (CLAUDE.md):
 *   - assert the ROWS, not the HTTP status — an RLS-filtered read is a 2xx
 *     with an empty body, exactly like a permitted read of nothing;
 *   - expected row sets come from the service client at runtime, not from a
 *     hardcoded 3, so a seed change cannot quietly make a check vacuous;
 *   - the negative WRITE check patches a value the row does NOT already carry
 *     and reads back with the service client, so a no-op update cannot pass
 *     for the wrong reason.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). It leaves the
 * fixture unchanged on success (the one write it attempts must be refused).
 *
 * Usage: npm run sim:verify-special-activities-rls
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
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(58)} ${detail}`);
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

/** Every special-activity id at a school, per the service client (ground truth). */
async function fixtureIds(schoolId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('special_activities').select('id').eq('school_id', schoolId);
  if (error) throw new Error(`fixture lookup failed for ${schoolId}: ${error.message}`);
  const ids = new Set((data ?? []).map(r => r.id as string));
  if (ids.size === 0) {
    throw new Error(`no special activities seeded at ${schoolId} — has the seed changed? ` +
      'A zero-row fixture would make every check here vacuously true.');
  }
  return ids;
}

/** The ids a signed-in session can actually see at a school. */
async function visibleIds(client: SupabaseClient, schoolId: string): Promise<Set<string>> {
  const { data, error } = await client
    .from('special_activities').select('id').eq('school_id', schoolId);
  if (error) throw new Error(`session read failed for ${schoolId}: ${error.message}`);
  return new Set((data ?? []).map(r => r.id as string));
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every(id => b.has(id));
}

async function activityName(id: string): Promise<string | null> {
  const { data, error } = await admin
    .from('special_activities').select('activity_name').eq('id', id).single();
  if (error) throw new Error(`activity readback failed: ${error.message}`);
  return data.activity_name as string | null;
}

async function main(): Promise<void> {
  const willow = await fixtureIds(WILLOW);
  const juniper = await fixtureIds(JUNIPER);
  const maple = await fixtureIds(MAPLE);

  const tomas = await signIn('tomas');   // Willow (primary) + Juniper + Cedar
  const maria = await signIn('maria');   // Maple (primary) + Juniper
  const alicia = await signIn('alicia'); // Maple only
  const derek = await signIn('derek');   // Juniper only — owns Juniper's rows
  const nora = await signIn('nora');     // teacher at Willow

  console.log('multi-school provider reads EVERY assigned school (SPE-361):');
  {
    const atWillow = await visibleIds(tomas, WILLOW);
    check(sameSet(atWillow, willow), 'Tomás sees Willow (his primary — worked before)',
      `${atWillow.size}/${willow.size}`);

    // The regression this whole script exists for. Before the fix this was 0.
    const atJuniper = await visibleIds(tomas, JUNIPER);
    check(sameSet(atJuniper, juniper), 'Tomás sees Juniper (assigned, NOT primary)',
      `${atJuniper.size}/${juniper.size}`);

    // Maria's primary is Maple, so Juniper exercises the same gap from the
    // other direction — a different provider, a different primary.
    const mariaJuniper = await visibleIds(maria, JUNIPER);
    const mariaMaple = await visibleIds(maria, MAPLE);
    check(sameSet(mariaJuniper, juniper) && sameSet(mariaMaple, maple),
      'Maria sees both Maple (primary) and Juniper',
      `maple ${mariaMaple.size}/${maple.size}, juniper ${mariaJuniper.size}/${juniper.size}`);
  }

  console.log('...and no school they are unassigned to:');
  {
    // Maple has activities and is in the same district — if the fix had widened
    // to "any school" rather than "my schools", this is where it would show.
    const tomasMaple = await visibleIds(tomas, MAPLE);
    check(tomasMaple.size === 0, 'Tomás sees NOTHING at Maple (not assigned)',
      `count=${tomasMaple.size}`);

    const mariaWillow = await visibleIds(maria, WILLOW);
    check(mariaWillow.size === 0, 'Maria sees NOTHING at Willow (not assigned)',
      `count=${mariaWillow.size}`);
  }

  console.log('single-school and non-provider read paths are unchanged:');
  {
    const aliciaMaple = await visibleIds(alicia, MAPLE);
    const aliciaWillow = await visibleIds(alicia, WILLOW);
    check(sameSet(aliciaMaple, maple) && aliciaWillow.size === 0,
      'single-school provider: own school only',
      `maple ${aliciaMaple.size}/${maple.size}, willow ${aliciaWillow.size}`);

    // Derek is provider_id on Juniper's rows — the owner branch, independent of
    // any school scoping.
    const derekJuniper = await visibleIds(derek, JUNIPER);
    check(sameSet(derekJuniper, juniper), 'owning provider still reads their own rows',
      `${derekJuniper.size}/${juniper.size}`);

    const noraWillow = await visibleIds(nora, WILLOW);
    check(sameSet(noraWillow, willow), 'teacher still reads their school',
      `${noraWillow.size}/${willow.size}`);
  }

  console.log('the fix is SELECT-only — writes are NOT widened:');
  {
    const target = [...juniper][0]!;
    const before = await activityName(target);
    // A value the row does not already carry: a no-op patch would be permitted
    // by any policy and would prove nothing.
    const forbidden = `spe361-probe-${Date.now()}`;
    check(before !== forbidden, 'negative-write fixture starts from a different value', `stored=${before}`);

    const { data: rows, status } = await tomas.from('special_activities')
      .update({ activity_name: forbidden }).eq('id', target).select('id');
    const after = await activityName(target);
    check((rows?.length ?? 0) === 0, 'Tomás UPDATE of a Juniper activity affects 0 rows',
      `HTTP ${status}, ${rows?.length ?? 0} row(s)`);
    check(after === before && after !== forbidden, 'and does not persist', `stored=${after}`);

    const { data: delRows, error: delErr } = await tomas.from('special_activities')
      .delete().eq('id', target).select('id');
    const stillThere = await activityName(target);
    check((delRows?.length ?? 0) === 0 && stillThere === before,
      'Tomás DELETE of a Juniper activity is refused',
      `code=${delErr?.code ?? 'none'} rows=${delRows?.length ?? 0}`);
  }

  if (failures === 0) {
    console.log('\nAll checks passed.');
  } else {
    console.log(`\n${failures} check(s) failed.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
