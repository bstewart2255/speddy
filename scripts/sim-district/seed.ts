/**
 * Sim District seed — full reset (teardown + seed) to the known state defined
 * by manifest.ts. See docs/SIM_DISTRICT.md.
 *
 * Fidelity ladder (spec §8):
 *  1. Auth users via auth.admin.createUser (fires the live handle_new_user
 *     trigger) + the create_profile_for_new_user RPC — the same two-step
 *     sequence the real admin creation routes use — then structured-FK ids
 *     are asserted/patched to manifest values.
 *  2. Domain rows via service-role inserts with manifest-derived UUIDs,
 *     always setting BOTH legacy-text and structured-FK scoping.
 *
 * Usage: npm run sim:reset -- --yes
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SIM_DISTRICT_PASSWORD in .env.local.
 */

import {
  ACCOMMODATION_BANK,
  BELL_PERIODS,
  CARE_REFERRALS,
  CASELOADS,
  DISTRICT,
  EDGE,
  IEP_GOAL_BANK,
  INSTANCE_WINDOW_DAYS,
  PERSONAS,
  RECORD_TEACHERS,
  SCHOOL_DAY,
  SCHOOLS,
  SESSION_SLOTS,
  SIM_EMAIL_DOMAIN,
  SPECIAL_ACTIVITIES,
  TOTAL_STUDENTS,
  WILLOW,
  attendanceId,
  bellScheduleId,
  careActionItemId,
  careCaseId,
  careHistoryId,
  careNoteId,
  careReferralId,
  derivePassword,
  personaEmail,
  providerSchoolId,
  schoolById,
  schoolHoursId,
  schoolYearFor,
  sessionInstanceId,
  sessionMix,
  sessionTemplateId,
  simEmail,
  specialActivityId,
  studentDetailsId,
  studentFullName,
  studentGrade,
  studentId,
  studentInitials,
  studentTeacher,
  teacherRecordId,
  userSiteScheduleId,
  detailsCount,
} from './manifest';
import {
  Admin,
  addDays,
  assertProjectRef,
  assertSentinel,
  bulkInsert,
  createAdmin,
  deleteWhereIn,
  minutesAfter,
  requireEnv,
  requireYesFlag,
  weekdayWindow,
} from './lib';
import { teardown } from './teardown';

const PROVIDER_ROLES = new Set(['resource', 'speech', 'ot', 'sea']);

async function main() {
  assertProjectRef();
  requireYesFlag('sim:reset');
  const secret = requireEnv('SIM_DISTRICT_PASSWORD');
  const admin = createAdmin();
  const seedDate = new Date();
  const schoolYear = schoolYearFor(seedDate);
  const counts: Record<string, number> = {};

  // ---- Reset to zero, then prove it -------------------------------------
  console.log('Step 1/9: teardown (reset to empty namespace)...');
  await teardown(admin);
  const sentinel = await assertSentinel(admin);
  if (sentinel !== 'bootstrap') {
    console.error('Expected an empty sim namespace after teardown; aborting.');
    process.exit(1);
  }

  // ---- Org rows ----------------------------------------------------------
  console.log('Step 2/9: district + schools...');
  {
    const { error } = await admin.from('districts').insert({
      id: DISTRICT.id, name: DISTRICT.name, state_id: DISTRICT.state_id,
      district_type: DISTRICT.district_type, city: DISTRICT.city,
      county: DISTRICT.county, zip: DISTRICT.zip, website: DISTRICT.website,
    });
    if (error) throw new Error(`district insert failed: ${error.message}`);
  }
  counts['schools'] = await bulkInsert(admin, 'schools', SCHOOLS.map(s => ({
    id: s.id, name: s.name, district_id: DISTRICT.id, school_type: s.school_type,
    grade_span_low: s.grade_span_low, grade_span_high: s.grade_span_high,
    city: DISTRICT.city, county: DISTRICT.county, zip: DISTRICT.zip,
  })));

  // ---- Auth users + profiles (real trigger + real RPC) -------------------
  console.log('Step 3/9: auth users + profiles (trigger + RPC path)...');
  const userIds = new Map<string, string>(); // persona key → auth uuid
  for (const p of PERSONAS) {
    const email = personaEmail(p.key);
    const primarySchool = p.schoolIds[0] ? schoolById(p.schoolIds[0]) : null;
    const metadata = {
      full_name: p.fullName,
      role: p.role,
      state: DISTRICT.state_id,
      school_district: DISTRICT.name,
      school_site: primarySchool?.name ?? '',
      works_at_multiple_schools: p.schoolIds.length > 1,
    };
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: derivePassword(secret, email),
      email_confirm: true,
      user_metadata: metadata,
    });
    if (createErr || !created.user) throw new Error(`createUser failed for ${email}: ${createErr?.message}`);
    const id = created.user.id;
    userIds.set(p.key, id);

    const { error: rpcErr } = await admin.rpc('create_profile_for_new_user', {
      user_id: id, user_email: email, user_metadata: metadata,
    });
    if (rpcErr) throw new Error(`create_profile_for_new_user failed for ${email}: ${rpcErr.message}`);

    // Pin structured FK ids to manifest values (never trust the name matcher blindly).
    const { error: patchErr } = await admin.from('profiles').update({
      full_name: p.fullName,
      role: p.role,
      state: DISTRICT.state_id,
      state_id: DISTRICT.state_id,
      district_id: DISTRICT.id,
      school_id: primarySchool?.id ?? null,
      school_district: DISTRICT.name,
      school_site: primarySchool?.name ?? '',
      district_domain: SIM_EMAIL_DOMAIN,
      works_at_multiple_schools: p.schoolIds.length > 1,
    }).eq('id', id);
    if (patchErr) throw new Error(`profile patch failed for ${email}: ${patchErr.message}`);

    const { data: profile, error: checkErr } = await admin
      .from('profiles')
      .select('role, district_id, school_id, district_domain')
      .eq('id', id)
      .single();
    if (checkErr) throw new Error(`profile readback failed for ${email}: ${checkErr.message}`);
    if (profile.role !== p.role || profile.district_id !== DISTRICT.id ||
        profile.school_id !== (primarySchool?.id ?? null) || profile.district_domain !== SIM_EMAIL_DOMAIN) {
      throw new Error(`profile assertion failed for ${email}: ${JSON.stringify(profile)}`);
    }
  }
  counts['auth users + profiles'] = userIds.size;

  // ---- Admin permissions --------------------------------------------------
  console.log('Step 4/9: admin permissions + provider school assignments...');
  const adminPerms = PERSONAS.filter(p => p.role === 'district_admin' || p.role === 'site_admin').map(p => ({
    admin_id: userIds.get(p.key)!,
    role: p.role,
    district_id: DISTRICT.id,
    school_id: p.role === 'site_admin' ? p.schoolIds[0] : null,
    state_id: DISTRICT.state_id,
    granted_by: userIds.get('dana')!,
  }));
  counts['admin_permissions'] = await bulkInsert(admin, 'admin_permissions', adminPerms);

  // ---- provider_schools + user_site_schedules -----------------------------
  const providerSchoolRows: Record<string, unknown>[] = [];
  const siteScheduleRows: Record<string, unknown>[] = [];
  for (const p of PERSONAS.filter(x => PROVIDER_ROLES.has(x.role))) {
    p.schoolIds.forEach((schoolId, idx) => {
      const school = schoolById(schoolId);
      providerSchoolRows.push({
        id: providerSchoolId(p.key, schoolId),
        provider_id: userIds.get(p.key)!,
        school_district: DISTRICT.name,
        school_site: school.name,
        is_primary: idx === 0,
        state_id: DISTRICT.state_id,
        district_id: DISTRICT.id,
        school_id: schoolId,
      });
      for (const day of p.workDays?.[schoolId] ?? []) {
        siteScheduleRows.push({
          id: userSiteScheduleId(p.key, schoolId, day),
          user_id: userIds.get(p.key)!,
          site_id: providerSchoolId(p.key, schoolId),
          day_of_week: day,
        });
      }
    });
  }
  // handle_new_user_schools() fires on auth user creation and inserts a
  // primary-school provider_schools row (random id) for multi-school personas.
  // UNIQUE (provider_id, school_district, school_site) would reject our
  // manifest-keyed rows, and user_site_schedules.site_id needs the manifest
  // ids — so replace the trigger's rows with ours.
  counts['provider_schools (trigger rows removed)'] =
    await deleteWhereIn(admin, 'provider_schools', 'provider_id', [...userIds.values()]);
  counts['provider_schools'] = await bulkInsert(admin, 'provider_schools', providerSchoolRows);
  counts['user_site_schedules'] = await bulkInsert(admin, 'user_site_schedules', siteScheduleRows);

  // ---- Teachers (3 linked + 18 record-only) -------------------------------
  console.log('Step 5/9: teachers...');
  const teacherRows: Record<string, unknown>[] = [];
  for (const p of PERSONAS.filter(x => x.role === 'teacher')) {
    const school = schoolById(p.schoolIds[0]);
    const [firstName, ...rest] = p.fullName.split(' ');
    teacherRows.push({
      id: teacherRecordId(`login:${p.key}`),
      first_name: firstName,
      last_name: rest.join(' '),
      email: personaEmail(p.key),
      school_id: school.id,
      school_site: school.name,
      account_id: userIds.get(p.key)!,
      created_by_admin: true,
      grade_level: p.gradeLevel,
    });
  }
  for (const t of RECORD_TEACHERS) {
    const school = schoolById(t.schoolId);
    teacherRows.push({
      id: teacherRecordId(t.key),
      first_name: t.firstName,
      last_name: t.lastName,
      email: simEmail(`teacher.${t.key}`),
      school_id: school.id,
      school_site: school.name,
      account_id: null,
      created_by_admin: true,
      grade_level: t.gradeLevel,
    });
  }
  counts['teachers'] = await bulkInsert(admin, 'teachers', teacherRows);

  // ---- Students + details --------------------------------------------------
  console.log('Step 6/9: students + student_details...');
  const studentRows: Record<string, unknown>[] = [];
  const detailRows: Record<string, unknown>[] = [];
  for (const rule of CASELOADS) {
    const school = schoolById(rule.schoolId);
    const nDetails = detailsCount(rule);
    for (let i = 0; i < rule.count; i++) {
      const id = studentId(rule.providerKey, rule.schoolId, i);
      const grade = studentGrade(rule, i);
      const mix = sessionMix(i);
      const teacher = studentTeacher(rule, i);
      studentRows.push({
        id,
        provider_id: userIds.get(rule.providerKey)!,
        initials: studentInitials(rule.providerKey, rule.schoolId, i),
        grade_level: grade,
        teacher_name: teacher.teacherName,
        teacher_id: teacher.teacherRowId,
        sessions_per_week: mix.sessionsPerWeek,
        minutes_per_session: mix.minutes,
        school_site: school.name,
        school_district: DISTRICT.name,
        state_id: DISTRICT.state_id,
        district_id: DISTRICT.id,
        school_id: school.id,
      });
      if (i < nDetails) {
        const name = studentFullName(rule.providerKey, rule.schoolId, i);
        const gradeNum = grade === 'K' ? 0 : parseInt(grade, 10);
        detailRows.push({
          id: studentDetailsId(id),
          student_id: id,
          first_name: name.firstName,
          last_name: name.lastName,
          date_of_birth: `${seedDate.getUTCFullYear() - 6 - gradeNum}-0${(i % 9) + 1}-1${i % 9}`,
          district_id: DISTRICT.id,
          iep_goals: [
            IEP_GOAL_BANK[i % IEP_GOAL_BANK.length],
            IEP_GOAL_BANK[(i + 2) % IEP_GOAL_BANK.length],
          ],
          accommodations: [
            ACCOMMODATION_BANK[i % ACCOMMODATION_BANK.length],
            ACCOMMODATION_BANK[(i + 1) % ACCOMMODATION_BANK.length],
          ],
          upcoming_iep_date: addDays(seedDate, (i * 17) % 300 + 7),
          upcoming_triennial_date: addDays(seedDate, (i * 37) % 900 + 30),
          goals_iep_date: i % 4 === 0 ? addDays(seedDate, -220) : addDays(seedDate, -30),
        });
      }
    }
  }
  counts['students'] = await bulkInsert(admin, 'students', studentRows);
  counts['student_details'] = await bulkInsert(admin, 'student_details', detailRows);

  // ---- Bell schedules, school hours, special activities -------------------
  console.log('Step 7/9: bell schedules, school hours, special activities...');
  const PRIMARY_RSP: Record<string, string> = { [WILLOW]: 'rachel', 'SIM-S002': 'alicia', 'SIM-S003': 'derek' };
  const bellRows: Record<string, unknown>[] = [];
  const hoursRows: Record<string, unknown>[] = [];
  const activityRows: Record<string, unknown>[] = [];
  for (const school of SCHOOLS.filter(s => !s.isSecondary)) {
    const rspKey = PRIMARY_RSP[school.id];
    const rspId = userIds.get(rspKey)!;
    for (const grade of school.studentGrades) {
      for (let day = 1; day <= 5; day++) {
        for (const period of BELL_PERIODS) {
          bellRows.push({
            id: bellScheduleId(school.id, grade, day, period.name),
            provider_id: rspId,
            grade_level: grade,
            day_of_week: day,
            start_time: period.start,
            end_time: period.end,
            period_name: period.name,
            school_site: school.name,
            state_id: DISTRICT.state_id,
            district_id: DISTRICT.id,
            school_id: school.id,
            school_year: schoolYear,
            created_by_id: rspId,
            created_by_role: 'provider', // CHECK: 'provider' | 'site_admin'
          });
        }
      }
    }
    SPECIAL_ACTIVITIES.forEach((activity, idx) => {
      const pool = RECORD_TEACHERS.filter(t => t.schoolId === school.id);
      const t = pool[idx % pool.length];
      activityRows.push({
        id: specialActivityId(school.id, t.key, activity),
        provider_id: rspId,
        teacher_name: `${t.firstName} ${t.lastName}`,
        teacher_id: teacherRecordId(t.key),
        day_of_week: (idx % 5) + 1,
        start_time: '13:15',
        end_time: '14:00',
        activity_name: activity,
        school_site: school.name,
        school_id: school.id,
        district_id: DISTRICT.id,
        school_year: schoolYear,
        created_by_id: rspId,
        created_by_role: 'provider',
      });
    });
  }
  for (const p of PERSONAS.filter(x => ['resource', 'speech', 'ot'].includes(x.role))) {
    for (const schoolId of p.schoolIds) {
      const school = schoolById(schoolId);
      if (school.isSecondary) continue;
      for (const grade of school.studentGrades) {
        for (let day = 1; day <= 5; day++) {
          hoursRows.push({
            id: schoolHoursId(p.key, schoolId, grade, day),
            provider_id: userIds.get(p.key)!,
            school_site: school.name,
            school_id: schoolId,
            day_of_week: day,
            grade_level: grade,
            start_time: SCHOOL_DAY.start,
            end_time: SCHOOL_DAY.end,
          });
        }
      }
    }
  }
  counts['bell_schedules'] = await bulkInsert(admin, 'bell_schedules', bellRows);
  counts['school_hours'] = await bulkInsert(admin, 'school_hours', hoursRows);
  counts['special_activities'] = await bulkInsert(admin, 'special_activities', activityRows);

  // ---- Sessions + attendance (elementary sites only — spec §7) ------------
  console.log('Step 8/9: session templates + instances + attendance...');
  const window = weekdayWindow(seedDate, INSTANCE_WINDOW_DAYS);
  const sessionRows: Record<string, unknown>[] = [];
  const attendanceRows: Record<string, unknown>[] = [];
  const leahId = userIds.get('leah')!;

  // Groups v2 (SPE-309): the durable session_groups record behind Reading Group A.
  // Must exist before the grouped schedule_sessions that group_ref to it.
  const rachelId = userIds.get('rachel')!;
  const { error: groupErr } = await admin.from('session_groups').insert({
    id: EDGE.sessionGroupId,
    provider_id: rachelId,
    delivered_by: 'provider',
    name: EDGE.groupName,
    color: EDGE.groupColor,
  });
  if (groupErr) throw new Error(`session_groups insert failed: ${groupErr.message}`);
  counts['session_groups'] = 1;
  for (const rule of CASELOADS) {
    const school = schoolById(rule.schoolId);
    if (school.isSecondary) continue;
    const providerId = userIds.get(rule.providerKey)!;
    const isRachel = rule.providerKey === 'rachel' && rule.schoolId === WILLOW;
    for (let i = 0; i < rule.count; i++) {
      if (isRachel && i === EDGE.zeroSessionsIndex) continue; // unscheduled-alert student
      const sid = studentId(rule.providerKey, rule.schoolId, i);
      const mix = sessionMix(i);
      const isGrouped = isRachel && (EDGE.groupIndexes as readonly number[]).includes(i);
      const isDelegated = isRachel && i === EDGE.seaDelegatedIndex;
      for (let k = 0; k < mix.sessionsPerWeek; k++) {
        const templateId = sessionTemplateId(sid, k);
        const dayOfWeek = isGrouped && k === 0 ? 2 : ((i + k * 2) % 5) + 1;
        const start = isGrouped && k === 0 ? '10:30' : SESSION_SLOTS[(i + k) % SESSION_SLOTS.length];
        const end = minutesAfter(start, mix.minutes);
        const base = {
          provider_id: providerId,
          student_id: sid,
          service_type: rule.serviceType,
          day_of_week: dayOfWeek,
          start_time: start,
          end_time: end,
          status: 'active',
          delivered_by: isDelegated ? 'sea' : 'provider',
          assigned_to_sea_id: isDelegated ? leahId : null,
          group_id: isGrouped && k === 0 ? EDGE.groupId : null,
          group_name: isGrouped && k === 0 ? EDGE.groupName : null,
          group_color: isGrouped && k === 0 ? EDGE.groupColor : null,
          group_ref: isGrouped && k === 0 ? EDGE.sessionGroupId : null,
          manually_placed: isRachel && i === EDGE.manuallyPlacedIndex && k === 0,
        };
        sessionRows.push({
          ...base,
          id: templateId,
          is_template: true,
          session_date: null,
          template_id: null,
          is_completed: false, // NOT NULL — set explicitly on templates
          student_absent: false,
          outside_schedule_conflict: false,
        });
        for (const d of window.filter(w => w.dayOfWeek === dayOfWeek)) {
          const instanceId = sessionInstanceId(templateId, d.iso);
          const completed = d.inPast && (i + k + d.dayOfWeek) % 5 !== 0;
          sessionRows.push({
            ...base,
            id: instanceId,
            is_template: false,
            template_id: templateId,
            session_date: d.iso,
            student_absent: false,
            outside_schedule_conflict: false,
            is_completed: completed,
            completed_at: completed ? `${d.iso}T22:00:00Z` : null,
            completed_by: completed ? providerId : null,
            session_notes: completed && (i + k) % 3 === 0 ? 'Worked on IEP goal focus; good engagement.' : null,
          });
          // Attendance for the past week, Rachel + Alicia caseloads.
          const inPastWeek = d.inPast && d.iso >= addDays(seedDate, -7);
          if (inPastWeek && (isRachel || rule.providerKey === 'alicia')) {
            const present = (i + d.dayOfWeek) % 7 !== 0;
            attendanceRows.push({
              id: attendanceId(instanceId),
              session_id: instanceId,
              student_id: sid,
              session_date: d.iso,
              present,
              absence_reason: present ? null : 'Illness',
              marked_by: providerId,
            });
          }
        }
      }
    }
  }
  counts['schedule_sessions'] = await bulkInsert(admin, 'schedule_sessions', sessionRows);
  counts['attendance'] = await bulkInsert(admin, 'attendance', attendanceRows);

  // ---- CARE (both lanes, full lifecycle states — spec §7) ------------------
  console.log('Step 9/9: CARE referrals + case trees...');
  let careCount = 0;
  for (const spec of CARE_REFERRALS) {
    const school = schoolById(spec.schoolId);
    const referrerId = userIds.get(spec.referrerKey)!;
    const submittedAt = `${addDays(seedDate, -10)}T17:00:00Z`;
    const { error: refErr } = await admin.from('care_referrals').insert({
      id: careReferralId(spec.key),
      student_name: spec.studentName,
      grade: spec.grade,
      referring_user_id: referrerId,
      referral_reason: spec.reason,
      category: spec.category,
      school_id: school.id,
      district_id: DISTRICT.id,
      state_id: DISTRICT.state_id,
      status: spec.status,
      referral_source: spec.referralSource,
      submitted_at: submittedAt,
      request_received_date: spec.requestReceivedDaysAgo != null ? addDays(seedDate, -spec.requestReceivedDaysAgo) : null,
      requested_by: spec.referralSource === 'parent_written_request' ? 'Parent/guardian' : null,
      teacher_name: spec.teacherRecordKey === 'login:nora' ? 'Nora Ellison-Sim'
        : spec.teacherRecordKey === 'login:fatima' ? 'Fatima Haddad-Sim' : null,
      deleted_at: spec.softDeleted ? `${addDays(seedDate, -2)}T18:00:00Z` : null,
    });
    if (refErr) throw new Error(`care_referrals insert failed (${spec.key}): ${refErr.message}`);
    careCount++;

    if (spec.withCase) {
      const requestReceived = spec.requestReceivedDaysAgo != null ? addDays(seedDate, -spec.requestReceivedDaysAgo) : null;
      // current_disposition CHECK allows only enum-like codes
      // (20260107_add_close_case_disposition.sql): teacher_consult,
      // wait_for_report_card, wait_for_assessment_data, intervention,
      // counseling_referral, schedule_sst, send_ap, move_to_initials, close_case.
      const disposition = spec.status === 'closed' ? 'close_case'
        : spec.status === 'initial' ? 'send_ap'
        : spec.status === 'active' ? 'intervention'
        : null;
      const { error: caseErr } = await admin.from('care_cases').insert({
        id: careCaseId(spec.key),
        referral_id: careReferralId(spec.key),
        assigned_to: spec.actionItem ? userIds.get(spec.actionItem.assigneeKey)! : referrerId,
        follow_up_date: spec.status === 'closed' ? null : addDays(seedDate, 14),
        current_disposition: disposition,
        ap_due_date: requestReceived ? addDays(new Date(`${requestReceived}T00:00:00Z`), 15) : null,
      });
      if (caseErr) throw new Error(`care_cases insert failed (${spec.key}): ${caseErr.message}`);

      for (const [idx, note] of (spec.notes ?? []).entries()) {
        const { error } = await admin.from('care_meeting_notes').insert({
          id: careNoteId(spec.key, idx),
          case_id: careCaseId(spec.key),
          created_by: referrerId,
          note_text: note,
        });
        if (error) throw new Error(`care_meeting_notes insert failed (${spec.key}): ${error.message}`);
      }
      if (spec.actionItem) {
        const { error } = await admin.from('care_action_items').insert({
          id: careActionItemId(spec.key),
          case_id: careCaseId(spec.key),
          description: spec.actionItem.description,
          assignee_id: userIds.get(spec.actionItem.assigneeKey)!,
          due_date: addDays(seedDate, 7),
        });
        if (error) throw new Error(`care_action_items insert failed (${spec.key}): ${error.message}`);
      }
      for (const [idx, status] of (spec.statusHistory ?? []).entries()) {
        const { error } = await admin.from('care_case_status_history').insert({
          id: careHistoryId(spec.key, status),
          case_id: careCaseId(spec.key),
          changed_by: referrerId,
          status,
          created_at: `${addDays(seedDate, -9 + idx * 3)}T17:30:00Z`,
        });
        if (error) throw new Error(`care_case_status_history insert failed (${spec.key}): ${error.message}`);
      }
    }
  }
  counts['care_referrals (+case trees)'] = careCount;

  // ---- Summary -------------------------------------------------------------
  console.log(`\nSim district seeded (school year ${schoolYear}, window ±${INSTANCE_WINDOW_DAYS} days of ${seedDate.toISOString().slice(0, 10)}).`);
  console.log(`Students expected: ${TOTAL_STUDENTS}\n`);
  for (const [what, n] of Object.entries(counts)) console.log(`  ${what.padEnd(32)} ${n}`);
  console.log('\nPersona logins (passwords derive from SIM_DISTRICT_PASSWORD — see manifest.derivePassword):');
  for (const p of PERSONAS) {
    console.log(`  ${p.role.padEnd(15)} ${personaEmail(p.key)}`);
  }
  console.log('\nRun `npm run sim:verify` to check seeded state.');
}

main().catch(err => {
  console.error('\nSeed failed:', err.message ?? err);
  console.error('The namespace may be partial — run `npm run sim:teardown -- --yes`, then reseed.');
  process.exit(1);
});
