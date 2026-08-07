/**
 * SPE-337 — writing a student's teacher set, with REAL signed-in sessions.
 *
 * The editing UI is the first thing in this chain that lets a person create and
 * destroy `student_teachers` rows from the browser, so the write path sits
 * directly on the RLS policies SPE-334 added. Mocked unit tests cannot see a
 * policy at all (CLAUDE.md), which is exactly why this exists.
 *
 * The contract asserted here — the same operations the picker performs:
 *
 *   * the owning provider can ADD a co-teacher, and the added teacher really
 *     gains sight of the student;
 *   * subject/period labels round-trip (secondary);
 *   * removing a link removes it, and the visibility with it;
 *   * the diff leaves untouched links ALONE — editing one row must not churn
 *     the others' created_at, because that is the order the legacy-column
 *     mirror calls "first listed";
 *   * REORDERING the set is a no-op: co-teachers are equals, so removing one
 *     and adding them back is the same set and must not revoke anybody;
 *   * a provider at another school is refused, on a FRESH target, with the
 *     refusal reason asserted;
 *   * `addTeacherLinkForStudent` is idempotent — re-assigning is a no-op, not
 *     an error, and does not disturb the rest of the set.
 *
 * Checks about POLICY go through the raw table, because that is the surface a
 * policy acts on. Checks about BEHAVIOUR call the real query helpers, so their
 * student -> child resolution and diffing are exercised too, not just the
 * statements they end in.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). It creates and
 * removes its own links; re-seed afterwards to restore a pristine fixture.
 *
 * Usage: npm run sim:verify-teacher-link-writes
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { WILLOW, derivePassword, personaEmail, teacherRecordId } from './manifest';
import {
  addTeacherLinkForStudent,
  getTeacherLinksForStudent,
  saveTeacherLinksForStudent,
} from '../../lib/supabase/queries/student-teachers';
import type { Database } from '../../src/types/database';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');

const admin = createAdmin();

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(60)} ${detail}`);
}

async function signIn(personaKey: string): Promise<SupabaseClient<Database>> {
  const email = personaEmail(personaKey);
  const client = createClient<Database>(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: derivePassword(secret, email),
  });
  if (error) throw new Error(`sim login failed for ${email} — is the district seeded? (${error.message})`);
  return client;
}

async function links(childId: string) {
  const { data, error } = await admin
    .from('student_teachers')
    .select('id, teacher_id, subject, period, created_at')
    .eq('child_id', childId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(`link readback failed: ${error.message}`);
  return data ?? [];
}

async function main(): Promise<void> {
  const davidTeacherId = teacherRecordId('login:david');

  // A Willow student on Rachel's caseload that David does NOT teach — the
  // fresh fixture every negative check needs.
  //
  // Setup reads assert their own failures for the same reason the checks below
  // do: an unseeded district would otherwise surface as a TypeError on `.id`,
  // or as the "no student without a David link" message — a query failure
  // reported as a fixture problem.
  const { data: rachelRow, error: rachelErr } = await admin.from('profiles')
    .select('id').eq('email', personaEmail('rachel')).single();
  if (rachelErr || !rachelRow) {
    throw new Error(`rachel's profile is missing — is the district seeded? (${rachelErr?.message ?? 'no row'})`);
  }
  const rachelId = rachelRow.id as string;
  const { data: caseload, error: caseloadErr } = await admin
    .from('students').select('id, child_id').eq('provider_id', rachelId).eq('school_id', WILLOW);
  if (caseloadErr) throw new Error(`caseload read failed: ${caseloadErr.message}`);

  let target: { id: string; child_id: string } | null = null;
  for (const row of caseload ?? []) {
    const current = await links(row.child_id as string);
    if (!current.some(l => l.teacher_id === davidTeacherId)) {
      target = { id: row.id as string, child_id: row.child_id as string };
      break;
    }
  }
  if (!target) throw new Error('no student without a David link — re-seed the fixture');

  const before = await links(target.child_id);
  console.log(`probe student ${target.id} (child ${target.child_id}), ${before.length} links to start`);

  const rachel = await signIn('rachel');
  const alicia = await signIn('alicia');
  const david = await signIn('david');

  console.log('\nthe owning provider can add a co-teacher:');
  {
    const { count: seenBefore } = await david.from('students')
      .select('*', { count: 'exact', head: true }).eq('id', target.id);
    check(seenBefore === 0, 'David cannot see the student beforehand', `count=${seenBefore}`);

    const { error } = await rachel.from('student_teachers')
      .insert({ child_id: target.child_id, teacher_id: davidTeacherId, subject: null, period: null });
    check(!error, 'provider INSERT of a co-teacher link succeeds',
      error ? `${error.code} ${error.message}` : 'inserted');

    const after = await links(target.child_id);
    check(after.length === before.length + 1, 'the link persisted',
      `${before.length} -> ${after.length}`);

    const { count: seenAfter } = await david.from('students')
      .select('*', { count: 'exact', head: true }).eq('id', target.id);
    check(seenAfter === 1, 'and the co-teacher now SEES the student', `count=${seenAfter}`);

    // The untouched links must keep their identity and order — the legacy
    // mirror follows created_at, so churn here would silently repoint
    // students.teacher_id on every caseload row of the child.
    const kept = after.filter(l => l.teacher_id !== davidTeacherId);
    check(
      kept.length === before.length &&
        kept.every((l, i) => l.id === before[i].id && l.created_at === before[i].created_at),
      'existing links are untouched (same ids, same created_at, same order)',
      `${kept.length} preserved`,
    );
  }

  console.log('\nsubject/period labels round-trip (secondary shape):');
  {
    const { data: updated, error } = await rachel.from('student_teachers')
      .update({ subject: 'Algebra I', period: '3' })
      .eq('child_id', target.child_id).eq('teacher_id', davidTeacherId)
      .select('subject, period');
    check(!error && updated?.[0]?.subject === 'Algebra I' && updated?.[0]?.period === '3',
      'labels save and read back',
      error ? error.message : `${updated?.[0]?.subject} / ${updated?.[0]?.period}`);
  }

  console.log('\nanother school\'s provider is refused (fresh target):');
  {
    // Alicia is at Maple with no relationship to this Willow child. Assert the
    // REASON: 42501 is RLS, not a constraint the row happened to trip.
    const { error: insErr } = await alicia.from('student_teachers')
      .insert({ child_id: target.child_id, teacher_id: teacherRecordId('grace') });
    check(insErr?.code === '42501', 'unlinked provider INSERT refused with 42501',
      `code=${insErr?.code ?? 'none'}`);

    const countBefore = (await links(target.child_id)).length;
    const { data: delRows } = await alicia.from('student_teachers')
      .delete().eq('child_id', target.child_id).select('id');
    check((delRows?.length ?? 0) === 0 && (await links(target.child_id)).length === countBefore,
      'unlinked provider DELETE affects 0 rows and destroys nothing',
      `${delRows?.length ?? 0} rows, ${countBefore} links intact`);

    const { data: updRows } = await alicia.from('student_teachers')
      .update({ subject: 'HACKED' }).eq('child_id', target.child_id).select('id');
    const stillClean = (await links(target.child_id)).every(l => l.subject !== 'HACKED');
    check((updRows?.length ?? 0) === 0 && stillClean,
      'unlinked provider UPDATE affects 0 rows and persists nothing',
      `${updRows?.length ?? 0} rows`);
  }

  console.log('\nre-assigning the same teacher is a no-op, not an error:');
  {
    const countBefore = (await links(target.child_id)).length;
    // Through the real helper, so its student -> child resolution is exercised
    // too, not just the upsert it ends in.
    let helperError: string | null = null;
    try {
      await addTeacherLinkForStudent(rachel, target.id, davidTeacherId);
    } catch (err) {
      helperError = err instanceof Error ? err.message : String(err);
    }
    const after = await links(target.child_id);
    check(!helperError && after.length === countBefore,
      'idempotent add leaves the set unchanged',
      helperError ?? `${countBefore} -> ${after.length}`);
    // ignoreDuplicates must not have blanked the labels we set earlier.
    const davidLink = after.find(l => l.teacher_id === davidTeacherId);
    check(davidLink?.subject === 'Algebra I',
      'and does not wipe the existing link\'s labels', `${davidLink?.subject}`);
  }

  console.log('\nreordering the set is not a change (co-teachers are equals):');
  {
    // The editor's rows carry no rank, so "remove Ms A, then add her back"
    // leaves the same set in a different order. That must be a no-op.
    //
    // It is not cosmetic. `created_at` order is what the SPE-334 legacy mirror
    // calls the "first listed" link, so churn here silently repoints
    // students.teacher_id — and a caller that derived that column from the
    // first row would make the mirror read the reorder as a REPLACEMENT and
    // revoke the demoted teacher's access. (The editing modal is now typed so
    // it cannot send that column at all; this pins the layer underneath.)
    const snapshot = await links(target.child_id);
    const asEdited = await getTeacherLinksForStudent(rachel, target.id);
    check(asEdited.length >= 2, 'the probe child has a set to reorder',
      `${asEdited.length} links`);

    const reordered = [...asEdited.slice(1), asEdited[0]];
    let saveError: string | null = null;
    try {
      await saveTeacherLinksForStudent(rachel, target.id, reordered);
    } catch (err) {
      saveError = err instanceof Error ? err.message : String(err);
    }
    const after = await links(target.child_id);
    check(
      !saveError &&
        after.length === snapshot.length &&
        after.every((l, i) => l.id === snapshot[i].id && l.created_at === snapshot[i].created_at),
      'every link survives with its id and created_at intact',
      saveError ?? `${snapshot.length} -> ${after.length}`,
    );

    // The teacher moved to the front of the array keeps their access.
    const demoted = asEdited[0].teacherId;
    check(after.some(l => l.teacher_id === demoted),
      'the teacher the user re-added is still linked', `${demoted.slice(0, 8)}…`);
  }

  console.log('\nremoving the link removes the visibility:');
  {
    const { data: delRows, error } = await rachel.from('student_teachers')
      .delete().eq('child_id', target.child_id).eq('teacher_id', davidTeacherId).select('id');
    check(!error && (delRows?.length ?? 0) === 1, 'provider DELETE of their own link succeeds',
      error ? error.message : `${delRows?.length ?? 0} row`);

    const { count: seenAfter } = await david.from('students')
      .select('*', { count: 'exact', head: true }).eq('id', target.id);
    check(seenAfter === 0, 'the removed co-teacher can no longer see the student',
      `count=${seenAfter}`);

    const after = await links(target.child_id);
    check(
      after.length === before.length &&
        after.every((l, i) => l.id === before[i].id && l.created_at === before[i].created_at),
      'the fixture is back exactly as it started',
      `${after.length} links`,
    );
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
