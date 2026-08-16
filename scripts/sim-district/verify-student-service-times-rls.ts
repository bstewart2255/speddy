/**
 * SPE-513 — `student_service_times` RLS, run with REAL signed-in sessions.
 *
 * Same reason this is a script and not a jest test as its siblings: unit
 * tests mock the Supabase client, so they cannot see RLS at all.
 *
 * The contract asserted here:
 *   - the owning provider can create an own-room entry for their OWN caseload
 *     student, and the write actually persists (rows, not status);
 *   - the child_id on the created row is trigger-filled from the student row
 *     (never caller-supplied);
 *   - a push-in entry persists with its destination teacher;
 *   - another provider at the SAME school can read both — cross-provider
 *     warning is the whole point of the table;
 *   - a provider at a DIFFERENT school cannot;
 *   - the same-school reader cannot UPDATE or DELETE someone else's entry;
 *   - a provider cannot create an entry for a student NOT on their caseload —
 *     refused as an RLS violation (42501), not incidentally;
 *   - a multi-school provider cannot record an entry under a school the
 *     student is not enrolled at (school binding) — 42501;
 *   - a push-in naming a teacher at a DIFFERENT school is refused — 42501;
 *   - the setting/teacher pairing is a CHECK constraint: push_in without a
 *     teacher, and own_room WITH one, both refuse with 23514.
 *
 * Traps avoided (CLAUDE.md): rows asserted rather than HTTP status; negative
 * checks assert the ERROR CODE so an incidental refusal can't pass for the
 * guard; fixtures picked fresh from the service client at runtime.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). Cleans up
 * the rows it creates (they're also swept by teardown via SWEPT_TABLES).
 *
 * Usage: npm run sim:verify-service-times-rls
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { CEDAR, WILLOW, derivePassword, personaEmail } from './manifest';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');

const admin = createAdmin();

const PROBE_NOTE = `spe513 probe ${Date.now()}`;

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

/** One directory teacher at `schoolId` (service client, ground truth). */
async function schoolTeacher(schoolId: string) {
  const { data, error } = await admin
    .from('teachers')
    .select('id, school_id')
    .eq('school_id', schoolId)
    .limit(1);
  if (error || !data?.length) {
    throw new Error(`no teacher found at ${schoolId} — has the seed changed?`);
  }
  return data[0];
}

async function main(): Promise<void> {
  const hannah = await signIn('hannah'); // resource at CEDAR (secondary) — the SPE-513 target persona
  const tomas = await signIn('tomas');   // speech, schools Willow+Juniper+CEDAR — same-school reader + multi-school case
  const jun = await signIn('jun');       // OT at Maple+Redwood — NOT at Cedar

  const hannahStudent = await caseloadStudent(hannah.userId, CEDAR);
  const tomasStudent = await caseloadStudent(tomas.userId, CEDAR);
  const cedarTeacher = await schoolTeacher(CEDAR);
  const willowTeacher = await schoolTeacher(WILLOW);

  let ownRoomId: string | null = null;
  let pushInId: string | null = null;

  console.log('owner writes persist, with trigger-filled child identity:');
  {
    const { data: rows, error } = await hannah.client
      .from('student_service_times')
      .insert({
        provider_id: hannah.userId,
        student_id: hannahStudent.id,
        school_id: CEDAR,
        day_of_week: 2,
        setting: 'own_room',
        period_name: 'Period 4',
        note: PROBE_NOTE,
      })
      .select();
    check(!error && rows?.length === 1, 'Hannah creates an own-room entry for her own Cedar student',
      error ? `error=${error.code}` : `rows=${rows?.length}`);
    ownRoomId = rows?.[0]?.id ?? null;

    check(rows?.[0]?.child_id === hannahStudent.child_id,
      'child_id trigger-filled from the student row',
      `row=${rows?.[0]?.child_id ?? 'null'} student=${hannahStudent.child_id ?? 'null'}`);

    const { data: pushRows, error: pushError } = await hannah.client
      .from('student_service_times')
      .insert({
        provider_id: hannah.userId,
        student_id: hannahStudent.id,
        school_id: CEDAR,
        day_of_week: 3,
        setting: 'push_in',
        period_name: 'Period 2',
        teacher_id: cedarTeacher.id,
        note: PROBE_NOTE,
      })
      .select();
    check(!pushError && pushRows?.length === 1, 'Hannah creates a push-in entry naming a Cedar teacher',
      pushError ? `error=${pushError.code}` : `rows=${pushRows?.length}`);
    pushInId = pushRows?.[0]?.id ?? null;
  }

  console.log('reads: same school yes, other school no:');
  {
    const { data: tomasSees } = await tomas.client
      .from('student_service_times').select('id').in('id', [ownRoomId!, pushInId!]);
    check((tomasSees?.length ?? 0) === 2, 'Tomás (same school) sees both — cross-provider warning works',
      `rows=${tomasSees?.length ?? 0}`);

    // Capture the error: an errored read yields undefined data, which would
    // read as 0 rows and fake a pass without the probe ever running.
    const { data: junSees, error: junReadError } = await jun.client
      .from('student_service_times').select('id').in('id', [ownRoomId!, pushInId!]);
    check(!junReadError && (junSees?.length ?? 0) === 0, 'Jun (different schools) sees nothing',
      junReadError ? `error=${junReadError.code}` : `rows=${junSees?.length ?? 0}`);
  }

  console.log('same-school reader cannot write someone else\'s entry:');
  {
    const { data: updRows, status } = await tomas.client
      .from('student_service_times')
      .update({ note: 'hijacked' }).eq('id', ownRoomId!).select('id');
    const { data: after } = await admin
      .from('student_service_times').select('note').eq('id', ownRoomId!).maybeSingle();
    check((updRows?.length ?? 0) === 0 && after?.note === PROBE_NOTE,
      'Tomás UPDATE affects 0 rows and does not persist',
      `HTTP ${status}, stored=${after?.note === PROBE_NOTE ? 'unchanged' : after?.note}`);

    const { data: delRows } = await tomas.client
      .from('student_service_times').delete().eq('id', ownRoomId!).select('id');
    const { data: still } = await admin
      .from('student_service_times').select('id').eq('id', ownRoomId!).maybeSingle();
    check((delRows?.length ?? 0) === 0 && !!still, 'Tomás DELETE is refused',
      `rows=${delRows?.length ?? 0}`);
  }

  console.log('caseload, school-binding and teacher-binding guards refuse for the RIGHT reason:');
  {
    // Not-my-student: Tomás's caseload row belongs to Tomás, so Hannah's
    // insert must fail the caseload EXISTS — a 42501 RLS violation.
    const { data: rows, error } = await hannah.client
      .from('student_service_times')
      .insert({
        provider_id: hannah.userId,
        student_id: tomasStudent.id,
        school_id: CEDAR,
        day_of_week: 1,
        setting: 'own_room',
        period_name: 'Period 1',
        note: PROBE_NOTE,
      })
      .select();
    check((rows?.length ?? 0) === 0 && error?.code === '42501',
      'Hannah cannot create an entry for Tomás\'s student (42501)',
      `code=${error?.code ?? 'none'} rows=${rows?.length ?? 0}`);

    // School binding: Tomás IS assigned to Willow, so the school-set branch
    // passes — only the student-school binding refuses this.
    const { data: rows2, error: err2 } = await tomas.client
      .from('student_service_times')
      .insert({
        provider_id: tomas.userId,
        student_id: tomasStudent.id, // enrolled at CEDAR
        school_id: WILLOW,
        day_of_week: 1,
        setting: 'own_room',
        period_name: 'Period 1',
        note: PROBE_NOTE,
      })
      .select();
    check((rows2?.length ?? 0) === 0 && err2?.code === '42501',
      'Tomás cannot record it under his OTHER school (42501)',
      `code=${err2?.code ?? 'none'} rows=${rows2?.length ?? 0}`);

    // Teacher binding: a push-in destination must teach at the entry's school.
    const { data: rows3, error: err3 } = await hannah.client
      .from('student_service_times')
      .insert({
        provider_id: hannah.userId,
        student_id: hannahStudent.id,
        school_id: CEDAR,
        day_of_week: 4,
        setting: 'push_in',
        period_name: 'Period 5',
        teacher_id: willowTeacher.id, // teaches at WILLOW, not CEDAR
        note: PROBE_NOTE,
      })
      .select();
    check((rows3?.length ?? 0) === 0 && err3?.code === '42501',
      'Hannah cannot name a Willow teacher as a Cedar push-in destination (42501)',
      `code=${err3?.code ?? 'none'} rows=${rows3?.length ?? 0}`);
  }

  console.log('setting/teacher pairing is a CHECK constraint (23514):');
  {
    const { data: rows, error } = await hannah.client
      .from('student_service_times')
      .insert({
        provider_id: hannah.userId,
        student_id: hannahStudent.id,
        school_id: CEDAR,
        day_of_week: 5,
        setting: 'push_in',
        period_name: 'Period 6',
        note: PROBE_NOTE,
        // no teacher_id
      })
      .select();
    check((rows?.length ?? 0) === 0 && error?.code === '23514',
      'push_in without a destination teacher refuses (23514)',
      `code=${error?.code ?? 'none'} rows=${rows?.length ?? 0}`);

    const { data: rows2, error: err2 } = await hannah.client
      .from('student_service_times')
      .insert({
        provider_id: hannah.userId,
        student_id: hannahStudent.id,
        school_id: CEDAR,
        day_of_week: 5,
        setting: 'own_room',
        period_name: 'Period 6',
        teacher_id: cedarTeacher.id, // own_room must not carry a teacher
        note: PROBE_NOTE,
      })
      .select();
    check((rows2?.length ?? 0) === 0 && err2?.code === '23514',
      'own_room WITH a teacher refuses (23514)',
      `code=${err2?.code ?? 'none'} rows=${rows2?.length ?? 0}`);
  }

  console.log('cleanup:');
  {
    const { data: deleted, error } = await admin
      .from('student_service_times').delete().eq('note', PROBE_NOTE).select('id');
    check(!error && (deleted?.length ?? 0) === 2,
      'probe rows removed (exactly the two that should exist)',
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
