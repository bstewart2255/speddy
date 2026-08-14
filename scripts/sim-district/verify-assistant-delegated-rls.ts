/**
 * SPE-456 — the assistant's DELEGATED-SPECIALIST read path, run with a REAL
 * signed-in session.
 *
 * Why this exists: SPE-455 shipped `get_student_info`'s delegated branch and
 * could only confirm it by reading `pg_policies`, because the sim seed
 * delegated sessions to the SEA and never to a specialist — there was no
 * fixture to sign in against. Reading a policy is precisely the "confirmation"
 * SPE-332 proved worthless: `profiles_update` was recursive and silently broke
 * every self-serve profile write for ~7 months while being "verified" that way.
 *
 * The comment in lib/assistant/tools.ts still says "verified against live
 * pg_policies". This script is what replaces that with a measurement.
 *
 * The contract asserted, against the fixture SPE-456 added (Rachel's Willow
 * student at EDGE.specialistDelegatedIndex, delivered by Tomás):
 *   - the specialist CAN read the students row for a student delegated to them
 *     (if this breaks, the assistant answers "no student with that id is
 *     visible to you" for a student they actually deliver);
 *   - the student_details join comes back EMPTY for that student — the current
 *     RLS deliberately does not extend goals/IEP dates to a delegated
 *     specialist. This is what makes the tool's `on_my_caseload` flag
 *     load-bearing: it lets the model say "held by the caseload owner" rather
 *     than "missing". If RLS ever widens, this check fails and the prompt
 *     guidance needs revisiting;
 *   - `on_my_caseload` computes FALSE — students.provider_id is Rachel, not
 *     Tomás;
 *   - the weekly-slots `.or(provider_id, assigned_to_specialist_id)` query
 *     returns the delegated slots, so the schedule surface actually shows them;
 *   - a student Tomás has NO relationship to stays invisible, so the checks
 *     above are not passing simply because RLS is open.
 *
 * The traps this avoids (CLAUDE.md): the negative check uses a student picked
 * fresh from another provider's caseload that Tomás neither owns nor delivers,
 * so it cannot pass for the wrong reason; and the details-empty check is paired
 * with a positive control (Rachel sees the same student's details) so "empty"
 * is proven to be RLS and not an absent row.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). Read-only —
 * it creates nothing and leaves the fixture pristine.
 *
 * Usage: npm run sim:verify-assistant-delegated-rls
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { derivePassword, personaEmail } from './manifest';

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
  if (error) {
    throw new Error(`sim login failed for ${email} — is the district seeded? (${error.message})`);
  }
  return client;
}

async function profileId(personaKey: string): Promise<string> {
  const { data, error } = await admin
    .from('profiles').select('id').eq('email', personaEmail(personaKey)).single();
  if (error) throw new Error(`profile lookup failed for ${personaKey}: ${error.message}`);
  return data.id as string;
}

/** The shape get_student_info reads. Declared because these probe scripts use
 *  an untyped client, so the embedded relation would otherwise widen to a union
 *  TypeScript cannot narrow. */
type StudentRead = {
  id: string;
  provider_id: string;
  student_details: unknown;
};

/** The students row + details join exactly as get_student_info selects it. */
async function readStudent(
  client: SupabaseClient,
  studentId: string
): Promise<{ data: StudentRead | null; error: { message: string } | null }> {
  const { data, error } = await client
    .from('students')
    .select(
      'id, initials, grade_level, sessions_per_week, minutes_per_session, provider_id, ' +
        'student_details(iep_goals, upcoming_iep_date, upcoming_triennial_date)'
    )
    .eq('id', studentId)
    .maybeSingle();
  return { data: (data as StudentRead | null) ?? null, error };
}

/** Supabase returns an embedded to-one relation as an object or an array. */
function relationRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

async function main(): Promise<void> {
  console.log('\nSPE-456 — assistant delegated-specialist read path (real sessions)\n');

  const tomasId = await profileId('tomas');
  const rachelId = await profileId('rachel');

  // The delegated student, found the way the app would: a session Tomás
  // delivers but does not own. Derived from the data rather than hardcoded, so
  // a fixture reshuffle surfaces as "no fixture" instead of a wrong-row pass.
  const { data: delegatedRows, error: dErr } = await admin
    .from('schedule_sessions')
    .select('student_id, provider_id, delivered_by, assigned_to_specialist_id')
    .eq('assigned_to_specialist_id', tomasId)
    .eq('delivered_by', 'specialist')
    .limit(50);
  if (dErr) throw new Error(`delegated session lookup failed: ${dErr.message}`);

  const delegated = (delegatedRows ?? []).find(r => r.provider_id !== tomasId && r.student_id);
  if (!delegated) {
    console.error(
      'No specialist-delegated session found for Tomás.\n' +
        'This fixture is seeded by SPE-456 (EDGE.specialistDelegatedIndex).\n' +
        'Re-seed with: npm run sim:reset -- --yes'
    );
    process.exit(1);
  }
  const studentId = delegated.student_id as string;
  check(delegated.provider_id === rachelId, 'fixture: the delegated student is owned by Rachel',
    `owner=${delegated.provider_id === rachelId ? 'rachel' : delegated.provider_id}`);

  // A student Tomás has NO relationship to — neither owns nor delivers. Picked
  // fresh so the negative check cannot pass because of a stale assumption.
  const { data: tomasSessionRows } = await admin
    .from('schedule_sessions')
    .select('student_id')
    .or(`provider_id.eq.${tomasId},assigned_to_specialist_id.eq.${tomasId}`);
  const relatedIds = new Set((tomasSessionRows ?? []).map(r => r.student_id).filter(Boolean) as string[]);
  const { data: tomasOwned } = await admin.from('students').select('id').eq('provider_id', tomasId);
  for (const r of tomasOwned ?? []) relatedIds.add(r.id as string);

  const { data: strangerRows } = await admin
    .from('students').select('id, provider_id').neq('provider_id', tomasId).limit(500);
  const stranger = (strangerRows ?? []).find(r => !relatedIds.has(r.id as string));
  if (!stranger) throw new Error('could not find a student unrelated to Tomás for the negative check');

  const tomas = await signIn('tomas');
  const rachel = await signIn('rachel');

  // --- 1. the delegated student is visible to the specialist -----------------
  const seen = await readStudent(tomas, studentId);
  check(!seen.error && !!seen.data, 'specialist CAN read a student delegated to them',
    seen.error ? seen.error.message : `row ${seen.data ? 'returned' : 'MISSING'}`);

  // --- 2. on_my_caseload computes false --------------------------------------
  // The tool derives this from provider_id; assert the input, not a copy of the
  // tool's arithmetic.
  const onMyCaseload = seen.data ? seen.data.provider_id === tomasId : null;
  check(onMyCaseload === false, 'on_my_caseload is FALSE for the delegated student',
    `provider_id === tomas ? ${onMyCaseload}`);

  // --- 3. the details join is empty for the specialist ------------------------
  const details = relationRows(seen.data?.student_details);
  check(details.length === 0, 'student_details join is EMPTY for the delegated specialist',
    `${details.length} row(s) — RLS excludes delegated specialists`);

  // Positive control: the row exists and the OWNER can see it, so "empty" above
  // is RLS doing its job and not simply a student with no details recorded.
  const owner = await readStudent(rachel, studentId);
  const ownerDetails = relationRows(owner.data?.student_details);
  check(ownerDetails.length > 0, 'control: the caseload OWNER does see the same details row',
    `${ownerDetails.length} row(s) for rachel`);

  // --- 4. the weekly-slots .or() path returns the delegated slots -------------
  const { data: slots, error: slotsErr } = await tomas
    .from('schedule_sessions')
    .select('day_of_week, start_time, end_time, service_type, group_name')
    .eq('student_id', studentId)
    .or(`provider_id.eq.${tomasId},assigned_to_specialist_id.eq.${tomasId}`)
    .eq('is_template', true)
    .is('deleted_at', null);
  check(!slotsErr && (slots ?? []).length > 0, 'delegated weekly slots are visible via the .or() path',
    slotsErr ? slotsErr.message : `${(slots ?? []).length} template slot(s)`);

  // --- 5. an unrelated student stays invisible --------------------------------
  const hidden = await readStudent(tomas, stranger.id as string);
  check(!hidden.error && hidden.data === null, 'an unrelated student is NOT visible to the specialist',
    hidden.error ? hidden.error.message : `row ${hidden.data ? 'RETURNED — LEAK' : 'absent'}`);

  console.log(
    failures === 0
      ? '\nAll checks passed.\n'
      : `\n${failures} check(s) failed.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
