/**
 * SPE-348 — the import create-or-attach guard, run with REAL signed-in sessions.
 *
 * Same reason this is a script and not a jest test as its siblings
 * verify-children-rls.ts / verify-profiles-rls.ts: our unit tests mock the
 * Supabase client, so they cannot see a trigger, an RLS policy, or a SECURITY
 * DEFINER guard at all — they pass identically whether the server re-validates a
 * claimed child link or waves every one through.
 *
 * The one thing that must never be true: a client attaching a caseload row to a
 * child of its choosing. A wrong attach shows a provider a different child's
 * record, which is why the ticket makes every attach human-confirmed and the
 * server re-validate every confirmation. This asserts the server half.
 *
 * The contract asserted here:
 *   - a confirmed child at ANOTHER school is refused;
 *   - a confirmed child at the caller's OWN school that is a different pupil is
 *     refused (matcher agreement, not just school scoping);
 *   - a forged row fails ALONE — the honest rows in the same batch still import;
 *   - the validating RPC cannot be skipped: a raw PostgREST insert carrying
 *     `child_id` is still refused by the trigger (SPE-347);
 *   - positive control — the same row WITHOUT a claim imports and gets its own
 *     fresh child, so the guard is not simply refusing everything.
 *
 * Three traps this deliberately avoids (CLAUDE.md):
 *   - assert the write did NOT PERSIST (row counts read back with the service
 *     client), never the returned status alone;
 *   - assert WHY each refusal happened, matching the SPE-348 / SPE-347 message,
 *     so a value rejected incidentally (a type cast, an FK, a length limit —
 *     this probe hit exactly that while being written) cannot keep a negative
 *     check green after the guard it tests is gone;
 *   - every forged target is a child the caller does NOT already serve, on a
 *     freshly seeded fixture, so the guard is genuinely exercised.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). It creates sim
 * caseload rows, so re-seed afterwards to restore a pristine fixture.
 *
 * Usage: npm run sim:verify-child-link
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { MAPLE, WILLOW, derivePassword, personaEmail } from './manifest';

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
  if (error) throw new Error(`sim login failed for ${email} — is the district seeded? (${error.message})`);
  return client;
}

async function profileId(personaKey: string): Promise<string> {
  const { data, error } = await admin
    .from('profiles').select('id').eq('email', personaEmail(personaKey)).single();
  if (error) throw new Error(`profile lookup failed for ${personaKey}: ${error.message}`);
  return data.id as string;
}

/** Read back with the SERVICE client — the caller's own view can be RLS-filtered. */
async function countRows(providerId: string, initials: string): Promise<number> {
  const { count } = await admin
    .from('students').select('id', { count: 'exact', head: true })
    .eq('provider_id', providerId).eq('initials', initials);
  return count ?? 0;
}

async function childOf(providerId: string, initials: string): Promise<string | null> {
  const { data } = await admin
    .from('students').select('child_id')
    .eq('provider_id', providerId).eq('initials', initials).maybeSingle();
  return (data?.child_id as string | undefined) ?? null;
}

/**
 * A child at `schoolId` that `notProvider` does NOT already serve.
 *
 * Filtering only the selected ROW's provider is not enough: the fixture
 * deliberately models co-served children (Tomás's first two Willow students are
 * Rachel's, spec §6), so a row owned by someone else can still point at a child
 * the caller has their own row for. Picking one of those would make the forged
 * claims below refuse because the candidate set excludes children you already
 * serve — the right answer for the wrong reason, and the check would stay green
 * even if the school scoping and matcher agreement it is meant to test were
 * gone. Exclude by CHILD, not by row.
 */
async function someChildAt(schoolId: string, notProvider: string): Promise<string> {
  const { data: mine } = await admin
    .from('students').select('child_id').eq('provider_id', notProvider).not('child_id', 'is', null);
  const alreadyServed = new Set((mine ?? []).map(r => r.child_id as string));

  const { data, error } = await admin
    .from('students').select('child_id')
    .eq('school_id', schoolId).neq('provider_id', notProvider)
    .not('child_id', 'is', null);
  if (error) throw new Error(`no child found at ${schoolId}: ${error.message}`);

  const candidate = (data ?? []).map(r => r.child_id as string).find(id => !alreadyServed.has(id));
  if (!candidate) throw new Error(`no unserved child at ${schoolId} — fixture drifted?`);
  return candidate;
}

const REFUSED_348 = /Confirmed child link refused/;

/** The confirm route's insert payload shape, with an optional claimed child. */
function forgedRow(initials: string, childId?: string): Record<string, unknown> {
  return {
    action: 'insert',
    initials,
    gradeLevel: '5',
    schoolId: WILLOW,
    districtId: 'SIM-D001',
    // state_id is varchar(2) — a longer value fails the INSERT for an entirely
    // unrelated reason and would make these negative checks pass for the wrong
    // reason. Keep it valid so the ONLY thing that can refuse is the guard.
    stateId: 'CA',
    firstName: 'Forged',
    lastName: 'Claim',
    goals: [],
    sessionsPerWeek: 1,
    minutesPerSession: 30,
    ...(childId ? { childId } : {}),
  };
}

async function main(): Promise<void> {
  console.log('SPE-348 create-or-attach guard — real signed-in sessions\n');

  const tomas = await signIn('tomas');
  const tomasId = await profileId('tomas');

  // Tomás works Willow/Juniper/Cedar. Maple is outside his reach entirely.
  const childElsewhere = await someChildAt(MAPLE, tomasId);
  const childHereOther = await someChildAt(WILLOW, tomasId);
  console.log(`  forged targets: other-school=${childElsewhere}  same-school-other-pupil=${childHereOther}\n`);

  const callUpsert = (rows: Array<Record<string, unknown>>) =>
    tomas.rpc('upsert_students_atomic', { p_provider_id: tomasId, p_students: rows });

  // --- 1. A child at another school ----------------------------------------
  const { data: r1 } = await callUpsert([forgedRow('ZZA', childElsewhere)]);
  const row1 = (r1 as any)?.results?.[0];
  check(row1?.success === false, 'forged claim on a child at ANOTHER school is refused', row1?.error ?? '');
  check(REFUSED_348.test(String(row1?.error ?? '')), '  ...for the right reason (SPE-348 re-validation)', String(row1?.error ?? ''));
  check((await countRows(tomasId, 'ZZA')) === 0, '  ...and the caseload row did not persist');

  // --- 2. A child at his own school, but a different pupil ------------------
  const { data: r2 } = await callUpsert([forgedRow('ZZB', childHereOther)]);
  const row2 = (r2 as any)?.results?.[0];
  check(row2?.success === false, 'forged claim on a NON-MATCHING child at his own school is refused', row2?.error ?? '');
  check(REFUSED_348.test(String(row2?.error ?? '')), '  ...for the right reason (matcher agreement, not just school)', String(row2?.error ?? ''));
  check((await countRows(tomasId, 'ZZB')) === 0, '  ...and the caseload row did not persist');

  // --- 3. A forged row must not take the honest rows down with it -----------
  const { data: r3 } = await callUpsert([forgedRow('ZZD', childElsewhere), forgedRow('ZZC')]);
  const rows3 = ((r3 as any)?.results ?? []) as Array<{ success?: boolean }>;
  check(rows3[0]?.success === false && rows3[1]?.success === true,
    'a forged row fails alone; the rest of the batch still imports',
    `forged=${rows3[0]?.success} honest=${rows3[1]?.success}`);
  check((await countRows(tomasId, 'ZZC')) === 1, '  ...the honest row landed');
  check((await countRows(tomasId, 'ZZD')) === 0, '  ...the forged row did not');

  // --- 4. The validating RPC cannot be skipped -----------------------------
  const { error: e4 } = await tomas.from('students').insert({
    provider_id: tomasId,
    initials: 'ZZE',
    grade_level: '5',
    school_id: WILLOW,
    district_id: 'SIM-D001',
    child_id: childHereOther,
  });
  check(!!e4, 'a RAW insert carrying child_id is refused by the trigger', e4?.message ?? 'NO ERROR — it succeeded!');
  check(/managed by the database/.test(e4?.message ?? '') || (e4 as any)?.code === '42501',
    '  ...for the right reason (child_id is database-managed, 42501)',
    `${(e4 as any)?.code ?? ''} ${e4?.message ?? ''}`);
  check((await countRows(tomasId, 'ZZE')) === 0, '  ...and nothing persisted');

  // --- 5. Positive control --------------------------------------------------
  const { data: r5 } = await callUpsert([forgedRow('ZZF')]);
  const row5 = (r5 as any)?.results?.[0];
  const madeChild = await childOf(tomasId, 'ZZF');
  check(row5?.success === true, 'positive control: the same row WITHOUT a claim imports normally', row5?.error ?? '');
  check(!!madeChild && madeChild !== childHereOther && madeChild !== childElsewhere,
    '  ...and got its own fresh child, not a shared one');

  // --- 6. The handshake must not leak between rows of one batch -------------
  // Every element of a batch runs in the SAME transaction, and the handshake is
  // a transaction-local setting. If it outlived its own INSERT, the NEXT row
  // would silently attach to a child nobody confirmed for it — a silent
  // wrong-child attach, the exact failure this whole ticket exists to prevent.
  // Reasoning cannot settle this; only the database can.
  const rachel = await signIn('rachel');
  const rachelId = await profileId('rachel');
  await rachel.rpc('upsert_students_atomic', {
    p_provider_id: rachelId,
    p_students: [{ ...forgedRow('QQA'), districtStudentId: 'SIM348-GUC' }],
  });
  const shared = await childOf(rachelId, 'QQA');
  check(!!shared, 'setup: a colleague established a genuinely offerable child', String(shared));

  const { data: offered } = await tomas.rpc('find_shared_child_candidates', {
    p_school_id: WILLOW,
    p_rows: [{
      idx: 0, initials: 'QQA', gradeLevel: '5', districtStudentId: 'SIM348-GUC',
      firstName: 'Forged', lastName: 'Claim',
    }],
  });
  check((offered as any[])?.[0]?.childId === shared, '  ...and it is genuinely OFFERED (so the attach below is legitimate)');

  const { data: r6 } = await callUpsert([
    { ...forgedRow('QQA', shared!), districtStudentId: 'SIM348-GUC' }, // confirmed attach
    forgedRow('QQB'),                                                  // ordinary row, no claim
  ]);
  const rows6 = ((r6 as any)?.results ?? []) as Array<{ success?: boolean; error?: string }>;
  check(rows6[0]?.success === true, 'a legitimately confirmed attach succeeds', rows6[0]?.error ?? '');
  check((await childOf(tomasId, 'QQA')) === shared, '  ...onto the offered child');
  const nextChild = await childOf(tomasId, 'QQB');
  check(rows6[1]?.success === true && !!nextChild && nextChild !== shared,
    'THE HANDSHAKE DOES NOT LEAK: the next row in the batch got its OWN child',
    `next=${nextChild} attached=${shared}`);

  // --- 7. No back-door merge ------------------------------------------------
  // Two of the CALLER'S OWN caseload rows on one child is a merge, which nothing
  // in this plan does. The candidate set excludes children the caller already
  // serves, so the second claim has nothing to match and is refused.
  const { data: r7 } = await callUpsert([{ ...forgedRow('QQC', shared!), districtStudentId: 'SIM348-GUC' }]);
  const row7 = (r7 as any)?.results?.[0];
  check(row7?.success === false && REFUSED_348.test(String(row7?.error ?? '')),
    'a SECOND caseload row of his own onto that child is refused (no back-door merge)',
    row7?.error ?? 'IT SUCCEEDED');

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
  console.log('Re-seed to restore a pristine fixture: npm run sim:reset -- --yes');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
