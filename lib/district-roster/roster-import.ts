/**
 * District roster import — the IO half of SPE-447 slice 1.
 *
 * Reads what the planner needs (the district's schools, the children it already
 * has, and who currently serves them), and writes the plan it produces. The
 * planner itself stays pure in `./plan`; everything that touches the database
 * or a file lives here.
 *
 * SERVICE CLIENT ON PURPOSE. `students_select` has no district-admin branch at
 * all, and `children_select` is an EXISTS over `students` — so a district admin
 * reading through their own session sees zero children, including the ones they
 * are about to import. Authorization is decided ONCE, at the route, by
 * `requireDistrictAdmin`; every read and write below is already scoped to the
 * district that gate returned and can never be pointed at another one.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { logServerAuditEvent } from '@/lib/supabase/audit-log-server';
import { logger } from '@/lib/logger';
import type {
  DistrictSchool,
  ExistingChild,
  PlannedChild,
  RosterPlan,
} from './plan';

const log = logger.child({ module: 'district-roster-import' });

/** PostgREST caps a select at max_rows, so every read below pages to the end. */
const DB_PAGE = 1000;

/** `.in()` filters ride in the request URL — chunked so ids can't overflow it. */
const IN_CHUNK = 100;

/** How many rows to insert per round trip. */
const INSERT_CHUNK = 200;

function chunked<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

export interface DistrictRosterContext {
  schools: DistrictSchool[];
  existingChildren: ExistingChild[];
}

/**
 * Everything the planner compares the two files against.
 *
 * Children are gathered by district AND by school membership, deduped by id.
 * Both are needed: `children.district_id` is how the roster scopes itself and
 * how `ux_children_district_student_id` enforces uniqueness, but a handful of
 * legacy rows carry a school without a district. Loading only by district_id
 * would leave those invisible to the matcher, and the import would create a
 * SECOND row for a child the district already has.
 */
export async function loadDistrictRosterContext(
  districtId: string,
): Promise<DistrictRosterContext> {
  const supabase = createServiceClient();

  const { data: schoolRows, error: schoolsError } = await supabase
    .from('schools')
    .select('id, name')
    .eq('district_id', districtId);
  if (schoolsError) {
    throw new Error(`Could not load this district's schools: ${schoolsError.message}`);
  }
  const schools: DistrictSchool[] = (schoolRows ?? []).map((s) => ({
    id: String(s.id),
    name: String(s.name ?? ''),
  }));
  const schoolIds = schools.map((s) => s.id);

  const CHILD_COLUMNS =
    'id, district_student_id, first_name, last_name, initials, grade_level, school_id, ' +
    'upcoming_iep_date, upcoming_triennial_date';

  // Ordered by id so pages cannot shear under a concurrent insert.
  const byId = new Map<string, ExistingChild>();
  // `rows` is typed loosely because CHILD_COLUMNS is a shared constant rather
  // than an inline literal, so the client cannot infer the row shape from it.
  const collect = (rows: unknown[]) => {
    for (const raw of rows) {
      const row = raw as Record<string, unknown>;
      const id = String(row.id);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        districtStudentId: (row.district_student_id as string | null) ?? null,
        firstName: (row.first_name as string | null) ?? null,
        lastName: (row.last_name as string | null) ?? null,
        initials: String(row.initials ?? ''),
        gradeLevel: (row.grade_level as string | null) ?? null,
        schoolId: (row.school_id as string | null) ?? null,
        upcomingIepDate: (row.upcoming_iep_date as string | null) ?? null,
        upcomingTriennialDate: (row.upcoming_triennial_date as string | null) ?? null,
        caseloadCount: 0,
      });
    }
  };

  for (let from = 0; ; from += DB_PAGE) {
    const { data, error } = await supabase
      .from('children')
      .select(CHILD_COLUMNS)
      .eq('district_id', districtId)
      .order('id')
      .range(from, from + DB_PAGE - 1);
    if (error) throw new Error(`Could not load this district's children: ${error.message}`);
    collect(data ?? []);
    if (!data || data.length < DB_PAGE) break;
  }

  for (const chunk of chunked(schoolIds, IN_CHUNK)) {
    for (let from = 0; ; from += DB_PAGE) {
      const { data, error } = await supabase
        .from('children')
        .select(CHILD_COLUMNS)
        .in('school_id', chunk)
        .order('id')
        .range(from, from + DB_PAGE - 1);
      if (error) throw new Error(`Could not load this district's children: ${error.message}`);
      collect(data ?? []);
      if (!data || data.length < DB_PAGE) break;
    }
  }

  // Who currently serves each child. One `students` row is one provider's
  // service entry, so the row count IS the number of caseloads the child sits
  // on — that is what "served by nobody" means on the review screen.
  const childIds = [...byId.keys()];
  for (const chunk of chunked(childIds, IN_CHUNK)) {
    for (let from = 0; ; from += DB_PAGE) {
      const { data, error } = await supabase
        .from('students')
        .select('id, child_id')
        .in('child_id', chunk)
        .order('id')
        .range(from, from + DB_PAGE - 1);
      if (error) throw new Error(`Could not load caseload rows: ${error.message}`);
      for (const row of data ?? []) {
        const child = byId.get(String(row.child_id));
        if (child) child.caseloadCount++;
      }
      if (!data || data.length < DB_PAGE) break;
    }
  }

  return { schools, existingChildren: [...byId.values()] };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface RosterWriteResult {
  created: number;
  updated: number;
}

/**
 * The roster's own columns for one planned child, with blanks dropped.
 *
 * Dropping them IS the never-erase rule at the write layer: an absent key is a
 * column the UPDATE does not mention, so a student missing from the IEP Dates
 * report keeps the review date a provider already entered. The planner applies
 * the same rule when it decides what counts as a change; this is the half that
 * makes it true of the database.
 */
function rosterColumns(
  planned: PlannedChild,
  districtId: string,
): Record<string, string> {
  const { fields } = planned;
  const columns: Record<string, string> = {
    // Always written: scoping the row to this district is what makes
    // `ux_children_district_student_id` apply to it at all.
    district_id: districtId,
    first_name: fields.firstName,
    last_name: fields.lastName,
    initials: fields.initials,
    grade_level: fields.gradeLevel,
  };
  if (fields.schoolId) columns.school_id = fields.schoolId;
  if (fields.districtStudentId) columns.district_student_id = fields.districtStudentId;
  if (fields.upcomingIepDate) columns.upcoming_iep_date = fields.upcomingIepDate;
  if (fields.upcomingTriennialDate) columns.upcoming_triennial_date = fields.upcomingTriennialDate;
  return columns;
}

/**
 * Apply a planned roster: insert the new children, patch the changed ones.
 *
 * Nothing is ever deleted — a child the files did not mention is reported to
 * the admin, not removed (a provider may be serving them, and SEIS exports go
 * stale between pulls).
 *
 * Stop-on-failure, like the link sync: a chunk that fails leaves the earlier
 * chunks committed, so the audit row records `partial: true` and the error
 * propagates for the route to answer honestly. Re-running the preview always
 * shows the true current state, so a partial apply is recoverable by repeating
 * it rather than by unwinding.
 */
export async function applyDistrictRosterPlan(params: {
  plan: RosterPlan;
  actorId: string;
  districtId: string;
}): Promise<RosterWriteResult> {
  const { plan, actorId, districtId } = params;
  if (plan.refusal) {
    // Routes refuse before calling apply; this is the belt to that suspender.
    throw new Error('A refused plan cannot be applied.');
  }

  const supabase = createServiceClient();
  const result: RosterWriteResult = { created: 0, updated: 0 };

  const recordOutcome = async (partial: boolean) => {
    await logServerAuditEvent({
      user_id: actorId,
      action: 'district_roster_imported',
      resource_type: 'district',
      resource_id: districtId,
      metadata: {
        districtId,
        partial,
        created: result.created,
        updated: result.updated,
        unchanged: plan.counts.unchanged,
        inFiles: plan.counts.inFiles,
        exceptions: plan.exceptions.length,
        notInRoster: plan.notInRoster.length,
      },
    });
    log.info('District roster applied', {
      districtId,
      partial,
      created: result.created,
      updated: result.updated,
    });
  };

  try {
    const creates = plan.children.filter((c) => c.action === 'create');
    for (const chunk of chunked(creates, INSERT_CHUNK)) {
      const { error } = await supabase
        .from('children')
        .insert(chunk.map((planned) => rosterColumns(planned, districtId)));
      if (error) throw new Error(`Adding students to the roster failed: ${error.message}`);
      result.created += chunk.length;
    }

    for (const planned of plan.children) {
      if (planned.action !== 'update' || !planned.childId) continue;
      const { error } = await supabase
        .from('children')
        .update(rosterColumns(planned, districtId))
        .eq('id', planned.childId);
      if (error) throw new Error(`Updating a roster student failed: ${error.message}`);
      result.updated++;
    }
  } catch (err) {
    await recordOutcome(true);
    throw err;
  }

  await recordOutcome(false);
  return result;
}

/** Counts only — what may be logged. The plan itself carries student detail. */
export function rosterPlanCounts(plan: RosterPlan) {
  return {
    refused: plan.refusal !== null,
    ...plan.counts,
    exceptions: plan.exceptions.length,
    notInRoster: plan.notInRoster.length,
    compliance: plan.compliance,
  };
}
