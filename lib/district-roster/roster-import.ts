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

import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { logServerAuditEvent } from '@/lib/supabase/audit-log-server';
import { logger } from '@/lib/logger';
import type {
  DistrictSchool,
  ExistingChild,
  PlannedChild,
  RosterPlan,
} from './plan';
import { stableStringify } from './plan';

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

/** The last id of a page, for the next page's `.gt()`. */
const lastId = (rows: unknown[]): string =>
  String((rows[rows.length - 1] as Record<string, unknown>).id);

/**
 * Every school in the district.
 *
 * Paged like every other read here. A short read would be silent and ugly: the
 * students at the missing schools come back as "not one of your schools", so a
 * real district-wide import would look like a district-wide data problem.
 */
export async function loadDistrictSchools(districtId: string): Promise<DistrictSchool[]> {
  const supabase = createServiceClient();
  const schools: DistrictSchool[] = [];
  for (let afterId: string | null = null; ; ) {
    const query = supabase.from('schools').select('id, name').eq('district_id', districtId);
    const { data, error } = await (afterId === null ? query : query.gt('id', afterId))
      .order('id')
      .limit(DB_PAGE);
    if (error) throw new Error(`Could not load this district's schools: ${error.message}`);
    schools.push(...(data ?? []).map((s) => ({ id: String(s.id), name: String(s.name ?? '') })));
    if (!data || data.length < DB_PAGE) break;
    afterId = String(data[data.length - 1].id);
  }
  return schools;
}

/**
 * Every child row belonging to this district, deduped by id.
 *
 * WHICH children count is the whole point of this function, and the answer is
 * shared by every district-scoped surface — the import's matcher and the roster
 * gaps view alike. Two surfaces disagreeing about it would be worse than either
 * being wrong: the gaps list would name students the import cannot see, or go
 * quiet about students it just wrote.
 *
 * Children are gathered by district, PLUS the district-less legacy rows sitting
 * at one of this district's schools. Both are needed: `children.district_id` is
 * how the roster scopes itself and how `ux_children_district_student_id`
 * enforces uniqueness, but a handful of older rows carry a school without a
 * district. Loading only by district_id would leave those invisible to the
 * matcher, and the import would create a SECOND row for a child the district
 * already has.
 *
 * The second read is filtered to `district_id IS NULL` deliberately. Some
 * children legitimately sit at a school in one district while belonging to
 * ANOTHER (a county program placing students on a district campus — 29 such
 * rows in production today). Loading those by school alone would let this
 * district's import match, rewrite, and re-home another district's child.
 *
 * KEYSET paged, not offset paged. With `.range()`, a row inserted with a lower
 * id while we page shifts every later row across the offset boundary and one
 * gets skipped — and a child this loader misses is a child the matcher cannot
 * see, so the import creates a SECOND row for them. Filtering on the last id
 * seen cannot skip.
 *
 * The FIRST page carries no `.gt()` at all rather than a sentinel value. These
 * ids are uuids, and PostgREST casts the comparand to the column type — an
 * empty-string sentinel is rejected outright ("invalid input syntax for type
 * uuid"), which mocked tests cannot see because they never cast.
 *
 * Rows come back loosely typed: `columns` is a caller-supplied string rather
 * than an inline literal, so the client cannot infer the row shape from it.
 */
export async function loadDistrictChildRows(
  districtId: string,
  schoolIds: string[],
  columns: string,
): Promise<Record<string, unknown>[]> {
  const supabase = createServiceClient();
  const byId = new Map<string, Record<string, unknown>>();
  const collect = (rows: unknown[]) => {
    for (const raw of rows) {
      const row = raw as Record<string, unknown>;
      const id = String(row.id);
      if (!byId.has(id)) byId.set(id, row);
    }
  };

  for (let afterId: string | null = null; ; ) {
    const query = supabase.from('children').select(columns).eq('district_id', districtId);
    const { data, error } = await (afterId === null ? query : query.gt('id', afterId))
      .order('id')
      .limit(DB_PAGE);
    if (error) throw new Error(`Could not load this district's children: ${error.message}`);
    collect(data ?? []);
    if (!data || data.length < DB_PAGE) break;
    afterId = lastId(data);
  }

  for (const chunk of chunked(schoolIds, IN_CHUNK)) {
    for (let afterId: string | null = null; ; ) {
      const query = supabase
        .from('children')
        .select(columns)
        .in('school_id', chunk)
        .is('district_id', null);
      const { data, error } = await (afterId === null ? query : query.gt('id', afterId))
        .order('id')
        .limit(DB_PAGE);
      if (error) throw new Error(`Could not load this district's children: ${error.message}`);
      collect(data ?? []);
      if (!data || data.length < DB_PAGE) break;
      afterId = lastId(data);
    }
  }

  return [...byId.values()];
}

/**
 * How many caseloads each child sits on, keyed by child id.
 *
 * One `students` row is one provider's service entry, so the row count IS the
 * number of caseloads the child sits on — that is what "served by nobody" means
 * on the review screen and on the roster gaps view. A child with no row at all
 * is absent from the map, which callers read as zero.
 */
export async function loadCaseloadCounts(childIds: string[]): Promise<Map<string, number>> {
  const supabase = createServiceClient();
  const counts = new Map<string, number>();
  for (const chunk of chunked(childIds, IN_CHUNK)) {
    for (let afterId: string | null = null; ; ) {
      const query = supabase.from('students').select('id, child_id').in('child_id', chunk);
      const { data, error } = await (afterId === null ? query : query.gt('id', afterId))
        .order('id')
        .limit(DB_PAGE);
      if (error) throw new Error(`Could not load caseload rows: ${error.message}`);
      for (const row of data ?? []) {
        const childId = String(row.child_id);
        counts.set(childId, (counts.get(childId) ?? 0) + 1);
      }
      if (!data || data.length < DB_PAGE) break;
      afterId = lastId(data);
    }
  }
  return counts;
}

/** Everything the planner compares the uploaded files against. */
export async function loadDistrictRosterContext(
  districtId: string,
): Promise<DistrictRosterContext> {
  const schools = await loadDistrictSchools(districtId);

  const CHILD_COLUMNS =
    'id, district_student_id, first_name, last_name, initials, grade_level, school_id, ' +
    'date_of_birth, upcoming_iep_date, upcoming_triennial_date, case_manager, ' +
    'accommodations, testing_accommodations, district_services, district_goals';

  const rows = await loadDistrictChildRows(
    districtId,
    schools.map((s) => s.id),
    CHILD_COLUMNS,
  );

  const existingChildren: ExistingChild[] = rows.map((row) => ({
    id: String(row.id),
    districtStudentId: (row.district_student_id as string | null) ?? null,
    firstName: (row.first_name as string | null) ?? null,
    lastName: (row.last_name as string | null) ?? null,
    initials: String(row.initials ?? ''),
    gradeLevel: (row.grade_level as string | null) ?? null,
    schoolId: (row.school_id as string | null) ?? null,
    dateOfBirth: (row.date_of_birth as string | null) ?? null,
    upcomingIepDate: (row.upcoming_iep_date as string | null) ?? null,
    upcomingTriennialDate: (row.upcoming_triennial_date as string | null) ?? null,
    caseManager: (row.case_manager as string | null) ?? null,
    accommodations: (row.accommodations as string[] | null) ?? [],
    testingAccommodations: (row.testing_accommodations as string[] | null) ?? [],
    districtServices: row.district_services ?? null,
    districtGoals: row.district_goals ?? null,
    caseloadCount: 0,
  }));

  const counts = await loadCaseloadCounts(existingChildren.map((c) => c.id));
  for (const child of existingChildren) child.caseloadCount = counts.get(child.id) ?? 0;

  return { schools, existingChildren };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface RosterWriteResult {
  created: number;
  updated: number;
}

/**
 * A mid-publish failure, carrying how far the apply got before it stopped.
 * "Some students may already be saved" is useless to an admin; the counts let
 * the route say exactly how many landed (chunks before the failing one stay
 * committed — see the stop-on-failure note on `applyDistrictRosterPlan`).
 */
export class RosterApplyError extends Error {
  constructor(
    message: string,
    readonly progress: RosterWriteResult,
  ) {
    super(message);
    this.name = 'RosterApplyError';
  }
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
): Record<string, unknown> {
  const { fields } = planned;
  const columns: Record<string, unknown> = {
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
  if (fields.dateOfBirth) columns.date_of_birth = fields.dateOfBirth;
  if (fields.upcomingIepDate) columns.upcoming_iep_date = fields.upcomingIepDate;
  if (fields.upcomingTriennialDate) columns.upcoming_triennial_date = fields.upcomingTriennialDate;
  if (fields.caseManager) columns.case_manager = fields.caseManager;
  if (fields.accommodations && fields.accommodations.length > 0) {
    columns.accommodations = fields.accommodations;
  }
  if (fields.testingAccommodations && fields.testingAccommodations.length > 0) {
    columns.testing_accommodations = fields.testingAccommodations;
  }
  if (fields.districtServices && fields.districtServices.length > 0) {
    columns.district_services = fields.districtServices;
  }
  if (fields.districtGoals && fields.districtGoals.goals.length > 0) {
    columns.district_goals = fields.districtGoals;
  }
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
      const { error } = await supabase.from('children').insert(
        chunk.map((planned) => ({
          // A bulk insert unifies the key set across the whole chunk and
          // NULL-fills the gaps — so a student with no accommodations beside
          // one who has some would write NULL into a NOT NULL column and
          // abort the chunk (JSUSD's first real publish, 59 creates, 0
          // written). Explicit empties keep every row writable; the nullable
          // columns may NULL-fill freely.
          accommodations: [],
          testing_accommodations: [],
          ...rosterColumns(planned, districtId),
        })),
      );
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
    // The write failure is the news. If recording the partial outcome ALSO
    // fails, its rejection must not replace it — the route would then answer
    // on the wrong cause entirely.
    try {
      await recordOutcome(true);
    } catch (auditErr) {
      log.error('Recording the partial roster import outcome failed', auditErr, { districtId });
    }
    // Carry how far the apply got: "some students may already be saved" told
    // the admin nothing — the route can now answer with the real counts.
    throw new RosterApplyError(err instanceof Error ? err.message : String(err), {
      created: result.created,
      updated: result.updated,
    });
  }

  await recordOutcome(false);
  return result;
}

/**
 * A fingerprint of exactly which writes a plan would make.
 *
 * Publishing is bound to this, not only to the number of changes. A count alone
 * cannot tell two different plans apart: swap the uploaded file for another
 * that happens to produce the same total, or have the database shift one create
 * into an update and an update into a create between preview and publish, and
 * the count check passes while a different set of students gets written.
 *
 * Server-side only, and never sent anywhere but back to the admin who previewed
 * it — the client only echoes the string it was given.
 */
export function rosterPlanDigest(plan: RosterPlan): string {
  const lines = plan.children
    .filter((c) => c.action !== 'unchanged')
    .map((c) =>
      [
        c.action,
        c.childId ?? 'new',
        c.fields.districtStudentId ?? '',
        c.fields.schoolId ?? '',
        c.fields.gradeLevel,
        c.fields.firstName,
        c.fields.lastName,
        c.fields.dateOfBirth ?? '',
        c.fields.upcomingIepDate ?? '',
        c.fields.upcomingTriennialDate ?? '',
        c.fields.caseManager ?? '',
        stableStringify(c.fields.accommodations ?? null),
        stableStringify(c.fields.testingAccommodations ?? null),
        stableStringify(c.fields.districtServices ?? null),
        stableStringify(c.fields.districtGoals ?? null),
      ].join(''),
    )
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 32);
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
