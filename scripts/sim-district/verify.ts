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
  DISTRICT,
  PERSONAS,
  RECORD_TEACHERS,
  SCHOOLS,
  SWEPT_TABLES,
  TOTAL_STUDENTS,
  careCaseId,
} from './manifest';
import {
  Admin,
  assertProjectRef,
  countWhereIn,
  createAdmin,
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
    const ids = sweep.identity === 'user' ? simUserIds : simStudentIds;
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
  }

  console.log(expectEmpty ? 'Orphan scan (expect zero everywhere):\n' : 'Post-seed verification:\n');
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? 'ok  ' : 'FAIL';
    if (!r.ok) failed++;
    console.log(`  [${mark}] ${r.what.padEnd(32)} actual=${String(r.actual).padEnd(6)} expected=${r.expected}`);
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
