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
  requireYesFlag,
  resolveSimAuthUsers,
} from './lib';

const SIM_SCHOOL_IDS = SCHOOLS.map(s => s.id);

export async function teardown(admin: Admin): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  const simUsersByEmail = await resolveSimAuthUsers(admin);
  const simUserIds = [...simUsersByEmail.values()];

  // Collect sim student ids (owned by sim providers OR scoped to sim schools).
  const studentIds = new Set<string>();
  if (simUserIds.length > 0) {
    const { data, error } = await admin.from('students').select('id').in('provider_id', simUserIds);
    if (error) throw new Error(`student lookup by provider failed: ${error.message}`);
    for (const row of data ?? []) studentIds.add(row.id);
  }
  {
    const { data, error } = await admin.from('students').select('id').in('school_id', SIM_SCHOOL_IDS);
    if (error) throw new Error(`student lookup by school failed: ${error.message}`);
    for (const row of data ?? []) studentIds.add(row.id);
  }
  const simStudentIds = [...studentIds];

  // 1. Leaf data keyed to students/providers.
  deleted['attendance'] = await deleteWhereIn(admin, 'attendance', 'student_id', simStudentIds);
  deleted['schedule_sessions'] = await deleteWhereIn(admin, 'schedule_sessions', 'provider_id', simUserIds);

  // 2. Swept tables — rows the app created during verification runs (invariant 4).
  for (const sweep of SWEPT_TABLES) {
    const ids = sweep.identity === 'user' ? simUserIds : simStudentIds;
    deleted[`${sweep.table} (swept)`] = await deleteWhereIn(admin, sweep.table, sweep.column, ids);
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

  // 5. Students and their detail rows.
  deleted['student_details'] = await deleteWhereIn(admin, 'student_details', 'student_id', simStudentIds);
  deleted['students'] = await deleteWhereIn(admin, 'students', 'id', simStudentIds);

  // 6. Teachers, permissions, school assignments.
  deleted['teachers'] = await deleteWhereIn(admin, 'teachers', 'school_id', SIM_SCHOOL_IDS);
  deleted['admin_permissions'] = await deleteWhereIn(admin, 'admin_permissions', 'admin_id', simUserIds);
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
