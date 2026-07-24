/**
 * Sim District verify — READ-ONLY. Two modes:
 *
 *   npm run sim:verify                  → post-seed sanity: seeded counts match
 *                                         the manifest's expectations.
 *   npm run sim:verify -- --expect-empty → post-teardown orphan scan: zero rows
 *                                         referencing any sim identity, across
 *                                         seeded AND swept tables (invariant 7).
 *
 * Exits non-zero on any failure. Never writes.
 */

import {
  ALL_SIM_EMAILS,
  CARE_REFERRALS,
  DECLARED_UNSEEDED_TABLES,
  DISTRICT,
  PERSONAS,
  RECORD_TEACHERS,
  SCHOOLS,
  SEEDED_TABLES,
  SESSION_GROUPS,
  SWEPT_TABLES,
  TOTAL_STUDENTS,
  careCaseId,
} from './manifest';
import {
  Admin,
  assertProjectRef,
  countWhereIn,
  createAdmin,
  idsForIdentity,
  listPublicRelations,
  resolveSimAuthUsers,
} from './lib';

const SIM_SCHOOL_IDS = SCHOOLS.map(s => s.id);

interface CheckResult {
  what: string;
  actual: number;
  expected: string;
  ok: boolean;
}

async function collectCounts(admin: Admin) {
  const simUsers = await resolveSimAuthUsers(admin);
  const simUserIds = [...simUsers.values()];

  const studentIds = new Set<string>();
  {
    const { data, error } = await admin.from('students').select('id').in('school_id', SIM_SCHOOL_IDS);
    if (error) throw new Error(`student scan failed: ${error.message}`);
    for (const row of data ?? []) studentIds.add(row.id);
  }
  if (simUserIds.length > 0) {
    const { data, error } = await admin.from('students').select('id').in('provider_id', simUserIds);
    if (error) throw new Error(`student scan by provider failed: ${error.message}`);
    for (const row of data ?? []) studentIds.add(row.id);
  }
  const simStudentIds = [...studentIds];
  const careCaseIds = CARE_REFERRALS.filter(c => c.withCase).map(c => careCaseId(c.key));

  const counts: Record<string, number> = {
    'auth users (@sim domain)': simUsers.size,
    districts: await countWhereIn(admin, 'districts', 'id', [DISTRICT.id]),
    schools: await countWhereIn(admin, 'schools', 'id', SIM_SCHOOL_IDS),
    profiles: simUserIds.length > 0 ? await countWhereIn(admin, 'profiles', 'id', simUserIds) : 0,
    admin_permissions: simUserIds.length > 0 ? await countWhereIn(admin, 'admin_permissions', 'admin_id', simUserIds) : 0,
    provider_schools: simUserIds.length > 0 ? await countWhereIn(admin, 'provider_schools', 'provider_id', simUserIds) : 0,
    user_site_schedules: simUserIds.length > 0 ? await countWhereIn(admin, 'user_site_schedules', 'user_id', simUserIds) : 0,
    teachers: await countWhereIn(admin, 'teachers', 'school_id', SIM_SCHOOL_IDS),
    students: simStudentIds.length,
    student_details: simStudentIds.length > 0 ? await countWhereIn(admin, 'student_details', 'student_id', simStudentIds) : 0,
    bell_schedules: await countWhereIn(admin, 'bell_schedules', 'school_id', SIM_SCHOOL_IDS),
    school_hours: await countWhereIn(admin, 'school_hours', 'school_id', SIM_SCHOOL_IDS),
    special_activities: await countWhereIn(admin, 'special_activities', 'school_id', SIM_SCHOOL_IDS),
    schedule_sessions: simUserIds.length > 0 ? await countWhereIn(admin, 'schedule_sessions', 'provider_id', simUserIds) : 0,
    attendance: simStudentIds.length > 0 ? await countWhereIn(admin, 'attendance', 'student_id', simStudentIds) : 0,
    care_referrals: await countWhereIn(admin, 'care_referrals', 'school_id', SIM_SCHOOL_IDS),
    care_cases: await countWhereIn(admin, 'care_cases', 'id', careCaseIds),
    care_meeting_notes: await countWhereIn(admin, 'care_meeting_notes', 'case_id', careCaseIds),
    care_action_items: await countWhereIn(admin, 'care_action_items', 'case_id', careCaseIds),
    care_case_status_history: await countWhereIn(admin, 'care_case_status_history', 'case_id', careCaseIds),
  };
  for (const sweep of SWEPT_TABLES) {
    const ids = idsForIdentity(sweep.identity, { users: simUserIds, students: simStudentIds });
    counts[`${sweep.table} (swept)`] = ids.length > 0 ? await countWhereIn(admin, sweep.table, sweep.column, ids) : 0;
  }

  // debug_signup_log rows from the signup triggers, tagged to the sim district
  // via metadata (NULL-metadata rows are swept by user_id in teardown but are
  // not attributable here once the users are gone).
  {
    const { count, error } = await admin
      .from('debug_signup_log')
      .select('*', { count: 'exact', head: true })
      .eq('metadata->>school_district', DISTRICT.name);
    if (error) throw new Error(`debug_signup_log scan failed: ${error.message}`);
    counts['debug_signup_log (sim-tagged)'] = count ?? 0;
  }

  // Groups v2 (SPE-315): shape of the seeded group fixture, all scoped to sim
  // providers. Every fact is 0 in the empty (--expect-empty) state, so these
  // keys satisfy the orphan scan too. Facts are derived in JS from the grouped
  // rows (distinct DOW per group, distinct group_ref per slot) rather than a
  // GROUP BY, keeping the read-only admin-client pattern.
  {
    let simGroups = 0;
    let seaRunGroups = 0;
    let multiDayGroups = 0;
    let splitSlots = 0;
    let seaRunSessions = 0;
    let danglingRefs = 0;
    let groupsUnder2 = 0;
    if (simUserIds.length > 0) {
      const { data: groups, error: gErr } = await admin
        .from('session_groups')
        .select('id, delivered_by')
        .in('provider_id', simUserIds);
      if (gErr) throw new Error(`session_groups scan failed: ${gErr.message}`);
      const simGroupIds = new Set<string>((groups ?? []).map(g => g.id));
      const seaGroupIds = new Set<string>((groups ?? []).filter(g => g.delivered_by === 'sea').map(g => g.id));
      simGroups = simGroupIds.size;
      seaRunGroups = seaGroupIds.size;

      const { data: grouped, error: sErr } = await admin
        .from('schedule_sessions')
        .select('provider_id, day_of_week, start_time, group_ref, delivered_by, assigned_to_sea_id, student_id')
        .in('provider_id', simUserIds)
        .not('group_ref', 'is', null);
      if (sErr) throw new Error(`grouped session scan failed: ${sErr.message}`);

      const daysByGroup = new Map<string, Set<number>>();
      const refsBySlot = new Map<string, Set<string>>();
      const membersByGroup = new Map<string, Set<string>>();
      for (const s of grouped ?? []) {
        const ref = s.group_ref as string;
        if (!simGroupIds.has(ref)) danglingRefs++;
        let gdays = daysByGroup.get(ref);
        if (!gdays) { gdays = new Set(); daysByGroup.set(ref, gdays); }
        gdays.add(s.day_of_week);
        const slot = `${s.provider_id}|${s.day_of_week}|${s.start_time}`;
        let srefs = refsBySlot.get(slot);
        if (!srefs) { srefs = new Set(); refsBySlot.set(slot, srefs); }
        srefs.add(ref);
        if (s.student_id) {
          let gm = membersByGroup.get(ref);
          if (!gm) { gm = new Set(); membersByGroup.set(ref, gm); }
          gm.add(s.student_id as string);
        }
        if (seaGroupIds.has(ref) && s.delivered_by === 'sea' && s.assigned_to_sea_id) seaRunSessions++;
      }
      multiDayGroups = [...daysByGroup.values()].filter(days => days.size >= 2).length;
      splitSlots = [...refsBySlot.values()].filter(refs => refs.size >= 2).length;
      // Every seeded group must keep >=2 distinct members — guards against a
      // future fixture mis-edit silently dropping a member while the multi-day /
      // split / sea-run shape checks stay satisfied via the surviving member.
      groupsUnder2 = [...simGroupIds].filter(id => (membersByGroup.get(id)?.size ?? 0) < 2).length;
    }
    counts['session_groups (sim)'] = simGroups;
    counts['session_groups (sea-run)'] = seaRunGroups;
    counts['group multi-day (>=2 DOW)'] = multiDayGroups;
    counts['group split-slot (>=2 refs)'] = splitSlots;
    counts['sea-run grouped sessions'] = seaRunSessions;
    counts['dangling group_ref'] = danglingRefs;
    counts['groups with < 2 members'] = groupsUnder2;
  }
  return counts;
}

async function main() {
  assertProjectRef();
  const expectEmpty = process.argv.includes('--expect-empty');
  const admin = createAdmin();
  const counts = await collectCounts(admin);
  const results: CheckResult[] = [];

  if (expectEmpty) {
    for (const [what, actual] of Object.entries(counts)) {
      results.push({ what, actual, expected: '0', ok: actual === 0 });
    }
  } else {
    const expect = (what: string, predicate: (n: number) => boolean, expected: string) => {
      const actual = counts[what] ?? 0;
      results.push({ what, actual, expected, ok: predicate(actual) });
    };
    const teacherLogins = PERSONAS.filter(p => p.role === 'teacher').length;
    expect('auth users (@sim domain)', n => n === ALL_SIM_EMAILS.length, String(ALL_SIM_EMAILS.length));
    expect('districts', n => n === 1, '1');
    expect('schools', n => n === SCHOOLS.length, String(SCHOOLS.length));
    expect('profiles', n => n === PERSONAS.length, String(PERSONAS.length));
    expect('admin_permissions', n => n === 6, '6');
    expect('teachers', n => n === RECORD_TEACHERS.length + teacherLogins, String(RECORD_TEACHERS.length + teacherLogins));
    expect('students', n => n === TOTAL_STUDENTS, String(TOTAL_STUDENTS));
    expect('student_details', n => n > 0, '> 0');
    expect('bell_schedules', n => n > 0, '> 0');
    expect('school_hours', n => n > 0, '> 0');
    expect('special_activities', n => n === 9, '9');
    expect('schedule_sessions', n => n > 0, '> 0');
    expect('attendance', n => n > 0, '> 0');
    expect('care_referrals', n => n === CARE_REFERRALS.length, String(CARE_REFERRALS.length));
    const withCase = CARE_REFERRALS.filter(c => c.withCase);
    const expectedNotes = withCase.reduce((n, c) => n + (c.notes?.length ?? 0), 0);
    const expectedItems = withCase.filter(c => c.actionItem).length;
    const expectedHistory = withCase.reduce((n, c) => n + (c.statusHistory?.length ?? 0), 0);
    expect('care_cases', n => n === withCase.length, String(withCase.length));
    expect('care_meeting_notes', n => n === expectedNotes, String(expectedNotes));
    expect('care_action_items', n => n === expectedItems, String(expectedItems));
    expect('care_case_status_history', n => n === expectedHistory, String(expectedHistory));
    expect('provider_schools', n => n > 0, '> 0');
    expect('user_site_schedules', n => n > 0, '> 0');
    // Signup triggers tag their log rows with the sim district name via
    // metadata; a zero here would mean the real-path trigger never fired.
    expect('debug_signup_log (sim-tagged)', n => n > 0, '> 0');
    // Groups v2 (SPE-315) fixture shape: 3 sim groups (1 SEA-run), exactly one
    // multi-day group (Reading Group A on Tue+Thu), exactly one split slot
    // (Groups A + B share Tue 10:30), SEA-run cluster sessions delegated to
    // Leah, and no schedule_sessions.group_ref that fails to resolve to a group.
    const seaRun = SESSION_GROUPS.filter(g => g.deliveredBy === 'sea').length;
    expect('session_groups (sim)', n => n === SESSION_GROUPS.length, String(SESSION_GROUPS.length));
    expect('session_groups (sea-run)', n => n === seaRun, String(seaRun));
    expect('group multi-day (>=2 DOW)', n => n === 1, '1');
    expect('group split-slot (>=2 refs)', n => n === 1, '1');
    expect('sea-run grouped sessions', n => n > 0, '> 0');
    expect('dangling group_ref', n => n === 0, '0');
    expect('groups with < 2 members', n => n === 0, '0');
  }

  // Coverage: every public relation must be classified in the manifest
  // (seeded, swept, or declared-unseeded) so schema drift surfaces at every
  // reset instead of mid-verification-run (spec §7). Runs in both modes.
  const declared = new Set<string>([
    ...SEEDED_TABLES,
    ...SWEPT_TABLES.map(s => s.table),
    ...DECLARED_UNSEEDED_TABLES,
  ]);
  let unaccounted: string[] = [];
  try {
    unaccounted = (await listPublicRelations()).filter(t => !declared.has(t)).sort();
    results.push({
      what: 'schema coverage (manifest)',
      actual: unaccounted.length,
      expected: '0 unclassified',
      ok: unaccounted.length === 0,
    });
  } catch (err) {
    // A failed schema fetch must not discard the count report above it.
    results.push({ what: 'schema coverage (manifest)', actual: -1, expected: '0 unclassified', ok: false });
    console.error(`Schema coverage check failed to run: ${(err as Error).message}`);
  }

  console.log(expectEmpty ? 'Orphan scan (expect zero everywhere):\n' : 'Post-seed verification:\n');
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? 'ok  ' : 'FAIL';
    if (!r.ok) failed++;
    console.log(`  [${mark}] ${r.what.padEnd(32)} actual=${String(r.actual).padEnd(6)} expected=${r.expected}`);
  }
  if (unaccounted.length > 0) {
    console.error(
      `\nUnclassified public relations — add each to SEEDED_TABLES, SWEPT_TABLES, or ` +
        `DECLARED_UNSEEDED_TABLES in scripts/sim-district/manifest.ts (spec §7):\n  ${unaccounted.join(', ')}`,
    );
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main().catch(err => {
  console.error('\nVerify failed:', err.message ?? err);
  process.exit(1);
});
