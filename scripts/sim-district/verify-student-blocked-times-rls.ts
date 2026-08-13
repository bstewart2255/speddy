/**
 * SPE-492 — `student_blocked_times` RLS, run with REAL signed-in sessions.
 *
 * Same reason this is a script and not a jest test as its siblings: unit
 * tests mock the Supabase client, so they cannot see RLS at all.
 *
 * The contract asserted here:
 *   - the owning provider can create a protected time for their OWN caseload
 *     student, and the write actually persists (rows, not status);
 *   - the child_id on the created row is trigger-filled from the student row
 *     (never caller-supplied);
 *   - another provider at the SAME school can read it — cross-provider
 *     warning is the whole point of the table;
 *   - a provider at a DIFFERENT school cannot;
 *   - the same-school reader cannot UPDATE or DELETE someone else's block;
 *   - a provider cannot create a block for a student NOT on their caseload —
 *     refused as an RLS violation (42501), not incidentally;
 *   - a multi-school provider cannot record a block under a school the
 *     student is not enrolled at (the v2-lesson school binding) — 42501.
 *
 * Traps avoided (CLAUDE.md): rows asserted rather than HTTP status; negative
 * checks assert the ERROR CODE so an incidental refusal can't pass for the
 * guard; fixtures picked fresh from the service client at runtime.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). Cleans up
 * the rows it creates (they're also swept by teardown via SWEPT_TABLES).
 *
 * Usage: npm run sim:verify-blocked-times-rls
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { CEDAR, WILLOW, derivePassword, personaEmail } from './manifest';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');

const admin = createAdmin();

const PROBE_LABEL = `PE (spe492 probe ${Date.now()})`;

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(62)} ${detail}`);
}

async function signIn(personaKey: string): Promise<{ client: SupabaseClient; userId: string }> {
  const email = personaEmail(personaKey);
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: derivePassword(secret, email),
  });
  if (error || !data.user) {
    throw new Error(`sim login failed for ${email} — is the district seeded? (${error?.message})`);
  }
  return { client, userId: data.user.id };
}

/** One caseload student of `providerId` at `schoolId` (service client, ground truth). */
async function caseloadStudent(providerId: string, schoolId: string) {
  const { data, error } = await admin
    .from('students')
    .select('id, child_id, school_id')
    .eq('provider_id', providerId)
    .eq('school_id', schoolId)
    .limit(1);
  if (error || !data?.length) {
    throw new Error(`no caseload student found for provider ${providerId} at ${schoolId} — has the seed changed?`);
  }
  return data[0];
}

async function main(): Promise<void> {
  const tomas = await signIn('tomas');   // speech, schools Willow+Juniper+CEDAR — the SPE-490 target persona
  const hannah = await signIn('hannah'); // resource at CEDAR — same-school other provider
  const jun = await signIn('jun');       // OT at Maple+Redwood — NOT at Cedar

  const tomasStudent = await caseloadStudent(tomas.userId, CEDAR);
  const hannahStudent = await caseloadStudent(hannah.userId, CEDAR);

  let createdId: string | null = null;

  console.log('owner write persists, with trigger-filled child identity:');
  {
    const { data: rows, error } = await tomas.client
      .from('student_blocked_times')
      .insert({
        provider_id: tomas.userId,
        student_id: tomasStudent.id,
        school_id: CEDAR,
        day_of_week: 3,
        start_time: '11:00',
        end_time: '11:45',
        label: PROBE_LABEL,
      })
      .select();
    check(!error && rows?.length === 1, 'Tomás creates a protected time for his own Cedar student',
      error ? `error=${error.code}` : `rows=${rows?.length}`);
    createdId = rows?.[0]?.id ?? null;

    // Trigger-fill: child_id must equal the student row's, even though the
    // insert never supplied one.
    check(rows?.[0]?.child_id === tomasStudent.child_id,
      'child_id trigger-filled from the student row',
      `row=${rows?.[0]?.child_id ?? 'null'} student=${tomasStudent.child_id ?? 'null'}`);
  }

  console.log('reads: same school yes, other school no:');
  {
    const { data: hannahSees } = await hannah.client
      .from('student_blocked_times').select('id').eq('id', createdId!);
    check((hannahSees?.length ?? 0) === 1, 'Hannah (same school) sees the block — cross-provider warning works',
      `rows=${hannahSees?.length ?? 0}`);

    const { data: junSees } = await jun.client
      .from('student_blocked_times').select('id').eq('id', createdId!);
    check((junSees?.length ?? 0) === 0, 'Jun (different schools) sees nothing',
      `rows=${junSees?.length ?? 0}`);
  }

  console.log('same-school reader cannot write someone else\'s block:');
  {
    const { data: updRows, status } = await hannah.client
      .from('student_blocked_times')
      .update({ label: 'hijacked' }).eq('id', createdId!).select('id');
    const { data: after } = await admin
      .from('student_blocked_times').select('label').eq('id', createdId!).maybeSingle();
    check((updRows?.length ?? 0) === 0 && after?.label === PROBE_LABEL,
      'Hannah UPDATE affects 0 rows and does not persist',
      `HTTP ${status}, stored=${after?.label === PROBE_LABEL ? 'unchanged' : after?.label}`);

    const { data: delRows } = await hannah.client
      .from('student_blocked_times').delete().eq('id', createdId!).select('id');
    const { data: still } = await admin
      .from('student_blocked_times').select('id').eq('id', createdId!).maybeSingle();
    check((delRows?.length ?? 0) === 0 && !!still, 'Hannah DELETE is refused',
      `rows=${delRows?.length ?? 0}`);
  }

  console.log('caseload and school-binding guards refuse for the RIGHT reason:');
  {
    // Not-my-student: Hannah's caseload row belongs to Hannah, so Tomás's
    // insert must fail the caseload EXISTS — a 42501 RLS violation, not a
    // type or FK error.
    const { data: rows, error } = await tomas.client
      .from('student_blocked_times')
      .insert({
        provider_id: tomas.userId,
        student_id: hannahStudent.id,
        school_id: CEDAR,
        day_of_week: 2,
        start_time: '09:00',
        end_time: '09:30',
        label: PROBE_LABEL,
      })
      .select();
    check((rows?.length ?? 0) === 0 && error?.code === '42501',
      'Tomás cannot create a block for Hannah\'s student (42501)',
      `code=${error?.code ?? 'none'} rows=${rows?.length ?? 0}`);

    // School binding: Tomás IS assigned to Willow, so the school-set branch
    // passes — only the v2-lesson student-school binding refuses this.
    const { data: rows2, error: err2 } = await tomas.client
      .from('student_blocked_times')
      .insert({
        provider_id: tomas.userId,
        student_id: tomasStudent.id, // enrolled at CEDAR
        school_id: WILLOW,
        day_of_week: 1,
        start_time: '10:00',
        end_time: '10:30',
        label: PROBE_LABEL,
      })
      .select();
    check((rows2?.length ?? 0) === 0 && err2?.code === '42501',
      'Tomás cannot record it under his OTHER school (42501)',
      `code=${err2?.code ?? 'none'} rows=${rows2?.length ?? 0}`);
  }

  console.log('cleanup:');
  {
    const { data: deleted, error } = await admin
      .from('student_blocked_times').delete().eq('label', PROBE_LABEL).select('id');
    check(!error && (deleted?.length ?? 0) === 1,
      'probe rows removed (exactly the one that should exist)',
      `deleted=${deleted?.length ?? 0}`);
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
