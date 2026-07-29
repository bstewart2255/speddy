/**
 * SPE-347 — `children` RLS + child-link guard, run with REAL signed-in sessions.
 *
 * Same reason this is a script and not a jest test as its sibling
 * verify-profiles-rls.ts: our unit tests mock the Supabase client, so they
 * cannot see RLS at all — they pass identically whether a policy permits a
 * write or denies every one. A `children` table whose whole point is
 * cross-provider access is exactly the kind of change that blind spot hides.
 *
 * The contract asserted here:
 *   - a provider with a caseload row reads, and may edit, that child;
 *   - BOTH providers of a co-served child resolve to the SAME children row;
 *   - every non-owner who can read the STUDENT can read its CHILD (teacher,
 *     SEA, site admin) but may NOT write it;
 *   - an unlinked provider gets 0 rows on SELECT and 0 rows affected on UPDATE;
 *   - nobody can INSERT or DELETE a children row directly;
 *   - `students.child_id` cannot be set or moved by an end-user session, while
 *     an ordinary insert still auto-links and the dual-write still mirrors.
 *
 * Three traps this deliberately avoids (CLAUDE.md):
 *   - assert the write PERSISTED, not the HTTP status — PostgREST reports an
 *     RLS-filtered UPDATE as a 2xx with an empty body;
 *   - assert WHY a refusal happened (SQLSTATE / rows affected), so a value
 *     rejected incidentally cannot keep a negative check green;
 *   - negative checks use a value the target does NOT already carry, and read
 *     back with the service client.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). It edits sim
 * children, so re-seed afterwards to restore a pristine fixture.
 *
 * Usage: npm run sim:verify-children-rls
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { CEDAR, WILLOW, derivePassword, personaEmail } from './manifest';

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

async function profileId(personaKey: string): Promise<string> {
  const { data, error } = await admin
    .from('profiles').select('id').eq('email', personaEmail(personaKey)).single();
  if (error) throw new Error(`profile lookup failed for ${personaKey}: ${error.message}`);
  return data.id as string;
}

async function childFirstName(childId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('children').select('first_name').eq('id', childId).single();
  if (error) throw new Error(`child readback failed: ${error.message}`);
  return data.first_name as string | null;
}

async function main(): Promise<void> {
  // The fixture's co-served child: Tomás's first Willow student IS Rachel's
  // first (manifest childKey()). Resolve it from the data rather than assuming.
  const rachelId = await profileId('rachel');
  const tomasId = await profileId('tomas');
  const { data: rachelRows, error: rErr } = await admin
    .from('students').select('id, child_id').eq('provider_id', rachelId).eq('school_id', WILLOW);
  if (rErr) throw new Error(`caseload lookup failed: ${rErr.message}`);
  const { data: tomasRows } = await admin
    .from('students').select('child_id').eq('provider_id', tomasId).eq('school_id', WILLOW);
  const tomasChildren = new Set((tomasRows ?? []).map(r => r.child_id));
  const shared = (rachelRows ?? []).find(r => tomasChildren.has(r.child_id));
  if (!shared) throw new Error('no co-served child in the fixture — has the seed changed?');
  const sharedChildId = shared.child_id as string;

  const { data: cedar } = await admin
    .from('students').select('child_id').eq('school_id', CEDAR).limit(1).single();
  const otherChildId = cedar!.child_id as string;

  const rachel = await signIn('rachel');
  const tomas = await signIn('tomas');
  const alicia = await signIn('alicia');

  console.log('linked provider (must read + write):');
  {
    const { data, error } = await rachel.from('children').select('id');
    check(!error && (data?.length ?? 0) === (rachelRows ?? []).length,
      'reads exactly the children of their caseload',
      `${data?.length} children / ${(rachelRows ?? []).length} caseload rows`);

    const stamp = `spe347-rachel-${Date.now()}`;
    const { data: rows } = await rachel.from('children')
      .update({ first_name: stamp }).eq('id', sharedChildId).select('id');
    // Rows affected AND a readback: a 2xx alone proves nothing.
    check((rows?.length ?? 0) === 1 && (await childFirstName(sharedChildId)) === stamp,
      'linked provider EDIT persists', `${rows?.length ?? 0} row(s)`);
  }

  console.log('co-serving provider (the point of the table):');
  {
    const { data } = await tomas.from('children').select('id').eq('id', sharedChildId);
    check((data?.length ?? 0) === 1, 'both providers resolve to the SAME children row', sharedChildId);

    const stamp = `spe347-tomas-${Date.now()}`;
    await tomas.from('children').update({ first_name: stamp }).eq('id', sharedChildId);
    check((await childFirstName(sharedChildId)) === stamp,
      'co-provider EDIT of the shared child persists');
  }

  console.log('unlinked provider (must be refused):');
  {
    const { count, error } = await alicia.from('children')
      .select('id', { count: 'exact', head: true }).eq('id', sharedChildId);
    check(!error && count === 0, 'SELECT returns 0 rows', `count=${count}`);

    // Negative write against a value the row does NOT already carry, so a no-op
    // patch cannot pass for the wrong reason.
    const before = await childFirstName(sharedChildId);
    const forbidden = `spe347-alicia-${Date.now()}`;
    const { data: rows, status } = await alicia.from('children')
      .update({ first_name: forbidden }).eq('id', sharedChildId).select('id');
    const after = await childFirstName(sharedChildId);
    check((rows?.length ?? 0) === 0, 'UPDATE affects 0 rows', `HTTP ${status}, ${rows?.length ?? 0} row(s)`);
    check(after === before && after !== forbidden, 'UPDATE did not persist', `stored=${after}`);

    const { error: insErr } = await alicia.from('children')
      .insert({ initials: 'XX', grade_level: '1' });
    check(insErr?.code === '42501', 'direct INSERT is refused', `code=${insErr?.code}`);

    const { error: delErr, data: delRows } = await alicia.from('children')
      .delete().eq('id', sharedChildId).select('id');
    check(delErr?.code === '42501' || (delRows?.length ?? 0) === 0,
      'direct DELETE is refused', `code=${delErr?.code ?? 'none'} rows=${delRows?.length ?? 0}`);
  }

  console.log('non-owner read paths (must read, must not write):');
  for (const [key, label] of [
    ['nora', 'teacher of the student'],
    ['leah', 'SEA at the school'],
    ['priya', 'site admin for the school'],
  ] as const) {
    const client = await signIn(key);
    const { count: children } = await client.from('children').select('*', { count: 'exact', head: true });
    const { count: students } = await client.from('students').select('*', { count: 'exact', head: true });
    // The contract is "nobody who can see a student is blind to its child".
    // children <= students because co-served students collapse to one child.
    check((students ?? 0) > 0 && (children ?? 0) > 0 && (children ?? 0) <= (students ?? 0),
      `${label} can read children`, `children=${children} students=${students}`);

    const before = await childFirstName(sharedChildId);
    const forbidden = `spe347-${key}-${Date.now()}`;
    const { data: rows } = await client.from('children')
      .update({ first_name: forbidden }).eq('id', sharedChildId).select('id');
    check((rows?.length ?? 0) === 0 && (await childFirstName(sharedChildId)) === before,
      `${label} cannot write a child`, `${rows?.length ?? 0} row(s)`);
  }

  console.log('students.child_id is managed by the database:');
  {
    const { error } = await rachel.from('students').insert({
      provider_id: rachelId, initials: 'QZ', grade_level: '3',
      school_id: WILLOW, district_id: 'SIM-D001', state_id: 'CA',
      child_id: otherChildId,
    });
    check(error?.code === '42501', 'INSERT that sets child_id is refused', `code=${error?.code}`);

    const own = (rachelRows ?? [])[0]!;
    const { error: updErr } = await rachel.from('students')
      .update({ child_id: otherChildId }).eq('id', own.id);
    const { data: still } = await admin.from('students').select('child_id').eq('id', own.id).single();
    check(updErr?.code === '42501' && still?.child_id === own.child_id,
      'UPDATE that moves child_id is refused', `code=${updErr?.code}`);
  }

  console.log('auto-create + dual-write, through a real session:');
  {
    const { data: created, error } = await rachel.from('students').insert({
      provider_id: rachelId, initials: 'QY', grade_level: '3',
      school_id: WILLOW, district_id: 'SIM-D001', state_id: 'CA',
    }).select('id, child_id').single();
    check(!error && !!created?.child_id, 'ordinary INSERT still works and auto-links',
      error ? error.message : `child=${created?.child_id}`);

    if (created) {
      await rachel.from('students').update({ grade_level: '4' }).eq('id', created.id);
      const { data: mirrored } = await admin.from('children')
        .select('grade_level').eq('id', created.child_id).single();
      check(mirrored?.grade_level === '4', 'students UPDATE mirrors onto the child',
        `grade=${mirrored?.grade_level}`);

      await rachel.from('student_details').insert({
        student_id: created.id, first_name: 'Probe', last_name: 'Child-Sim',
        date_of_birth: '2017-04-04',
      });
      const { data: named } = await admin.from('children')
        .select('first_name, last_name, date_of_birth').eq('id', created.child_id).single();
      check(named?.first_name === 'Probe' && named?.date_of_birth === '2017-04-04',
        'student_details write mirrors onto the child', JSON.stringify(named));

      await admin.from('students').delete().eq('id', created.id);
      await admin.from('children').delete().eq('id', created.child_id);
    }
  }

  if (failures === 0) {
    console.log('\nAll checks passed. Re-seed (npm run sim:reset -- --yes) to restore the fixture.');
  } else {
    console.log(`\n${failures} check(s) failed.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
