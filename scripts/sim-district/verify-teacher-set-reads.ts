/**
 * SPE-336 — the teacher-set read paths the teacher-portal UI walk cannot
 * reach, exercised with REAL signed-in sessions.
 *
 * The portal walk (Fatima / Sanjay / Nora / Imani / David) proves the roster.
 * These two do not surface a teacher on screen today, so they need a probe:
 *
 *   * `get_sea_students` — the SEA data layer. Its shape is unchanged, but
 *     `teacher_name` must now read as the whole set ("Davis / Winbery") and
 *     `teacher_id` as the first link.
 *   * the IEP-meeting caseload — a co-taught student must carry BOTH teachers,
 *     because both get invited and both constrain the schedule.
 *
 * Both are SECURITY DEFINER / RLS-gated, so a mocked client would prove
 * nothing (CLAUDE.md): the sessions here are real.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). Read-only —
 * it creates nothing, so no re-seed is needed afterwards.
 *
 * Usage: npm run sim:verify-teacher-set-reads
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { WILLOW, derivePassword, personaEmail, teacherRecordId } from './manifest';

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

async function main(): Promise<void> {
  const noraTeacherId = teacherRecordId('login:nora');
  const imaniTeacherId = teacherRecordId('login:imani');

  // The co-taught children: Nora and Imani share this class (manifest
  // studentTeacherLinks). Resolved from data, never assumed.
  const { data: coTaught, error: ctErr } = await admin
    .from('student_teachers').select('child_id').eq('teacher_id', imaniTeacherId);
  if (ctErr) throw new Error(`co-taught lookup failed: ${ctErr.message}`);
  const coTaughtChildIds = new Set((coTaught ?? []).map(r => r.child_id as string));
  if (coTaughtChildIds.size === 0) {
    throw new Error('no co-taught children in the fixture — re-seed (npm run sim:reset -- --yes)');
  }

  console.log('the fixture really is co-taught:');
  {
    const { data: noraLinks } = await admin
      .from('student_teachers').select('child_id').eq('teacher_id', noraTeacherId);
    const noraChildIds = new Set((noraLinks ?? []).map(r => r.child_id as string));
    check(
      coTaughtChildIds.size > 0 && [...coTaughtChildIds].every(id => noraChildIds.has(id)),
      'Imani co-teaches exactly Nora\'s children',
      `${coTaughtChildIds.size} shared / ${noraChildIds.size} Nora`,
    );
  }

  console.log('get_sea_students reports the whole teacher set:');
  {
    const leah = await signIn('leah');
    const { data, error } = await leah.rpc('get_sea_students', { p_school_id: WILLOW });
    check(!error && (data?.length ?? 0) > 0, 'SEA reads their delegated students',
      error ? error.message : `${data?.length ?? 0} students`);

    const rows = (data ?? []) as { id: string; teacher_name: string | null; teacher_id: string | null }[];
    const { data: linkRows } = await admin
      .from('students').select('id, child_id').in('id', rows.map(r => r.id));
    const childOf = new Map((linkRows ?? []).map(r => [r.id as string, r.child_id as string]));

    const coTaughtRow = rows.find(r => coTaughtChildIds.has(childOf.get(r.id) ?? ''));
    if (!coTaughtRow) {
      check(false, 'a co-taught student is among the SEA\'s delegated students',
        'none — the SEA delegation and the co-taught class no longer overlap');
    } else {
      check(true, 'a co-taught student is among the SEA\'s delegated students', coTaughtRow.id);
      // The whole point: a joined set, not one name.
      check(
        (coTaughtRow.teacher_name ?? '').includes(' / '),
        'teacher_name joins both co-teachers',
        `${coTaughtRow.teacher_name}`,
      );
      check(
        coTaughtRow.teacher_id === noraTeacherId || coTaughtRow.teacher_id === imaniTeacherId,
        'teacher_id is one of the linked teachers (the first link)',
        `${coTaughtRow.teacher_id}`,
      );
    }

    // A singly-taught student must read exactly as it did before this ticket.
    const singleRow = rows.find(r => !coTaughtChildIds.has(childOf.get(r.id) ?? ''));
    if (singleRow) {
      check(
        !(singleRow.teacher_name ?? '').includes(' / '),
        'a single-teacher student still reads as one name',
        `${singleRow.teacher_name}`,
      );
    }
  }

  console.log('the IEP caseload carries every invited teacher:');
  {
    // Rachel owns the co-taught caseload rows at Willow.
    const rachel = await signIn('rachel');
    const { data: rows, error } = await rachel
      .from('students')
      .select('id, child_id')
      .eq('school_id', WILLOW);
    check(!error && (rows ?? []).length > 0, 'provider reads their Willow caseload',
      error ? error.message : `${rows?.length ?? 0} rows`);

    const coTaughtRow = (rows ?? []).find(r => coTaughtChildIds.has(r.child_id as string));
    check(!!coTaughtRow, 'a co-taught student is on that caseload', coTaughtRow?.id ?? 'none');

    if (coTaughtRow) {
      // Exactly the read getPlanningData performs, through Rachel's session.
      const { data: links, error: linkErr } = await rachel
        .from('student_teachers')
        .select('child_id, created_at, id, teachers(id, first_name, last_name, email, account_id)')
        .in('child_id', [coTaughtRow.child_id as string])
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      check(!linkErr && (links ?? []).length === 2,
        'the planner sees BOTH co-teachers, not just the first',
        linkErr ? linkErr.message : `${links?.length ?? 0} teachers`);

      const withAccounts = (links ?? []).filter(l => {
        const t = Array.isArray(l.teachers) ? l.teachers[0] : l.teachers;
        return !!t?.account_id;
      });
      // Both co-teachers are login personas, so both become real attendee rows
      // (profile_id) rather than display-name-only placeholders.
      check(withAccounts.length === 2,
        'both resolve to Speddy accounts, so both become invitable attendees',
        `${withAccounts.length} with accounts`);
    }
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
