/**
 * Sim District teardown — deletes ONLY rows keyed to manifest-owned
 * identities (fixed/derived IDs, SIM- school ids, or sim auth users resolved
 * by @sim.speddy.test email). Children → parents → auth users → org rows.
 *
 * Never issues an unscoped delete (invariant 2). Idempotent: safe to re-run.
 *
 * Usage: npm run sim:teardown -- --yes
 */

import { DISTRICT, SCHOOLS, SWEPT_TABLES } from './manifest';
import {
  Admin,
  assertProjectRef,
  createAdmin,
  deleteWhereIn,
  idsForIdentity,
  requireYesFlag,
  resolveSimAuthUsers,
} from './lib';

const SIM_SCHOOL_IDS = SCHOOLS.map(s => s.id);

export async function teardown(admin: Admin): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  const simUsersByEmail = await resolveSimAuthUsers(admin);
  const simUserIds = [...simUsersByEmail.values()];

  // Collect sim student ids (owned by sim providers OR scoped to sim schools),
  // and the children they link to (SPE-347). `children` is a PARENT of students
  // and has no cascade path from profiles/students — that is the point of the
  // table (a child outlives provider offboarding) — so teardown has to delete
  // it explicitly, AFTER the students that reference it.
  const studentIds = new Set<string>();
  const childIds = new Set<string>();
  if (simUserIds.length > 0) {
    const { data, error } = await admin.from('students').select('id, child_id').in('provider_id', simUserIds);
    if (error) throw new Error(`student lookup by provider failed: ${error.message}`);
    for (const row of data ?? []) { studentIds.add(row.id); if (row.child_id) childIds.add(row.child_id); }
  }
  {
    const { data, error } = await admin.from('students').select('id, child_id').in('school_id', SIM_SCHOOL_IDS);
    if (error) throw new Error(`student lookup by school failed: ${error.message}`);
    for (const row of data ?? []) { studentIds.add(row.id); if (row.child_id) childIds.add(row.child_id); }
  }
  // Also sweep by school AND by district, so a child orphaned by a half-failed
  // prior teardown (its students already gone) is still cleaned up — teardown is
  // idempotent. Both keys are needed: `students.school_id` is nullable, so a
  // child created from such a row carries the district but no school.
  for (const [column, values] of [
    ['school_id', SIM_SCHOOL_IDS],
    ['district_id', [DISTRICT.id]],
  ] as const) {
    const { data, error } = await admin.from('children').select('id').in(column, values as string[]);
    if (error) throw new Error(`children lookup by ${column} failed: ${error.message}`);
    for (const row of data ?? []) childIds.add(row.id);
  }
  const simStudentIds = [...studentIds];
  const simChildIds = [...childIds];

  // 1. Leaf data keyed to students/providers.
  deleted['attendance'] = await deleteWhereIn(admin, 'attendance', 'student_id', simStudentIds);
  deleted['schedule_sessions'] = await deleteWhereIn(admin, 'schedule_sessions', 'provider_id', simUserIds);
  // Groups v2 (SPE-309): session_groups is referenced by schedule_sessions.group_ref
  // (ON DELETE RESTRICT), so it must be deleted AFTER the sessions above.
  deleted['session_groups'] = await deleteWhereIn(admin, 'session_groups', 'provider_id', simUserIds);

  // 2. Swept tables — rows the app created during verification runs (invariant 4).
  for (const sweep of SWEPT_TABLES) {
    const ids = idsForIdentity(sweep.identity, { users: simUserIds, students: simStudentIds });
    deleted[`${sweep.table} (swept)`] = await deleteWhereIn(admin, sweep.table, sweep.column, ids);
  }

  // debug_signup_log: the auth signup triggers log every sim user creation,
  // and a user's first row has NULL metadata. Metadata-tagged rows recover
  // user ids orphaned by earlier teardowns; everything sweeps by user_id.
  {
    const debugIds = new Set(simUserIds);
    const { data, error } = await admin
      .from('debug_signup_log')
      .select('user_id')
      .eq('metadata->>school_district', DISTRICT.name);
    if (error) throw new Error(`debug_signup_log scan failed: ${error.message}`);
    for (const row of data ?? []) if (row.user_id) debugIds.add(row.user_id);
    deleted['debug_signup_log (swept)'] = await deleteWhereIn(admin, 'debug_signup_log', 'user_id', [...debugIds]);
  }

  // district_sis_connections: district-scoped, so it has no user/student/school
  // sweep key. Deleting the sim profiles would only NULL its created_by (the FK
  // is ON DELETE SET NULL), leaving an orphaned row holding encrypted
  // credentials behind — the one kind of residue least acceptable to leave in a
  // shared fixture. Swept explicitly by the sim district id.
  {
    const { error, count } = await admin
      .from('district_sis_connections')
      .delete({ count: 'exact' })
      .eq('district_id', DISTRICT.id);
    if (error) throw new Error(`district_sis_connections sweep failed: ${error.message}`);
    deleted['district_sis_connections (swept)'] = count ?? 0;
  }

  // district_curriculums (SPE-422): district-scoped like the SIS connections
  // above — no user/student/school sweep key, so swept explicitly by the sim
  // district id. (Deleting the district would cascade these, but teardown
  // sweeps children before it ever gets there.)
  {
    const { error, count } = await admin
      .from('district_curriculums')
      .delete({ count: 'exact' })
      .eq('district_id', DISTRICT.id);
    if (error) throw new Error(`district_curriculums sweep failed: ${error.message}`);
    deleted['district_curriculums (swept)'] = count ?? 0;
  }

  // 3. School-scoped schedule scaffolding (school_id match catches all seeded
  //    rows; provider_id match catches any strays created by sim providers).
  for (const table of ['special_activities', 'bell_schedules', 'school_hours'] as const) {
    const bySchool = await deleteWhereIn(admin, table, 'school_id', SIM_SCHOOL_IDS);
    const byProvider = await deleteWhereIn(admin, table, 'provider_id', simUserIds);
    deleted[table] = bySchool + byProvider;
  }
  deleted['user_site_schedules'] = await deleteWhereIn(admin, 'user_site_schedules', 'user_id', simUserIds);

  // 4. CARE — deleting referrals cascades cases/notes/action items/history.
  deleted['care_referrals (cascades case tree)'] = await deleteWhereIn(
    admin, 'care_referrals', 'school_id', SIM_SCHOOL_IDS,
  );

  // 5. Students and their detail rows, then the teacher links, then the children
  //    they all pointed at. The links go AFTER students on purpose (SPE-334):
  //    deleting a link fires the legacy-column mirror, and with the caseload
  //    rows already gone that mirror has nothing to repoint. Deleting children
  //    would cascade the links away anyway; doing it explicitly keeps the
  //    teardown symmetric with the seed and countable.
  deleted['student_details'] = await deleteWhereIn(admin, 'student_details', 'student_id', simStudentIds);
  deleted['students'] = await deleteWhereIn(admin, 'students', 'id', simStudentIds);
  deleted['student_teachers'] = await deleteWhereIn(admin, 'student_teachers', 'child_id', simChildIds);
  deleted['children'] = await deleteWhereIn(admin, 'children', 'id', simChildIds);

  // 6. Teachers, permissions, school assignments.
  deleted['teachers'] = await deleteWhereIn(admin, 'teachers', 'school_id', SIM_SCHOOL_IDS);
  // `admin_permissions` carries TWO foreign keys to profiles — `admin_id` (who
  // holds the permission) and `granted_by` (who gave it). Sweeping only
  // `admin_id` leaves any row a sim admin granted, and that surviving row then
  // blocks the granter's profile delete, which blocks the school delete, and
  // teardown dies on a schools FK error that names neither table.
  deleted['admin_permissions'] = await deleteWhereIn(admin, 'admin_permissions', 'admin_id', simUserIds);
  deleted['admin_permissions (granted_by)'] =
    await deleteWhereIn(admin, 'admin_permissions', 'granted_by', simUserIds);
  deleted['provider_schools'] = await deleteWhereIn(admin, 'provider_schools', 'provider_id', simUserIds);

  // 7. Profiles, then auth users (the runtime-resolved exception in invariant 1).
  deleted['profiles'] = await deleteWhereIn(admin, 'profiles', 'id', simUserIds);
  let authDeleted = 0;
  for (const [email, id] of simUsersByEmail) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`deleteUser failed for ${email}: ${error.message}`);
    authDeleted++;
  }
  deleted['auth.users'] = authDeleted;

  // 8. Org rows last.
  deleted['schools'] = await deleteWhereIn(admin, 'schools', 'id', SIM_SCHOOL_IDS);
  deleted['districts'] = await deleteWhereIn(admin, 'districts', 'id', [DISTRICT.id]);

  return deleted;
}

async function main() {
  assertProjectRef();
  requireYesFlag('sim:teardown');
  const admin = createAdmin();

  console.log(`Tearing down sim district ${DISTRICT.id} (${DISTRICT.name})...`);
  const deleted = await teardown(admin);

  console.log('\nDeleted:');
  for (const [what, count] of Object.entries(deleted)) {
    console.log(`  ${what.padEnd(40)} ${count}`);
  }
  console.log('\nRun `npm run sim:verify -- --expect-empty` to confirm zero leftovers.');
}

// Run only when invoked directly (seed.ts imports teardown()).
if (require.main === module) {
  main().catch(err => {
    console.error('\nTeardown failed:', err.message ?? err);
    process.exit(1);
  });
}
