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
import type { ClaimPlan, ProviderStudent, RosterChild, RosterFieldKey } from './claim-plan';

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
}

/**
 * Everything the claim planner compares: the roster at the caller's schools,
 * and the caller's own caseload.
 */
export async function loadProviderRosterContext(
  userId: string,
): Promise<ProviderRosterContext> {
  const session = await createClient();

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
      'id, child_id, initials, grade_level, district_student_id, ' +
        'student_details(first_name, last_name, upcoming_iep_date, upcoming_triennial_date)',
    )
    .eq('provider_id', userId);
  if (mineError) throw new Error(`Could not read your students: ${mineError.message}`);

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
      upcomingIepDate: (details?.upcoming_iep_date as string | null) ?? null,
      upcomingTriennialDate: (details?.upcoming_triennial_date as string | null) ?? null,
    };
  });

  if (schoolIds.length === 0) {
    return { schoolIds, rosterChildren: [], myStudents };
  }

  // The roster. Service client, because an unclaimed child is invisible through
  // RLS by construction — bounded to the schools resolved above.
  const service = createServiceClient();
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
            'district_student_id, upcoming_iep_date, upcoming_triennial_date',
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

  // Who serves each of them. "Claimable" means NOBODY does — not merely "not
  // me" — so this counts every caseload row, not just the caller's.
  const served = new Map<string, number>();
  const childIds = rosterRows.map((r) => String(r.id));
  for (const chunk of chunked(childIds, IN_CHUNK)) {
    for (let afterId: string | null = null; ; ) {
      const query = service.from('students').select('id, child_id').in('child_id', chunk);
      const { data, error } = await (afterId === null ? query : query.gt('id', afterId))
        .order('id')
        .limit(DB_PAGE);
      if (error) throw new Error(`Could not read caseloads: ${error.message}`);
      const rows = (data ?? []) as { id: string; child_id: string | null }[];
      for (const row of rows) {
        const id = String(row.child_id);
        served.set(id, (served.get(id) ?? 0) + 1);
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
    upcomingIepDate: (row.upcoming_iep_date as string | null) ?? null,
    upcomingTriennialDate: (row.upcoming_triennial_date as string | null) ?? null,
    caseloadCount: served.get(String(row.id)) ?? 0,
  }));

  return { schoolIds, rosterChildren, myStudents };
}

// ---------------------------------------------------------------------------
// Accepting roster values onto the provider's own rows
// ---------------------------------------------------------------------------

/** Which table each offered field actually lives in. */
const FIELD_TARGETS: Record<RosterFieldKey, { table: 'students' | 'student_details'; column: string }> = {
  firstName: { table: 'student_details', column: 'first_name' },
  lastName: { table: 'student_details', column: 'last_name' },
  gradeLevel: { table: 'students', column: 'grade_level' },
  districtStudentId: { table: 'students', column: 'district_student_id' },
  upcomingIepDate: { table: 'student_details', column: 'upcoming_iep_date' },
  upcomingTriennialDate: { table: 'student_details', column: 'upcoming_triennial_date' },
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
    const studentPatch: Record<string, string> = {};
    const detailsPatch: Record<string, string> = {};

    for (const field of new Set(request.fields)) {
      const change = offer?.changes.find((c) => c.field === field);
      if (!change) {
        result.skipped++;
        continue;
      }
      const target = FIELD_TARGETS[field];
      if (target.table === 'students') studentPatch[target.column] = change.roster;
      else detailsPatch[target.column] = change.roster;
    }

    if (Object.keys(studentPatch).length > 0) {
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
        if (error.code === '23505') result.skipped += Object.keys(studentPatch).length;
        else throw new Error(`Could not update your student: ${error.message}`);
      } else {
        result.applied += Object.keys(studentPatch).length;
      }
    }

    if (Object.keys(detailsPatch).length > 0) {
      // A caseload row may have no details row yet (a student added by hand
      // never gets one until something writes a name), so this is an upsert on
      // the student, not a blind update — an update would silently write zero
      // rows and report success.
      const { error } = await session
        .from('student_details')
        .upsert({ student_id: request.studentId, ...detailsPatch }, { onConflict: 'student_id' });
      if (error) throw new Error(`Could not update your student's details: ${error.message}`);
      result.applied += Object.keys(detailsPatch).length;
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
