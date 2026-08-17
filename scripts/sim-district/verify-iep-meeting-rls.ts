/**
 * SPE-439 — `iep_meetings` / `iep_meeting_attendees` write scope, run with REAL
 * signed-in sessions.
 *
 * Same reason this is a script and not a jest test as its siblings: unit tests
 * mock the Supabase client, so they cannot see RLS or GRANTs at all — they pass
 * identically whether the database permits a write or refuses every one.
 *
 * The contract asserted here:
 *   - the organizer can UPDATE their own meeting, and it actually persists;
 *   - another provider at the SAME school cannot — 0 rows AND the stored value
 *     is unchanged (an RLS-filtered UPDATE reports 2xx with an empty body);
 *   - a site admin at that school CAN update someone else's meeting;
 *   - nobody can DELETE, organizer included — the grant is gone, so this must
 *     fail as insufficient_privilege (42501), not as a filtered no-op;
 *   - the WITH CHECK (which the policy previously lacked entirely) stops a
 *     permitted writer moving the meeting to another school;
 *   - a same-school non-organizer cannot attach an attendee to the meeting,
 *     while the organizer can.
 *
 * Traps avoided (CLAUDE.md): rows asserted rather than HTTP status; negative
 * checks assert the ERROR CODE so an incidental refusal (a type error, an FK)
 * cannot pass for the guard; fixtures created fresh at runtime, because against
 * a pre-existing row a no-op patch is permitted for the wrong reason.
 *
 * Requires a seeded sim district (`npm run sim:reset -- --yes`). Cleans up the
 * rows it creates (iep_meetings is also swept by teardown, keyed on student_id).
 *
 * Usage: npm run sim:verify-iep-meeting-rls
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createAdmin, requireEnv } from './lib';
import { CEDAR, WILLOW, derivePassword, personaEmail } from './manifest';

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const anon = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const secret = requireEnv('SIM_DISTRICT_PASSWORD');

const admin = createAdmin();

const PROBE_LOCATION = `Room A (spe439 probe ${Date.now()})`;

let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${label.padEnd(64)} ${detail}`);
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
    .select('id, school_id')
    .eq('provider_id', providerId)
    .eq('school_id', schoolId)
    .limit(1);
  if (error || !data?.length) {
    throw new Error(`no caseload student for provider ${providerId} at ${schoolId} — has the seed changed?`);
  }
  return data[0];
}

/** The meeting's stored location, read past RLS. */
async function storedLocation(meetingId: string): Promise<string | null> {
  const { data } = await admin
    .from('iep_meetings').select('location').eq('id', meetingId).maybeSingle();
  return data?.location ?? null;
}

/** The meeting's stored school, read past RLS. */
async function storedSchool(meetingId: string): Promise<string | null> {
  const { data } = await admin
    .from('iep_meetings').select('school_id').eq('id', meetingId).maybeSingle();
  return data?.school_id ?? null;
}

async function main(): Promise<void> {
  const tomas = await signIn('tomas');   // speech, works at Cedar — the organizer
  const hannah = await signIn('hannah'); // resource at Cedar — same school, NOT the organizer
  const marcus = await signIn('marcus'); // site_admin at Cedar

  const student = await caseloadStudent(tomas.userId, CEDAR);
  let meetingId: string | null = null;

  console.log('organizer creates a meeting:');
  {
    const { data, error } = await tomas.client
      .from('iep_meetings')
      .insert({
        student_id: student.id,
        school_id: CEDAR,
        organizer_id: tomas.userId,
        meeting_type: 'annual',
        status: 'draft',
        location: PROBE_LOCATION,
      })
      .select();
    check(!error && data?.length === 1, 'Tomás creates a meeting for his own Cedar student',
      error ? `error=${error.code} ${error.message}` : `rows=${data?.length}`);
    meetingId = data?.[0]?.id ?? null;
  }
  if (!meetingId) {
    console.log('\ncannot continue without a meeting fixture.');
    process.exit(1);
  }

  console.log('UPDATE scope:');
  {
    const { data: rows } = await tomas.client
      .from('iep_meetings').update({ location: 'Room B' }).eq('id', meetingId).select('id');
    check((rows?.length ?? 0) === 1 && (await storedLocation(meetingId)) === 'Room B',
      'organizer UPDATE persists', `rows=${rows?.length ?? 0}`);

    // The bug: this used to be permitted purely by sharing the school.
    const { data: hijack, status } = await hannah.client
      .from('iep_meetings').update({ location: 'HIJACKED' }).eq('id', meetingId).select('id');
    const after = await storedLocation(meetingId);
    check((hijack?.length ?? 0) === 0 && after === 'Room B',
      'same-school non-organizer UPDATE affects 0 rows and does not persist',
      `HTTP ${status}, stored=${after}`);

    const { data: adminRows } = await marcus.client
      .from('iep_meetings').update({ location: 'Room C' }).eq('id', meetingId).select('id');
    check((adminRows?.length ?? 0) === 1 && (await storedLocation(meetingId)) === 'Room C',
      'site admin CAN update another organizer\'s meeting', `rows=${adminRows?.length ?? 0}`);
  }

  console.log('WITH CHECK (the clause the policy never had):');
  {
    // Tomás belongs to Willow too AND is the organizer, so both of the WITH
    // CHECK's other conjuncts pass — only the student-school binding can refuse
    // this. That is the point: the first cut of this policy had no binding, and
    // this probe is what caught it. Assert the CODE, not just the row count, so
    // an incidental refusal cannot pass for the guard.
    const { data, error } = await tomas.client
      .from('iep_meetings').update({ school_id: WILLOW }).eq('id', meetingId).select('id');
    const stillCedar = await storedSchool(meetingId);
    check((data?.length ?? 0) === 0 && error?.code === '42501' && stillCedar === CEDAR,
      'organizer cannot move the meeting off the student\'s school (42501)',
      `code=${error?.code ?? 'none'} rows=${data?.length ?? 0} stored=${stillCedar}`);
  }

  console.log('the same binding holds on INSERT:');
  {
    const { data, error } = await tomas.client
      .from('iep_meetings')
      .insert({
        student_id: student.id, // enrolled at Cedar
        school_id: WILLOW,      // ...filed under Willow
        organizer_id: tomas.userId,
        meeting_type: 'annual',
        status: 'draft',
        location: PROBE_LOCATION,
      })
      .select();
    check((data?.length ?? 0) === 0 && error?.code === '42501',
      'cannot create a meeting under a school the student is not enrolled at',
      `code=${error?.code ?? 'none'} rows=${data?.length ?? 0}`);
  }

  console.log('DELETE is gone for everyone (grant revoked, not merely re-scoped):');
  {
    const { error: hannahErr } = await hannah.client
      .from('iep_meetings').delete().eq('id', meetingId).select('id');
    check(hannahErr?.code === '42501', 'same-school provider DELETE refused as 42501',
      `code=${hannahErr?.code ?? 'none'}`);

    const { error: ownerErr } = await tomas.client
      .from('iep_meetings').delete().eq('id', meetingId).select('id');
    const survived = await storedLocation(meetingId);
    check(ownerErr?.code === '42501' && survived !== null,
      'even the ORGANIZER cannot hard-delete (compliance record)',
      `code=${ownerErr?.code ?? 'none'} row=${survived ? 'intact' : 'GONE'}`);

    const { error: adminErr } = await marcus.client
      .from('iep_meetings').delete().eq('id', meetingId).select('id');
    check(adminErr?.code === '42501', 'even a site admin cannot hard-delete',
      `code=${adminErr?.code ?? 'none'}`);
  }

  console.log('attendee writes inherit the parent meeting\'s rule:');
  {
    const { data: mine, error: mineErr } = await tomas.client
      .from('iep_meeting_attendees')
      .insert({ meeting_id: meetingId, display_name: 'Interpreter (probe)', attendee_role: 'other' })
      .select();
    check(!mineErr && mine?.length === 1, 'organizer can add an attendee',
      mineErr ? `error=${mineErr.code}` : `rows=${mine?.length}`);

    const { data: theirs, error: theirsErr } = await hannah.client
      .from('iep_meeting_attendees')
      .insert({ meeting_id: meetingId, display_name: 'Uninvited (probe)', attendee_role: 'other' })
      .select();
    check((theirs?.length ?? 0) === 0 && theirsErr?.code === '42501',
      'same-school non-organizer cannot attach an attendee (42501)',
      `code=${theirsErr?.code ?? 'none'} rows=${theirs?.length ?? 0}`);
  }

  console.log('cleanup:');
  {
    // Attendees cascade from the meeting.
    const { data: deleted, error } = await admin
      .from('iep_meetings').delete().eq('id', meetingId).select('id');
    check(!error && (deleted?.length ?? 0) === 1,
      'probe meeting removed via service role', `deleted=${deleted?.length ?? 0}`);
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
