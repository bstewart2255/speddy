/**
 * Reading and writing one provider's side of the district roster (SPE-447,
 * slice 2).
 *
 * TWO CLIENTS ON PURPOSE, and the split is the security story:
 *
 *   * The caller's OWN session decides what they may reach. Their schools come
 *     from `user_accessible_school_ids()` called as them, and every write —
 *     claiming, and accepting a roster value onto their own row — goes through
 *     their session so RLS and `claim_roster_children`'s guards apply. A
 *     service client would make `auth.uid()` null and turn those guards off.
 *   * The service client is used for ONE read only: the roster itself.
 *     `children_select` is an EXISTS over `students`, so a child nobody serves
 *     is invisible to every provider — the unclaimed students this whole
 *     feature is about cannot be read any other way. That read is bounded by
 *     the school ids the caller's own session just returned.
 */

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { updateExistingSessionsForStudent } from '@/lib/scheduling/session-requirement-sync';
import { parseDistrictGoals, parseDistrictServices } from './claim-plan';
import type { ClaimPlan, ProviderStudent, RosterChild, RosterFieldKey } from './claim-plan';
import type { SchoolLevelInput } from '@/lib/school-helpers';

const log = logger.child({ module: 'provider-roster-claim-io' });

/** Chunk `.in()` filters so ids cannot overflow the request URL. */
const IN_CHUNK = 100;

/** PostgREST caps a select at max_rows, so every roster read pages to the end. */
const DB_PAGE = 1000;

function chunked<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

export interface ProviderRosterContext {
  schoolIds: string[];
  rosterChildren: RosterChild[];
  myStudents: ProviderStudent[];
  /** The caller's own name, matched against the roster's case-manager text. */
  myName: string | null;
  /** The caller's role — decides which district services/goals are theirs. */
  myRole: string | null;
  /** Level info per school id, for the secondary-resource weekly bucket. */
  schoolLevels: Record<string, SchoolLevelInput | undefined>;
}

/**
 * Everything the claim planner compares: the roster at the caller's schools,
 * and the caller's own caseload.
 */
export async function loadProviderRosterContext(
  userId: string,
): Promise<ProviderRosterContext> {
  const session = await createClient();

  // Their own name and role, through their session (`profiles_view_own`). A
  // failure here must not stop the offers — the name only costs the
  // pre-selection, and the role only costs the minutes/goals extras.
  const { data: me } = await session
    .from('profiles')
    .select('full_name, role')
    .eq('id', userId)
    .maybeSingle();
  const myName = (me?.full_name as string | null) ?? null;
  const myRole = (me?.role as string | null) ?? null;

  // The caller's own schools, resolved BY the caller — the same function
  // `claim_roster_children` checks against, so the screen can never offer a
  // student the database would refuse.
  const { data: schoolRows, error: schoolsError } = await session.rpc(
    'user_accessible_school_ids',
  );
  if (schoolsError) throw new Error(`Could not read your schools: ${schoolsError.message}`);
  const schoolIds = [
    ...new Set(
      ((schoolRows ?? []) as { school_id: string | null }[])
        .map((r) => (r.school_id == null ? '' : String(r.school_id)))
        .filter((id) => id !== ''),
    ),
  ];

  // The caller's own caseload, through their own session: `students_select`
  // and `student_details`' policies decide what comes back.
  const { data: mine, error: mineError } = await session
    .from('students')
    .select(
      'id, child_id, initials, grade_level, district_student_id, sessions_per_week, ' +
        'minutes_per_session, ' +
        'student_details(first_name, last_name, date_of_birth, upcoming_iep_date, ' +
        'upcoming_triennial_date, accommodations, testing_accommodations, iep_goals)',
    )
    .eq('provider_id', userId);
  if (mineError) throw new Error(`Could not read your students: ${mineError.message}`);

  const stringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

  const myStudents: ProviderStudent[] = ((mine ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    // PostgREST returns an embedded one-to-many as an array.
    const detailsRaw = row.student_details;
    const details = (Array.isArray(detailsRaw) ? detailsRaw[0] : detailsRaw) as
      | Record<string, unknown>
      | undefined;
    return {
      studentId: String(row.id),
      childId: (row.child_id as string | null) ?? null,
      initials: String(row.initials ?? ''),
      firstName: (details?.first_name as string | null) ?? null,
      lastName: (details?.last_name as string | null) ?? null,
      gradeLevel: String(row.grade_level ?? ''),
      districtStudentId: (row.district_student_id as string | null) ?? null,
      dateOfBirth: (details?.date_of_birth as string | null) ?? null,
      upcomingIepDate: (details?.upcoming_iep_date as string | null) ?? null,
      upcomingTriennialDate: (details?.upcoming_triennial_date as string | null) ?? null,
      sessionsPerWeek: (row.sessions_per_week as number | null) ?? null,
      minutesPerSession: (row.minutes_per_session as number | null) ?? null,
      accommodations: stringArray(details?.accommodations),
      testingAccommodations: stringArray(details?.testing_accommodations),
      iepGoals: stringArray(details?.iep_goals),
    };
  });

  if (schoolIds.length === 0) {
    return { schoolIds, rosterChildren: [], myStudents, myName, myRole, schoolLevels: {} };
  }

  // The roster. Service client, because an unclaimed child is invisible through
  // RLS by construction — bounded to the schools resolved above.
  const service = createServiceClient();

  // Level info for the caller's schools, for the secondary-resource weekly
  // bucket. Reference data, bounded to the school ids the caller's own session
  // just resolved; a miss only costs the bucket shaping, never the offer.
  const schoolLevels: Record<string, SchoolLevelInput | undefined> = {};
  {
    const { data: schoolRows2 } = await service
      .from('schools')
      .select('id, school_type, grade_span_low')
      .in('id', schoolIds);
    for (const row of (schoolRows2 ?? []) as Record<string, unknown>[]) {
      schoolLevels[String(row.id)] = {
        school_type: (row.school_type as string | null) ?? null,
        grade_span_low: (row.grade_span_low as string | null) ?? null,
      };
    }
  }
  const rosterRows: Record<string, unknown>[] = [];
  for (const chunk of chunked(schoolIds, IN_CHUNK)) {
    // Keyset paged, for the same reason slice 1's loader is: PostgREST caps a
    // select at max_rows, and a short read here is SILENT — the missing
    // students simply never appear on the claim list, which looks exactly like
    // a district that has not published them. The first page carries no filter
    // at all because `children.id` is a uuid and PostgREST casts the comparand,
    // so an empty-string sentinel is rejected outright.
    for (let afterId: string | null = null; ; ) {
      const query = service
        .from('children')
        .select(
          'id, initials, first_name, last_name, grade_level, school_id, ' +
            'district_student_id, date_of_birth, upcoming_iep_date, upcoming_triennial_date, ' +
            'case_manager, accommodations, testing_accommodations, district_services, district_goals',
        )
        .in('school_id', chunk);
      const { data, error } = await (afterId === null ? query : query.gt('id', afterId))
        .order('id')
        .limit(DB_PAGE);
      if (error) throw new Error(`Could not read the district roster: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      rosterRows.push(...rows);
      if (rows.length < DB_PAGE) break;
      afterId = String(rows[rows.length - 1].id);
    }
  }

  // Who serves each of them, and AS WHAT. Role-based claiming (SPE-577) needs
  // the serving ROLES, not just a count: a child with a speech provider is
  // closed to speech but open to OT. Every caseload row still counts, not just
  // the caller's.
  const served = new Map<string, number>();
  const servedRoles = new Map<string, Set<string>>();
  const childIds = rosterRows.map((r) => String(r.id));
  for (const chunk of chunked(childIds, IN_CHUNK)) {
    for (let afterId: string | null = null; ; ) {
      const query = service
        .from('students')
        .select('id, child_id, provider:profiles!students_provider_id_fkey(role)')
        .in('child_id', chunk);
      const { data, error } = await (afterId === null ? query : query.gt('id', afterId))
        .order('id')
        .limit(DB_PAGE);
      if (error) throw new Error(`Could not read caseloads: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      for (const row of rows) {
        const id = String(row.child_id);
        served.set(id, (served.get(id) ?? 0) + 1);
        // The embed is many-to-one, but PostgREST's shape varies by client
        // version — accept object or one-element array. A row whose provider
        // role cannot be read records the 'unknown' sentinel, which the
        // planner treats as blocking EVERY role: an unreadable caseload must
        // close the child, never open it.
        const provider = Array.isArray(row.provider) ? row.provider[0] : row.provider;
        const role =
          provider && typeof provider === 'object'
            ? String((provider as Record<string, unknown>).role ?? '')
            : '';
        const set = servedRoles.get(id) ?? new Set<string>();
        set.add(role === '' ? 'unknown' : role);
        servedRoles.set(id, set);
      }
      if (rows.length < DB_PAGE) break;
      afterId = String(rows[rows.length - 1].id);
    }
  }

  const rosterChildren: RosterChild[] = rosterRows.map((row) => ({
    id: String(row.id),
    initials: String(row.initials ?? ''),
    firstName: (row.first_name as string | null) ?? null,
    lastName: (row.last_name as string | null) ?? null,
    gradeLevel: String(row.grade_level ?? ''),
    schoolId: String(row.school_id ?? ''),
    districtStudentId: (row.district_student_id as string | null) ?? null,
    dateOfBirth: (row.date_of_birth as string | null) ?? null,
    upcomingIepDate: (row.upcoming_iep_date as string | null) ?? null,
    upcomingTriennialDate: (row.upcoming_triennial_date as string | null) ?? null,
    caseManager: (row.case_manager as string | null) ?? null,
    accommodations: stringArray(row.accommodations),
    testingAccommodations: stringArray(row.testing_accommodations),
    districtServices: parseDistrictServices(row.district_services),
    districtGoals: parseDistrictGoals(row.district_goals),
    caseloadCount: served.get(String(row.id)) ?? 0,
    servedRoles: [...(servedRoles.get(String(row.id)) ?? [])],
  }));

  return { schoolIds, rosterChildren, myStudents, myName, myRole, schoolLevels };
}

// ---------------------------------------------------------------------------
// Accepting roster values onto the provider's own rows
// ---------------------------------------------------------------------------

/** Which table each string-valued offered field actually lives in. */
const FIELD_TARGETS: Partial<
  Record<RosterFieldKey, { table: 'students' | 'student_details'; column: string }>
> = {
  firstName: { table: 'student_details', column: 'first_name' },
  lastName: { table: 'student_details', column: 'last_name' },
  gradeLevel: { table: 'students', column: 'grade_level' },
  districtStudentId: { table: 'students', column: 'district_student_id' },
  dateOfBirth: { table: 'student_details', column: 'date_of_birth' },
  upcomingIepDate: { table: 'student_details', column: 'upcoming_iep_date' },
  upcomingTriennialDate: { table: 'student_details', column: 'upcoming_triennial_date' },
};

/** The list fields write their merged `values` array, not the display string. */
const LIST_FIELD_COLUMNS: Partial<Record<RosterFieldKey, string>> = {
  accommodations: 'accommodations',
  testingAccommodations: 'testing_accommodations',
  iepGoals: 'iep_goals',
};

export interface AcceptanceRequest {
  studentId: string;
  fields: RosterFieldKey[];
}

export interface AcceptanceResult {
  /** Fields actually written, per student. */
  applied: number;
  /** Asked for but not on offer when the server recomputed — reported, not hidden. */
  skipped: number;
}

/**
 * Write the roster's value onto the provider's own student, for the fields
 * they ticked.
 *
 * The VALUES come from the freshly recomputed plan, never from the request.
 * A client can name a student and a field; it cannot name what gets written,
 * and a field the server does not currently offer is skipped and counted
 * rather than trusted. Everything goes through the caller's own session, so
 * `students_update` (provider_id = auth.uid()) is what ultimately permits it.
 */
export async function applyRosterAcceptances(params: {
  plan: ClaimPlan;
  requests: AcceptanceRequest[];
}): Promise<AcceptanceResult> {
  const session = await createClient();
  const offers = new Map(params.plan.updates.map((u) => [u.studentId, u]));
  const result: AcceptanceResult = { applied: 0, skipped: 0 };

  for (const request of params.requests) {
    const offer = offers.get(request.studentId);
    const studentPatch: Record<string, unknown> = {};
    const detailsPatch: Record<string, unknown> = {};
    // Counted per accepted FIELD, not per column written — "Service minutes"
    // is one tick for the provider even though it writes two columns.
    let studentFields = 0;
    let detailsFields = 0;
    let acceptedSplit: { sessionsPerWeek: number; minutesPerSession: number } | null = null;

    for (const field of new Set(request.fields)) {
      const change = offer?.changes.find((c) => c.field === field);
      if (!change) {
        result.skipped++;
        continue;
      }
      const listColumn = LIST_FIELD_COLUMNS[field];
      if (listColumn) {
        // Merged server-side at plan time: the provider's entries plus the
        // district's additions. Accepting can only ever grow the list.
        if (!change.values) {
          result.skipped++;
          continue;
        }
        detailsPatch[listColumn] = change.values;
        if (field === 'iepGoals' && change.goalsIepDate) {
          detailsPatch.goals_iep_date = change.goalsIepDate;
        }
        detailsFields++;
        continue;
      }
      if (field === 'serviceMinutes') {
        // Both columns or neither — half a pair fails the check constraints.
        if (!change.split) {
          result.skipped++;
          continue;
        }
        studentPatch.sessions_per_week = change.split.sessionsPerWeek;
        studentPatch.minutes_per_session = change.split.minutesPerSession;
        acceptedSplit = change.split;
        studentFields++;
        continue;
      }
      const target = FIELD_TARGETS[field];
      if (!target) {
        result.skipped++;
        continue;
      }
      if (target.table === 'students') {
        studentPatch[target.column] = change.roster;
        studentFields++;
      } else {
        detailsPatch[target.column] = change.roster;
        detailsFields++;
      }
    }

    // Accepting minutes must also carry the student's SCHEDULE along, the
    // way the students-page edit and the import confirm do — so read the
    // stored pair first for the sync's before/after contract.
    let oldSplit: { sessions_per_week: number | null; minutes_per_session: number | null } = {
      sessions_per_week: null,
      minutes_per_session: null,
    };
    if (acceptedSplit) {
      const { data: before, error: beforeError } = await session
        .from('students')
        .select('sessions_per_week, minutes_per_session')
        .eq('id', request.studentId)
        .maybeSingle();
      if (beforeError) {
        // A failed read is NOT "no stored minutes". Defaulting the pair to
        // null would hand the sync a false first-time "before" — and hand the
        // revert below a null target that would ERASE the provider's real
        // minutes if the sync then failed (CodeRabbit, PR #917). No honest
        // before, no write: skip the field and let the banner re-offer it.
        log.error(
          'Reading the stored minutes failed; the minutes acceptance was skipped',
          new Error(beforeError.message),
          { studentId: request.studentId },
        );
        delete studentPatch.sessions_per_week;
        delete studentPatch.minutes_per_session;
        acceptedSplit = null;
        studentFields -= 1;
        result.skipped += 1;
      } else if (before) {
        oldSplit = {
          sessions_per_week: (before.sessions_per_week as number | null) ?? null,
          minutes_per_session: (before.minutes_per_session as number | null) ?? null,
        };
      }
    }

    if (studentFields > 0) {
      const { error } = await session
        .from('students')
        .update(studentPatch)
        .eq('id', request.studentId);
      if (error) {
        // A district student id the provider already has on another student
        // trips `ux_students_provider_district_student_id`. That is one
        // student's problem, not the batch's: counting it keeps the reported
        // totals true instead of throwing away acceptances that already
        // committed earlier in this loop.
        if (error.code === '23505') result.skipped += studentFields;
        else throw new Error(`Could not update your student: ${error.message}`);
      } else {
        result.applied += studentFields;

        if (acceptedSplit) {
          // Same follow-through as every other minutes writer: adjust the
          // student's existing scheduled sessions (or create the initial
          // unscheduled ones) so the calendar matches the new requirement.
          const sync = await updateExistingSessionsForStudent(
            request.studentId,
            oldSplit,
            {
              sessions_per_week: acceptedSplit.sessionsPerWeek,
              minutes_per_session: acceptedSplit.minutesPerSession,
            },
            session,
          );
          if (!sync.success) {
            // Committed minutes that match the offer would never be offered
            // again, leaving the calendar permanently behind the requirement
            // (CodeRabbit, PR #917) — so put the stored pair back and count
            // the field as skipped: the banner re-offers it on reload and
            // accepting it retries both writes. Only if even the revert fails
            // do the minutes stay applied, with the students-page edit as the
            // logged repair.
            const revert = await session
              .from('students')
              .update({
                sessions_per_week: oldSplit.sessions_per_week,
                minutes_per_session: oldSplit.minutes_per_session,
              })
              .eq('id', request.studentId);
            if (revert.error) {
              log.error(
                'Session sync after a minutes acceptance failed, and so did the revert; a minutes re-edit on the students page is the repair',
                new Error(`${sync.error ?? 'unknown'}; revert: ${revert.error.message}`),
                { studentId: request.studentId },
              );
            } else {
              log.error('Session sync after a minutes acceptance failed; minutes reverted and re-offered', new Error(sync.error ?? 'unknown'), {
                studentId: request.studentId,
              });
              result.applied -= 1;
              result.skipped += 1;
            }
          }
        }
      }
    }

    if (detailsFields > 0) {
      // A caseload row may have no details row yet (a student added by hand
      // never gets one until something writes a name), so this is an upsert on
      // the student, not a blind update — an update would silently write zero
      // rows and report success.
      const { error } = await session
        .from('student_details')
        .upsert({ student_id: request.studentId, ...detailsPatch }, { onConflict: 'student_id' });
      if (error) throw new Error(`Could not update your student's details: ${error.message}`);
      result.applied += detailsFields;
    }
  }

  return result;
}

/** Claim roster students, as the caller. The database decides, not this code. */
export async function claimRosterChildren(
  childIds: string[],
): Promise<{ childId: string; studentId: string | null; outcome: string }[]> {
  const session = await createClient();
  const { data, error } = await session.rpc('claim_roster_children', { p_child_ids: childIds });
  if (error) throw new Error(`Could not add those students: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    childId: String(row.child_id),
    studentId: (row.student_id as string | null) ?? null,
    outcome: String(row.outcome),
  }));
}

/**
 * Put the district's data onto the caseload rows a claim just created: the
 * caller's role's service minutes, the accommodation lists, their discipline's
 * goals, and the date of birth (SPE-575).
 *
 * Values come from the server-recomputed offers, never from the request, and
 * every write goes through the caller's OWN session — `students_update`
 * (provider_id = auth.uid()) and the student_details policies are what permit
 * it, on rows the claim RPC created for them moments ago. The RPC itself is
 * deliberately untouched.
 *
 * Best-effort by design: a failure here is counted and logged, never thrown —
 * the claim already committed, and whatever this misses reappears as a fill
 * offer the next time the banner loads, because the update planner compares
 * the same fields. That self-healing is why claim + enrich need not be atomic.
 * For minutes it takes one explicit step: a failed session sync REVERTS the
 * just-written pair, because stored minutes that already match the offer are
 * precisely what the planner stops offering.
 */
export async function enrichClaimedStudents(params: {
  plan: ClaimPlan;
  claims: { childId: string; studentId: string | null; outcome: string }[];
}): Promise<{ enriched: number; enrichFailures: number }> {
  const session = await createClient();
  const offerByChild = new Map(params.plan.claimable.map((offer) => [offer.childId, offer]));
  let enriched = 0;
  let enrichFailures = 0;

  for (const claim of params.claims) {
    if (claim.outcome !== 'claimed' || !claim.studentId) continue;
    const offer = offerByChild.get(claim.childId);
    if (!offer) continue;

    try {
      // The detail fields don't depend on the minutes, so they land FIRST: a
      // failed session sync must not also cost the student their birth date,
      // accommodations and goals (CodeRabbit, PR #917). The claim RPC already
      // inserted the details row (name + dates); this upsert fills the
      // SPE-575 columns beside it.
      const detailsPatch: Record<string, unknown> = {};
      if (offer.dateOfBirth) detailsPatch.date_of_birth = offer.dateOfBirth;
      if (offer.accommodations.length > 0) detailsPatch.accommodations = offer.accommodations;
      if (offer.testingAccommodations.length > 0) {
        detailsPatch.testing_accommodations = offer.testingAccommodations;
      }
      if (offer.goals.length > 0) {
        detailsPatch.iep_goals = offer.goals;
        if (offer.goalsIepDate) detailsPatch.goals_iep_date = offer.goalsIepDate;
      }
      if (Object.keys(detailsPatch).length > 0) {
        const { error } = await session
          .from('student_details')
          .upsert({ student_id: claim.studentId, ...detailsPatch }, { onConflict: 'student_id' });
        if (error) throw new Error(error.message);
      }

      if (offer.minutesProposal) {
        const { error } = await session
          .from('students')
          .update({
            sessions_per_week: offer.minutesProposal.sessionsPerWeek,
            minutes_per_session: offer.minutesProposal.minutesPerSession,
          })
          .eq('id', claim.studentId);
        if (error) throw new Error(error.message);

        // A freshly claimed row has no schedule_sessions at all; without this
        // the student carries a requirement but never appears in Unscheduled
        // Sessions until someone re-edits the minutes. Same sync every other
        // minutes writer runs; the null "before" makes it create the initial
        // unscheduled sessions.
        const sync = await updateExistingSessionsForStudent(
          claim.studentId,
          { sessions_per_week: null, minutes_per_session: null },
          {
            sessions_per_week: offer.minutesProposal.sessionsPerWeek,
            minutes_per_session: offer.minutesProposal.minutesPerSession,
          },
          session,
        );
        if (!sync.success) {
          // The minutes just committed, and a stored pair that MATCHES the
          // offer is exactly what stops the banner from offering it again — so
          // leaving them would strand the student with a requirement but no
          // sessions and no repair path (CodeRabbit, PR #917). Put the columns
          // back to what the claim RPC created (it sets no minutes), so the
          // proposal returns on the next banner load and accepting it retries
          // both writes.
          const revert = await session
            .from('students')
            .update({ sessions_per_week: null, minutes_per_session: null })
            .eq('id', claim.studentId);
          if (revert.error) {
            log.error(
              'Reverting minutes after a failed session sync also failed; a minutes re-edit on the students page is the repair',
              new Error(revert.error.message),
              { studentId: claim.studentId },
            );
          }
          throw new Error(sync.error ?? 'session sync failed');
        }
      }

      if (offer.minutesProposal || Object.keys(detailsPatch).length > 0) enriched++;
    } catch (err) {
      enrichFailures++;
      log.error('Enriching a claimed student failed; the data stays on offer', err, {
        studentId: claim.studentId,
      });
    }
  }

  return { enriched, enrichFailures };
}
