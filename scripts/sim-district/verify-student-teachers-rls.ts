/**
 * SPE-334 — `student_teachers` RLS, the rewritten teacher read paths, and the
 * dual-write, run with REAL signed-in sessions.
 *
 * Same reason this is a script and not a jest test as its siblings
 * verify-children-rls.ts / verify-profiles-rls.ts: our unit tests mock the
 * Supabase client, so they cannot see RLS at all — they pass identically
 * whether a policy permits a write or denies every one. This ticket rewrites
 * the teacher branch of `students_select`, `children_select` and
 * `student_details`, which is exactly the kind of change that blind spot hides.
 *
 * The contract asserted here:
 *   - a linked teacher reads EXACTLY the caseload rows the legacy
 *     `students.teacher_id` column gave them — the "zero visible behavior
 *     change" claim, measured rather than reasoned about;
 *   - a teacher with no links reads none, and cannot manufacture one;
 *   - BOTH co-teachers of a child see that child once a second link exists,
 *     and the first teacher does not lose it (the whole point of the table);
 *   - everyone who can read the STUDENT can read its teacher links; an unlinked
 *     provider cannot, and cannot write one;
 *   - a link across schools is refused, with the reason asserted;
 *   - the dual-write holds in both directions through a real session.
 *
 * Three traps this deliberately avoids (CLAUDE.md):
 *   - assert the write PERSISTED, not the HTTP status — PostgREST reports an
 *     RLS-filtered UPDATE as a 2xx with an empty body;
 *   - assert WHY a refusal happened (SQLSTATE / rows affected), so a value
 *     rejected incidentally cannot keep a negative check green;
 *   - negative checks run against a FRESH target the actor has no link to, so
 *     an already-permitted state cannot pass them for the wrong reason.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). It creates and
 * removes its own links and probe rows, so re-seed afterwards to restore a
 * pristine fixture.
 *
 * Usage: npm run sim:verify-student-teachers-rls
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { CEDAR, WILLOW, derivePassword, personaEmail, teacherRecordId } from './manifest';

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

/** The caseload rows a teacher row reaches through the junction, service-side. */
async function linkedStudentIds(teacherRowId: string): Promise<Set<string>> {
  const { data: links, error } = await admin
    .from('student_teachers').select('child_id').eq('teacher_id', teacherRowId);
  if (error) throw new Error(`link lookup failed: ${error.message}`);
  const childIds = [...new Set((links ?? []).map(l => l.child_id as string))];
  if (childIds.length === 0) return new Set();
  const { data: rows, error: sErr } = await admin
    .from('students').select('id').in('child_id', childIds);
  if (sErr) throw new Error(`caseload lookup failed: ${sErr.message}`);
  return new Set((rows ?? []).map(r => r.id as string));
}

/** The caseload rows the LEGACY column gave that teacher — the pre-SPE-334 set. */
async function legacyStudentIds(teacherRowId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('students').select('id').eq('teacher_id', teacherRowId);
  if (error) throw new Error(`legacy caseload lookup failed: ${error.message}`);
  return new Set((data ?? []).map(r => r.id as string));
}

async function legacyPair(studentId: string): Promise<{ teacher_id: string | null; teacher_name: string | null }> {
  const { data, error } = await admin
    .from('students').select('teacher_id, teacher_name').eq('id', studentId).single();
  if (error) throw new Error(`legacy pair readback failed: ${error.message}`);
  return data as { teacher_id: string | null; teacher_name: string | null };
}

async function linkTeacherIds(childId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('student_teachers').select('teacher_id').eq('child_id', childId).order('created_at');
  if (error) throw new Error(`link readback failed: ${error.message}`);
  return (data ?? []).map(r => r.teacher_id as string);
}

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every(v => b.has(v));

async function main(): Promise<void> {
  const noraTeacherId = teacherRecordId('login:nora');
  const davidTeacherId = teacherRecordId('login:david');
  const fatimaTeacherId = teacherRecordId('login:fatima');

  const rachelId = await profileId('rachel');

  // Nora's students, computed two ways: through the junction (what the policy
  // now uses) and through the legacy column (what it used yesterday).
  const noraViaLinks = await linkedStudentIds(noraTeacherId);
  const noraViaLegacy = await legacyStudentIds(noraTeacherId);

  console.log('read-set invariance (the zero-behaviour-change claim):');
  {
    check(noraViaLinks.size > 0, 'the fixture actually links Nora to students', `${noraViaLinks.size}`);
    check(sameSet(noraViaLinks, noraViaLegacy),
      'junction read set == legacy-column read set',
      `links=${noraViaLinks.size} legacy=${noraViaLegacy.size}`);

    const nora = await signIn('nora');
    const { data: seen, error } = await nora.from('students').select('id');
    const seenIds = new Set((seen ?? []).map(r => r.id as string));
    check(!error && sameSet(seenIds, noraViaLinks),
      'linked teacher SELECTs exactly that set through RLS',
      error ? error.message : `saw ${seenIds.size}`);

    // The rewrite touches three policies; a teacher blind to details or the
    // child record would be a silent half-migration.
    const { count: details } = await nora.from('student_details')
      .select('*', { count: 'exact', head: true });
    check((details ?? 0) > 0, 'linked teacher still reads student_details', `count=${details}`);
    const { count: kids } = await nora.from('children').select('*', { count: 'exact', head: true });
    check((kids ?? 0) > 0 && (kids ?? 0) <= noraViaLinks.size,
      'linked teacher still reads the child records', `children=${kids}`);
    const { count: sessions } = await nora.from('schedule_sessions')
      .select('*', { count: 'exact', head: true });
    check((sessions ?? 0) > 0, 'linked teacher still reads their students\' sessions', `count=${sessions}`);
  }

  console.log('a teacher with no links (fresh fixture, nothing to lose):');
  const david = await signIn('david');
  const targetStudentId = [...noraViaLinks][0]!;
  const { data: targetRow } = await admin
    .from('students').select('child_id, school_id').eq('id', targetStudentId).single();
  const targetChildId = targetRow!.child_id as string;
  {
    check((await linkTeacherIds(targetChildId)).includes(davidTeacherId) === false,
      'David starts with NO link to the probe child', targetChildId);

    const { data: seen, error } = await david.from('students').select('id');
    check(!error && (seen?.length ?? 0) === 0, 'unlinked teacher SELECTs 0 students',
      error ? error.message : `saw ${seen?.length ?? 0}`);

    const { count, error: cErr } = await david.from('students')
      .select('id', { count: 'exact', head: true }).eq('id', targetStudentId);
    check(!cErr && count === 0, 'and 0 rows for a specific student of Nora\'s', `count=${count}`);

    const { count: links } = await david.from('student_teachers')
      .select('*', { count: 'exact', head: true }).eq('child_id', targetChildId);
    check(links === 0, 'cannot read that child\'s teacher links', `count=${links}`);

    // The denial that matters: a teacher must not be able to enrol themselves.
    // 42501 is RLS refusing the INSERT — not a NOT NULL, not a bad FK.
    const { error: insErr } = await david.from('student_teachers')
      .insert({ child_id: targetChildId, teacher_id: davidTeacherId });
    check(insErr?.code === '42501', 'cannot link THEMSELVES to a child (RLS 42501)',
      `code=${insErr?.code ?? 'none'} ${insErr?.message ?? ''}`);
    check((await linkTeacherIds(targetChildId)).includes(davidTeacherId) === false,
      'and no link was created', 'service-client readback');
  }

  console.log('co-teachers are equals — both see the shared student:');
  {
    // Rachel owns the caseload row, so she is the one allowed to add the link.
    const rachel = await signIn('rachel');
    const { data: added, error } = await rachel.from('student_teachers')
      .insert({ child_id: targetChildId, teacher_id: davidTeacherId }).select('id').single();
    check(!error && !!added?.id, 'the owning provider CAN add a co-teacher',
      error ? `${error.code} ${error.message}` : 'inserted');

    const { data: davidSees } = await david.from('students')
      .select('id').eq('id', targetStudentId);
    check((davidSees?.length ?? 0) === 1, 'the new co-teacher now sees the student', targetStudentId);

    const nora = await signIn('nora');
    const { data: noraStill } = await nora.from('students').select('id').eq('id', targetStudentId);
    check((noraStill?.length ?? 0) === 1, 'and the first teacher did NOT lose it', targetStudentId);

    const { data: bothLinks } = await david.from('student_teachers')
      .select('teacher_id').eq('child_id', targetChildId);
    check((bothLinks?.length ?? 0) === 2, 'both links are visible to a linked teacher',
      `${bothLinks?.length ?? 0} links`);

    // Chat membership flips at the DB layer with this ticket (SPE-336 verifies
    // the UI): both teacher accounts must now be participants.
    const { data: participants, error: pErr } = await rachel
      .rpc('get_student_chat_participants', { p_student_id: targetStudentId });
    const ids = new Set((participants ?? []) as string[]);
    check(!pErr && ids.has(await profileId('nora')) && ids.has(await profileId('david')),
      'both teachers are chat participants for the student',
      pErr ? pErr.message : `${ids.size} participants`);

    // The legacy column must NOT have been repointed: it already names a valid
    // link (Nora), so the mirror leaves it alone.
    const pair = await legacyPair(targetStudentId);
    check(pair.teacher_id === noraTeacherId,
      'adding a co-teacher does not repoint the legacy column', `teacher_id=${pair.teacher_id}`);

    // Clean up: back to the seeded 1:1 shape.
    await admin.from('student_teachers')
      .delete().eq('child_id', targetChildId).eq('teacher_id', davidTeacherId);
    const { data: davidAfter } = await david.from('students').select('id').eq('id', targetStudentId);
    check((davidAfter?.length ?? 0) === 0, 'removing the link removes the visibility again',
      `saw ${davidAfter?.length ?? 0}`);
  }

  console.log('student_teachers read access mirrors who can read the student:');
  {
    for (const [key, label] of [
      ['rachel', 'owning provider'],
      ['nora', 'teacher of the student'],
      ['priya', 'site admin for the school'],
    ] as const) {
      const client = await signIn(key);
      const { count, error } = await client.from('student_teachers')
        .select('*', { count: 'exact', head: true }).eq('child_id', targetChildId);
      check(!error && (count ?? 0) === 1, `${label} reads the child's links`,
        error ? error.message : `count=${count}`);
    }

    const alicia = await signIn('alicia');
    const { count, error } = await alicia.from('student_teachers')
      .select('*', { count: 'exact', head: true }).eq('child_id', targetChildId);
    check(!error && count === 0, 'unlinked provider (other school) reads 0', `count=${count}`);

    const { error: insErr } = await alicia.from('student_teachers')
      .insert({ child_id: targetChildId, teacher_id: davidTeacherId });
    check(insErr?.code === '42501', 'unlinked provider INSERT refused (RLS 42501)',
      `code=${insErr?.code ?? 'none'}`);

    const { data: delRows, error: delErr } = await alicia.from('student_teachers')
      .delete().eq('child_id', targetChildId).select('id');
    check((delRows?.length ?? 0) === 0 && (await linkTeacherIds(targetChildId)).length === 1,
      'unlinked provider DELETE affects 0 rows',
      `code=${delErr?.code ?? 'none'} rows=${delRows?.length ?? 0}`);
  }

  console.log('a link may not cross schools:');
  {
    const rachel = await signIn('rachel');
    // Fatima teaches at Cedar; the probe child is at Willow. 23514 is the
    // consistency trigger, not a FK or a NOT NULL.
    const { error } = await rachel.from('student_teachers')
      .insert({ child_id: targetChildId, teacher_id: fatimaTeacherId });
    check(error?.code === '23514' && /not at this child/i.test(error?.message ?? ''),
      'cross-school link refused by the consistency trigger',
      `code=${error?.code ?? 'none'} ${error?.message ?? ''}`);
  }

  console.log('dual-write, through a real session:');
  {
    const rachel = await signIn('rachel');
    const willowTeacherA = teacherRecordId('grace');
    const willowTeacherB = teacherRecordId('yuki');

    const { data: created, error } = await rachel.from('students').insert({
      provider_id: rachelId, initials: 'QT', grade_level: '3',
      school_id: WILLOW, district_id: 'SIM-D001', state_id: 'CA',
      teacher_id: willowTeacherA, teacher_name: 'Grace Lindqvist-Sim',
      sessions_per_week: 1, minutes_per_session: 30,
    }).select('id, child_id').single();
    check(!error && !!created?.child_id, 'INSERT with a teacher still works',
      error ? `${error.code} ${error.message}` : `child=${created?.child_id}`);

    if (created) {
      const childId = created.child_id as string;
      check((await linkTeacherIds(childId)).join() === willowTeacherA,
        'legacy column INSERT mirrored into a link', (await linkTeacherIds(childId)).join());

      await rachel.from('students').update({ teacher_id: willowTeacherB }).eq('id', created.id);
      check((await linkTeacherIds(childId)).join() === willowTeacherB,
        'changing the column swaps the link (old one withdrawn)',
        (await linkTeacherIds(childId)).join());

      // Reverse direction: the column follows the link set only when it has
      // gone stale, so adding a second link must NOT repoint it.
      await rachel.from('student_teachers').insert({ child_id: childId, teacher_id: willowTeacherA });
      let pair = await legacyPair(created.id);
      check(pair.teacher_id === willowTeacherB,
        'adding a link leaves a still-valid column alone', `teacher_id=${pair.teacher_id}`);

      // Delete the link the column names -> it must fall back to the survivor.
      await rachel.from('student_teachers')
        .delete().eq('child_id', childId).eq('teacher_id', willowTeacherB);
      pair = await legacyPair(created.id);
      check(pair.teacher_id === willowTeacherA && pair.teacher_name === 'Grace Lindqvist-Sim',
        'deleting the named link repoints the column to the survivor',
        `${pair.teacher_id} / ${pair.teacher_name}`);

      // Remove the last link -> the column clears rather than naming a teacher
      // the child no longer has.
      await rachel.from('student_teachers').delete().eq('child_id', childId);
      pair = await legacyPair(created.id);
      check(pair.teacher_id === null && pair.teacher_name === null,
        'removing the last link clears the column',
        `${pair.teacher_id} / ${pair.teacher_name}`);

      await admin.from('students').delete().eq('id', created.id);
      await admin.from('children').delete().eq('id', childId);
    }
  }

  console.log('secondary teacher (Cedar) is unaffected by Willow activity:');
  {
    const fatima = await signIn('fatima');
    const fatimaExpected = await linkedStudentIds(fatimaTeacherId);
    const { data: seen, error } = await fatima.from('students').select('id, school_id');
    const seenIds = new Set((seen ?? []).map(r => r.id as string));
    check(!error && sameSet(seenIds, fatimaExpected),
      'Cedar teacher reads exactly her linked students',
      error ? error.message : `saw ${seenIds.size} / expected ${fatimaExpected.size}`);
    check((seen ?? []).every(r => r.school_id === CEDAR),
      'and nothing outside her school', `${(seen ?? []).length} rows`);
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
