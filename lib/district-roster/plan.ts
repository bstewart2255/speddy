/**
 * District roster planner (SPE-447, slice 1).
 *
 * Turns a district admin's two SEIS exports — the Student Goals report and the
 * IEP Dates report — into a plan of `children` rows to create or refresh for
 * the WHOLE district, plus the compliance signals that make the roster useful
 * to the admin before any provider has claimed anyone.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: touch a caseload. A `students` row is one
 * provider's service entry and `upsert_students_atomic` refuses to write one
 * unless the caller IS that provider. The roster is the child-level record;
 * providers claim from it later (slice 2). That split is why this import can
 * run and re-run without changing anything a provider sees.
 *
 * Pure and IO-free so the matching rules can be tested without a database.
 */

import { normalizeSchoolName } from '@/lib/school-helpers';
import type { ParsedGoalDetail } from '@/lib/parsers/csv-parser';
import { dedupeEntries } from '@/lib/parsers/district-reports';
import type {
  AccommodationsReportStudent,
  DistrictServiceLine,
  ServicesReportStudent,
  TestingReportStudent,
} from '@/lib/parsers/district-reports';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One student as parsed from the SEIS Student Goals report. */
export interface RosterFileStudent {
  firstName: string;
  lastName: string;
  initials: string;
  gradeLevel: string;
  /** SEIS "District ID" — the sole join to the SIS teacher link sync. */
  districtStudentId?: string;
  schoolOfAttendance?: string;
  /** SEIS "Case Manager" — a hint for the claim screen, never an assignment. */
  caseManager?: string;
  /** The report's IEP Date — the vintage of the goals below, not a compliance date. */
  iepDate?: string;
  /** Goal text with its routing metadata, for role-filtered claim offers (SPE-575). */
  goalDetails?: ParsedGoalDetail[];
}

/** The goals payload stored on `children.district_goals` (SPE-575). */
export interface RosterDistrictGoals {
  /** Goal vintage — the Goals report's IEP Date, never the compliance dates. */
  iepDate: string | null;
  goals: ParsedGoalDetail[];
}

/** One student as parsed from the SEIS IEP Dates report. */
export interface RosterDatesRecord {
  firstName: string;
  lastName: string;
  gradeLevel: string;
  schoolOfAttendance: string;
  upcomingIepDate?: string;
  upcomingTriennialDate?: string;
}

/** A school in the importing district, for resolving School of Attendance. */
export interface DistrictSchool {
  id: string;
  name: string;
}

/** A child record that already exists in this district. */
export interface ExistingChild {
  id: string;
  districtStudentId: string | null;
  firstName: string | null;
  lastName: string | null;
  /** The stored display initials — NOT NULL on `children`, so always usable
   *  even for a legacy row whose first/last name are blank. */
  initials: string;
  gradeLevel: string | null;
  schoolId: string | null;
  dateOfBirth: string | null;
  upcomingIepDate: string | null;
  upcomingTriennialDate: string | null;
  caseManager: string | null;
  accommodations: string[];
  testingAccommodations: string[];
  /** Stored `district_services` / `district_goals` JSON, verbatim. */
  districtServices: unknown;
  districtGoals: unknown;
  /** How many provider caseloads currently serve this child. */
  caseloadCount: number;
}

export interface RosterPlanInput {
  districtId: string;
  /** Today, as ISO `YYYY-MM-DD` — passed in so the planner stays pure. */
  today: string;
  goalsStudents: RosterFileStudent[];
  datesRecords: RosterDatesRecord[];
  servicesStudents: ServicesReportStudent[];
  accommodationsStudents: AccommodationsReportStudent[];
  testingStudents: TestingReportStudent[];
  schools: DistrictSchool[];
  existingChildren: ExistingChild[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type RosterAction = 'create' | 'update' | 'unchanged';

/** How a file row was tied to an existing child — or why it could not be. */
export type RosterMatchBasis =
  | 'district-student-id'
  | 'name-and-school'
  | 'initials-and-school'
  | 'new';

/** The fields the roster owns. Everything else on `children` is left alone. */
export interface RosterChildFields {
  firstName: string;
  lastName: string;
  initials: string;
  gradeLevel: string;
  districtStudentId: string | null;
  schoolId: string | null;
  dateOfBirth: string | null;
  upcomingIepDate: string | null;
  upcomingTriennialDate: string | null;
  caseManager: string | null;
  /** Null when the matching file was not uploaded or holds nothing for this
   *  student — and null is never written, per the never-erase rule. */
  accommodations: string[] | null;
  testingAccommodations: string[] | null;
  districtServices: DistrictServiceLine[] | null;
  districtGoals: RosterDistrictGoals | null;
}

export interface PlannedChild {
  action: RosterAction;
  matchBasis: RosterMatchBasis;
  /** Present for update/unchanged. */
  childId?: string;
  fields: RosterChildFields;
  /** Names of the fields an update would change, for the review screen. */
  changedFields: string[];
  /** Initials + grade only — the plan never carries a name to a log. */
  initials: string;
  gradeLevel: string;
}

/** A row the planner refuses to act on, with the reason a human can fix. */
export interface RosterException {
  kind:
    | 'ambiguous-name-match'
    | 'identity-mismatch'
    | 'unknown-school'
    | 'conflicting-district-id'
    | 'duplicate-in-files'
    | 'missing-grade';
  initials: string;
  gradeLevel: string;
  detail: string;
}

/** What the admin gets out of the roster beyond the import itself. */
export interface RosterCompliance {
  /** Annual review date already in the past. */
  overdueAnnualReviews: number;
  /** Triennial reevaluation date already in the past. */
  overdueTriennials: number;
  /** On the roster with no next-review date at all. */
  missingAnnualReviewDate: number;
  /** On the roster but in no provider's caseload. */
  servedByNobody: number;
  /** No district student ID, so the SIS teacher sync can never match them. */
  cannotLinkToTeachers: number;
}

export interface RosterPlan {
  /** Set when the plan is unsafe to apply at all; nothing is written. */
  refusal: string | null;
  children: PlannedChild[];
  exceptions: RosterException[];
  compliance: RosterCompliance;
  /** Children in this district the roster did not mention. Never removed. */
  notInRoster: { initials: string; gradeLevel: string; caseloadCount: number }[];
  counts: {
    creates: number;
    updates: number;
    unchanged: number;
    /** Distinct students across the uploaded files. */
    inFiles: number;
    /**
     * Rows read from the IEP Dates report whose dates reached nobody: either
     * two students on the roster share that name and nothing in the report can
     * separate them, or the row repeats a student already given their dates.
     *
     * Surfaced rather than dropped quietly. Those students end up counted as
     * having no review date on file, and without this the admin has no way to
     * tell that apart from a district that genuinely records none.
     */
    datesRowsNotUsed: number;
    /** Same posture for the three SPE-575 files: students whose data could not
     *  be attached because two roster students share their name. */
    servicesStudentsNotUsed: number;
    accommodationsStudentsNotUsed: number;
    testingStudentsNotUsed: number;
    /** How many planned children carry each kind of district data. */
    withServices: number;
    withAccommodations: number;
    withTestingAccommodations: number;
    withGoals: number;
  };
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const clean = (v: string | null | undefined): string => (v ?? '').trim();

/** Merge two entry lists, keeping first spelling, dropping case-dup entries. */
const mergeUnique = (a: string[] | undefined, b: string[]): string[] =>
  dedupeEntries([...(a ?? []), ...b]);

/**
 * Deterministic JSON for change detection: object keys sorted recursively, so
 * a value read back from a jsonb column (which re-orders keys) compares equal
 * to the same value freshly parsed from a file.
 */
export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

/**
 * The district-student-id MATCH key, matching `ux_children_district_student_id`
 * (which is `upper(btrim(...))`).
 *
 * Only ever a key. The value written to `children.district_student_id` keeps
 * the file's own casing, because the SIS teacher link sync compares it to the
 * OneRoster `identifier` case-sensitively — upper-casing an alphanumeric id on
 * the way in would leave every one of those students unlinkable, which is the
 * exact failure SPE-558 was.
 */
export const districtIdKey = (id: string | null | undefined): string | null => {
  const trimmed = clean(id).toUpperCase();
  return trimmed === '' ? null : trimmed;
};

/** The stored form of a district student id: trimmed, otherwise verbatim. */
const districtIdValue = (id: string | null | undefined): string | null => {
  const trimmed = clean(id);
  return trimmed === '' ? null : trimmed;
};

/**
 * The fallback identity: school + name, WITHOUT grade.
 *
 * Deliberately unlike `buildStudentDedupKey`, which includes grade — that key
 * dedupes rows within one import, where grade is fixed. This one matches a file
 * row against children persisted across time, and grade is exactly what changes
 * at a year rollover; including it would make every September re-import
 * duplicate the students who have no district id. Two children sharing a name
 * at one school are reported as ambiguous rather than guessed at — and the one
 * candidate this key does find is still vetted by `identityDoubt` below before
 * anything is written to it.
 */
export const nameSchoolKey = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  schoolId: string | null | undefined,
): string =>
  [
    clean(lastName).toLowerCase().replace(/\s+/g, ' '),
    clean(firstName).toLowerCase().replace(/\s+/g, ' '),
    clean(schoolId),
  ].join('|');

/** Speddy's normalized grades in order. Unrecognized spellings get no rank. */
const GRADE_RANK = new Map<string, number>([
  ['TK', -1],
  ['K', 0],
  ...Array.from({ length: 12 }, (_, i) => [String(i + 1), i + 1] as [string, number]),
]);

/**
 * Why a name+school match should NOT be trusted, or null when it can be.
 *
 * The name key above excludes grade so a September re-import still finds last
 * year's students — but that same blindness would let a file row update a
 * same-named DIFFERENT child: a grade-4 record from the Services report (which
 * carries no District ID) folding into a grade-1 child (CodeRabbit review on
 * PR #917). So the single candidate the key finds is vetted here:
 *
 * - Matching birth dates confirm the match outright, whatever the grades say —
 *   the file may be correcting a wrong grade.
 * - Contradicting birth dates refuse it: two birth dates are two children.
 * - With no birth date to arbitrate, the file's grade must be the stored grade
 *   or exactly one year ahead — the mid-year re-import and the fall rollover.
 *   A regression or a multi-year jump is identity doubt, reported to the admin
 *   rather than guessed at. Blank or unrecognized grades cannot testify either
 *   way and stay compatible, so legacy spellings degrade to the old behavior.
 */
const identityDoubt = (
  row: { dateOfBirth?: string; gradeLevel: string },
  child: { dateOfBirth: string | null; gradeLevel: string | null },
): 'birth-date' | 'grade' | null => {
  const rowDob = clean(row.dateOfBirth);
  const childDob = clean(child.dateOfBirth);
  if (rowDob && childDob) return rowDob === childDob ? null : 'birth-date';
  const stored = GRADE_RANK.get(clean(child.gradeLevel).toUpperCase());
  const fromFile = GRADE_RANK.get(clean(row.gradeLevel).toUpperCase());
  if (stored === undefined || fromFile === undefined) return null;
  return fromFile === stored || fromFile === stored + 1 ? null : 'grade';
};

/**
 * The last-resort identity, for a child Speddy holds under INITIALS ONLY.
 *
 * Most children in Speddy have no first or last name at all: a provider adding
 * a student by hand entered initials, and that is all the record has. Neither
 * key above can ever match one of them, so without this rung a district's first
 * import silently creates a second row for every such child — measured at 27 of
 * 60 children in one district and 29 of 29 in another.
 *
 * Grade is IN this key, unlike the name key. That is safe precisely because the
 * rung is transient: the import writes the real names onto the child it
 * matches, so from the next run onwards the name key handles them and survives
 * a rollover. Two-letter initials are weak evidence, so grade is the guard that
 * keeps the rung narrow, and more than one candidate refuses outright.
 */
export const initialsSchoolKey = (
  initials: string | null | undefined,
  gradeLevel: string | null | undefined,
  schoolId: string | null | undefined,
): string =>
  [clean(initials).toUpperCase(), clean(gradeLevel).toUpperCase(), clean(schoolId)].join('|');

const initialsOf = (firstName: string, lastName: string): string =>
  `${clean(firstName).charAt(0)}${clean(lastName).charAt(0)}`.toUpperCase();

// ---------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------

export function planDistrictRoster(input: RosterPlanInput): RosterPlan {
  const exceptions: RosterException[] = [];

  const empty = (refusal: string): RosterPlan => ({
    refusal,
    children: [],
    exceptions,
    compliance: {
      overdueAnnualReviews: 0,
      overdueTriennials: 0,
      missingAnnualReviewDate: 0,
      servedByNobody: 0,
      cannotLinkToTeachers: 0,
    },
    notInRoster: [],
    counts: {
      creates: 0,
      updates: 0,
      unchanged: 0,
      inFiles: 0,
      datesRowsNotUsed: 0,
      servicesStudentsNotUsed: 0,
      accommodationsStudentsNotUsed: 0,
      testingStudentsNotUsed: 0,
      withServices: 0,
      withAccommodations: 0,
      withTestingAccommodations: 0,
      withGoals: 0,
    },
  });

  // A report with no students is either the wrong file or a failed parse.
  // Applying it would write nothing but still report success, so say so
  // instead — the same posture as the link sync's empty-feed refusal.
  if (
    input.goalsStudents.length === 0 &&
    input.datesRecords.length === 0 &&
    input.servicesStudents.length === 0 &&
    input.accommodationsStudents.length === 0 &&
    input.testingStudents.length === 0
  ) {
    return empty('No file contained any students. Nothing was changed.');
  }

  // Schools by normalized name, so "Rodeo Hills Elementary" resolves whichever
  // way the export spells it.
  const schoolByName = new Map<string, string>();
  for (const school of input.schools) {
    const key = normalizeSchoolName(school.name);
    if (key && !schoolByName.has(key)) schoolByName.set(key, school.id);
  }
  const resolveSchool = (name: string | undefined): string | null => {
    const key = normalizeSchoolName(clean(name));
    return key ? schoolByName.get(key) ?? null : null;
  };

  // Existing children, indexed every way the ladder below looks them up. The
  // initials index holds ONLY the children with no stored name: a child who
  // has one and does not match it is a different student, and falling back to
  // initials for them would merge two real children.
  // Candidates, not a single child: `ux_children_district_student_id` is keyed
  // on (district_id, id), and Postgres treats NULL district_ids as distinct, so
  // a district-less legacy row and a district row CAN carry the same student id
  // — and both are loaded here. Keeping only the last would quietly update one
  // and leave the other looking absent from the roster.
  const byDistrictId = new Map<string, ExistingChild[]>();
  const byNameSchool = new Map<string, ExistingChild[]>();
  const nameLessByInitials = new Map<string, ExistingChild[]>();
  for (const child of input.existingChildren) {
    const idKey = districtIdKey(child.districtStudentId);
    if (idKey) byDistrictId.set(idKey, [...(byDistrictId.get(idKey) ?? []), child]);
    if (clean(child.firstName) || clean(child.lastName)) {
      const nameKey = nameSchoolKey(child.firstName, child.lastName, child.schoolId);
      byNameSchool.set(nameKey, [...(byNameSchool.get(nameKey) ?? []), child]);
    } else {
      const key = initialsSchoolKey(child.initials, child.gradeLevel, child.schoolId);
      nameLessByInitials.set(key, [...(nameLessByInitials.get(key) ?? []), child]);
    }
  }

  // Merge the two files into one roster of students. The Goals report is the
  // spine (it carries the district id and grade); the IEP Dates report enriches
  // those students with their compliance dates — it is the authority for them,
  // because the Goals report's IEP Date is goal vintage and the two disagree on
  // real exports — and contributes its own students too. 6 of JSUSD's 223
  // appear ONLY there: brand-new referrals with no goals written yet.
  interface RosterRow {
    firstName: string;
    lastName: string;
    gradeLevel: string;
    districtStudentId: string | null;
    schoolName: string;
    caseManager: string | null;
    dates?: RosterDatesRecord;
    dateOfBirth?: string;
    districtGoals?: RosterDistrictGoals;
    services?: DistrictServiceLine[];
    accommodations?: string[];
    testingAccommodations?: string[];
  }

  // EVERY goals student becomes its OWN row. They are never merged into each
  // other: the parser has already collapsed each student's goal rows, so two
  // entries here are two real children — and two children can share a name at
  // one school. Merging them by name would silently drop one from the roster,
  // which is the same guess this planner refuses to make everywhere else.
  const rows: RosterRow[] = input.goalsStudents.map((student) => ({
    firstName: clean(student.firstName),
    lastName: clean(student.lastName),
    gradeLevel: clean(student.gradeLevel),
    districtStudentId: districtIdValue(student.districtStudentId),
    schoolName: clean(student.schoolOfAttendance),
    caseManager: clean(student.caseManager) || null,
    districtGoals:
      student.goalDetails && student.goalDetails.length > 0
        ? { iepDate: clean(student.iepDate) || null, goals: student.goalDetails }
        : undefined,
  }));

  // Indexes for attaching a dates record to the right goals row.
  const rowsByNameSchool = new Map<string, RosterRow[]>();
  const rowsByName = new Map<string, RosterRow[]>();
  const indexRow = (row: RosterRow) => {
    const ns = nameSchoolKey(row.firstName, row.lastName, normalizeSchoolName(row.schoolName));
    rowsByNameSchool.set(ns, [...(rowsByNameSchool.get(ns) ?? []), row]);
    const n = nameSchoolKey(row.firstName, row.lastName, null);
    rowsByName.set(n, [...(rowsByName.get(n) ?? []), row]);
  };
  for (const row of rows) indexRow(row);

  let datesRowsNotUsed = 0;
  for (const record of input.datesRecords) {
    const firstName = clean(record.firstName);
    const lastName = clean(record.lastName);
    const schoolName = clean(record.schoolOfAttendance);

    // Name + school first. The name-only fallback covers the two reports
    // spelling one school differently — separate SEIS exports, and a miss there
    // would write the student with no review dates at all, which looks exactly
    // like a district that keeps none. Both steps require EXACTLY one candidate,
    // so neither can pick between two same-name students; when the files cannot
    // tell them apart, the dates are simply not attached to either.
    const exact =
      rowsByNameSchool.get(nameSchoolKey(firstName, lastName, normalizeSchoolName(schoolName))) ??
      [];
    const byName = rowsByName.get(nameSchoolKey(firstName, lastName, null)) ?? [];
    const target =
      exact.length === 1 ? exact[0] : exact.length === 0 && byName.length === 1 ? byName[0] : null;

    if (target) {
      // A repeat row for a student who already has their dates. Keeping the
      // first is right (the report is not ordered by recency), but a SECOND
      // row saying something different is worth telling the admin about.
      if (target.dates) {
        if (
          target.dates.upcomingIepDate !== record.upcomingIepDate ||
          target.dates.upcomingTriennialDate !== record.upcomingTriennialDate
        ) {
          datesRowsNotUsed++;
        }
      } else {
        target.dates = record;
      }
      if (!target.gradeLevel) target.gradeLevel = clean(record.gradeLevel);
      continue;
    }
    // More than one candidate: these dates belong to a student already on the
    // roster, we just cannot say which. Adding a row would invent a student.
    if (exact.length > 1 || byName.length > 1) {
      datesRowsNotUsed++;
      continue;
    }

    const row: RosterRow = {
      firstName,
      lastName,
      gradeLevel: clean(record.gradeLevel),
      districtStudentId: null,
      schoolName,
      caseManager: null,
      dates: record,
    };
    rows.push(row);
    indexRow(row);
  }

  // ---- The three SPE-575 files attach the same way the dates report does ----
  // Name + school first, name-only fallback (two SEIS exports can spell one
  // school differently), exactly one candidate or nothing. A student none of
  // the earlier files mentioned becomes their own roster row — every file
  // carries name, school and grade, which is all a row needs. Ambiguity is
  // counted per file, so the admin can see data that reached nobody.
  // Grade compatibility narrows a name match WITHIN one upload batch: every
  // file in the batch is the same vintage, so two same-named students in
  // different grades are two children, and a record must never fold into a row
  // whose grade contradicts it (Codex review on PR #917). A blank on either
  // side stays compatible — several files legitimately omit or fail to carry
  // grade for a student.
  const gradesCompatible = (a: string, b: string): boolean =>
    !a || !b || a.toUpperCase() === b.toUpperCase();

  const attachStudents = <T extends {
    firstName: string;
    lastName: string;
    gradeLevel: string;
    schoolOfAttendance?: string;
    dateOfBirth?: string;
    caseManager?: string;
    districtStudentId?: string;
  }>(
    records: T[],
    apply: (row: RosterRow, record: T) => void,
  ): number => {
    let notUsed = 0;
    for (const record of records) {
      const firstName = clean(record.firstName);
      const lastName = clean(record.lastName);
      const schoolName = clean(record.schoolOfAttendance);
      const recordGrade = clean(record.gradeLevel);

      const exact = (
        rowsByNameSchool.get(nameSchoolKey(firstName, lastName, normalizeSchoolName(schoolName))) ??
        []
      ).filter((row) => gradesCompatible(recordGrade, row.gradeLevel));
      const byName = (rowsByName.get(nameSchoolKey(firstName, lastName, null)) ?? []).filter(
        (row) => gradesCompatible(recordGrade, row.gradeLevel),
      );
      const target =
        exact.length === 1 ? exact[0] : exact.length === 0 && byName.length === 1 ? byName[0] : null;

      if (target) {
        apply(target, record);
        if (!target.gradeLevel) target.gradeLevel = clean(record.gradeLevel);
        if (!target.dateOfBirth) target.dateOfBirth = clean(record.dateOfBirth) || undefined;
        if (!target.caseManager) target.caseManager = clean(record.caseManager) || null;
        // The Accommodations report is the one extra file carrying District ID
        // — it can fill a blank, but never overwrites (a mismatch against the
        // Goals report would be resolved silently in whichever order the files
        // were read, which is a guess this planner refuses everywhere else).
        if (!target.districtStudentId && record.districtStudentId) {
          target.districtStudentId = districtIdValue(record.districtStudentId);
        }
        continue;
      }
      if (exact.length > 1 || byName.length > 1) {
        notUsed++;
        continue;
      }

      const row: RosterRow = {
        firstName,
        lastName,
        gradeLevel: clean(record.gradeLevel),
        districtStudentId: districtIdValue(record.districtStudentId),
        schoolName,
        caseManager: clean(record.caseManager) || null,
        dateOfBirth: clean(record.dateOfBirth) || undefined,
      };
      apply(row, record);
      rows.push(row);
      indexRow(row);
    }
    return notUsed;
  };

  // Every apply APPENDS: a second record legitimately reaching the same row
  // (a blank-grade duplicate, or the accommodations file adding to a row the
  // services file created) must add to it, never overwrite it.
  const servicesStudentsNotUsed = attachStudents(input.servicesStudents, (row, record) => {
    if (record.services.length > 0) row.services = [...(row.services ?? []), ...record.services];
  });
  const accommodationsStudentsNotUsed = attachStudents(
    input.accommodationsStudents,
    (row, record) => {
      if (record.accommodations.length > 0) {
        row.accommodations = mergeUnique(row.accommodations, record.accommodations);
      }
      // The Accommodations report's assessment rows join the Student Download's
      // entries rather than replacing them (or vice versa) — merged, de-duped.
      if (record.testingAccommodations.length > 0) {
        row.testingAccommodations = mergeUnique(
          row.testingAccommodations,
          record.testingAccommodations,
        );
      }
    },
  );
  const testingStudentsNotUsed = attachStudents(input.testingStudents, (row, record) => {
    if (record.testingAccommodations.length > 0) {
      row.testingAccommodations = mergeUnique(
        row.testingAccommodations,
        record.testingAccommodations,
      );
    }
  });

  // Two file rows carrying ONE district student id — a mid-year transfer listed
  // at both schools, or a data error in the export. Creating both would violate
  // `ux_children_district_student_id` and abort the publish partway through,
  // so refuse them here, where the admin can be told which students to check.
  const rowsByDistrictId = new Map<string, RosterRow[]>();
  for (const row of rows) {
    const key = districtIdKey(row.districtStudentId);
    if (key) rowsByDistrictId.set(key, [...(rowsByDistrictId.get(key) ?? []), row]);
  }
  const duplicatedIds = new Set(
    [...rowsByDistrictId.entries()].filter(([, list]) => list.length > 1).map(([key]) => key),
  );

  const children: PlannedChild[] = [];
  const touchedChildIds = new Set<string>();
  const compliance: RosterCompliance = {
    overdueAnnualReviews: 0,
    overdueTriennials: 0,
    missingAnnualReviewDate: 0,
    servedByNobody: 0,
    cannotLinkToTeachers: 0,
  };

  for (const row of [...rows].sort((a, b) =>
    `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
  )) {
    const initials = initialsOf(row.firstName, row.lastName);

    // Grade is NOT NULL on `children`, so a row without one cannot be written.
    if (!row.gradeLevel) {
      exceptions.push({
        kind: 'missing-grade',
        initials,
        gradeLevel: '',
        detail: 'No grade in either file, so this student cannot be added to the roster.',
      });
      continue;
    }

    const schoolId = resolveSchool(row.schoolName);
    if (!schoolId) {
      // Out-of-district placements land here (private school, home hospital).
      // Reported, not written: a child with no school can never be claimed by a
      // provider, since the claim surface is school-scoped.
      exceptions.push({
        kind: 'unknown-school',
        initials,
        gradeLevel: row.gradeLevel,
        detail: `"${row.schoolName || 'no school listed'}" is not one of your district's schools in Speddy.`,
      });
      continue;
    }

    const rowIdKey = districtIdKey(row.districtStudentId);

    // Two rows in the files claim one district student id (see above).
    if (rowIdKey && duplicatedIds.has(rowIdKey)) {
      for (const claimed of byDistrictId.get(rowIdKey) ?? []) touchedChildIds.add(claimed.id);
      exceptions.push({
        kind: 'duplicate-in-files',
        initials,
        gradeLevel: row.gradeLevel,
        detail:
          'Another student in your files has this same district student ID. Both were left ' +
          'alone — check the export for a transfer listed twice, or a mistyped ID.',
      });
      continue;
    }

    const dates = row.dates;

    // Identity, most specific first: district id, then name + school, then —
    // only for a child Speddy holds under initials alone — initials + grade +
    // school. Every rung refuses rather than guesses when more than one child
    // could be the answer, and the name rung additionally refuses its single
    // candidate when the birth date or grade says it may be a different child.
    let match: ExistingChild | undefined;
    let matchBasis: RosterMatchBasis = 'new';
    if (rowIdKey) {
      const candidates = byDistrictId.get(rowIdKey) ?? [];
      if (candidates.length > 1) {
        for (const candidate of candidates) touchedChildIds.add(candidate.id);
        exceptions.push({
          kind: 'ambiguous-name-match',
          initials,
          gradeLevel: row.gradeLevel,
          detail:
            `${candidates.length} students in Speddy already carry this district student ID; ` +
            'Speddy will not guess which one this is.',
        });
        continue;
      }
      if (candidates.length === 1) {
        match = candidates[0];
        matchBasis = 'district-student-id';
      }
    }
    if (!match) {
      const candidates = byNameSchool.get(nameSchoolKey(row.firstName, row.lastName, schoolId)) ?? [];
      if (candidates.length > 1) {
        for (const candidate of candidates) touchedChildIds.add(candidate.id);
        exceptions.push({
          kind: 'ambiguous-name-match',
          initials,
          gradeLevel: row.gradeLevel,
          detail: `${candidates.length} students at this school share this name; Speddy will not guess which one this is.`,
        });
        continue;
      }
      if (candidates.length === 1) {
        const doubt = identityDoubt(row, candidates[0]);
        if (doubt) {
          touchedChildIds.add(candidates[0].id);
          exceptions.push({
            kind: 'identity-mismatch',
            initials,
            gradeLevel: row.gradeLevel,
            detail:
              doubt === 'birth-date'
                ? 'A student in Speddy shares this name and school but has a different birth ' +
                  'date. Both were left alone — if these really are two students, include the ' +
                  'District ID column so Speddy can tell them apart.'
                : `The file says grade ${row.gradeLevel}, but the student with this name in ` +
                  `Speddy is in grade ${clean(candidates[0].gradeLevel) || '(none)'}. Left ` +
                  'alone — if this is the same student, include their District ID so Speddy ' +
                  'can be sure.',
          });
          continue;
        }
        match = candidates[0];
        matchBasis = 'name-and-school';
      }
    }
    if (!match) {
      const candidates =
        nameLessByInitials.get(initialsSchoolKey(initials, row.gradeLevel, schoolId)) ?? [];
      if (candidates.length > 1) {
        for (const candidate of candidates) touchedChildIds.add(candidate.id);
        exceptions.push({
          kind: 'ambiguous-name-match',
          initials,
          gradeLevel: row.gradeLevel,
          detail:
            `${candidates.length} students at this school are recorded as "${initials}" in ` +
            'this grade with no name; Speddy will not guess which one this is.',
        });
        continue;
      }
      if (candidates.length === 1) {
        match = candidates[0];
        matchBasis = 'initials-and-school';
      }
    }

    // A child matched by name or initials whose stored district id contradicts
    // the file is a real conflict — overwriting it would repoint the SIS
    // teacher join onto a different student.
    if (
      match &&
      matchBasis !== 'district-student-id' &&
      rowIdKey &&
      districtIdKey(match.districtStudentId) &&
      districtIdKey(match.districtStudentId) !== rowIdKey
    ) {
      touchedChildIds.add(match.id);
      exceptions.push({
        kind: 'conflicting-district-id',
        initials,
        gradeLevel: row.gradeLevel,
        detail:
          'This student already has a different district student ID in Speddy. Left unchanged — check which is right.',
      });
      continue;
    }

    // When the child already carries this same id, keep THEIR stored spelling.
    // The two agree by match key, so rewriting it to the file's casing would
    // change a value nothing reports as changed — and the SIS teacher join
    // compares it case-sensitively, so that silent rewrite could break a link
    // that works today.
    const storedIdMatches = match && districtIdKey(match.districtStudentId) === rowIdKey;
    const districtStudentId = storedIdMatches
      ? districtIdValue(match!.districtStudentId)
      : row.districtStudentId;

    // The two accommodation lists MERGE into what the child already carries,
    // never replace it: the SPE-347 mirror writes provider-accepted (and
    // provider-authored) entries onto these same child columns, so a wholesale
    // replace would drop those on every re-import — and then flag the student
    // as changed again the moment the provider's next edit mirrored them back,
    // forever. Merging also makes re-imports converge: once the child holds
    // every district entry, the comparison below reads unchanged.
    // `district_services`/`district_goals` stay replace — they are roster-owned
    // and nothing else writes them.
    const mergedAccommodations =
      row.accommodations && row.accommodations.length > 0
        ? mergeUnique(match?.accommodations, row.accommodations)
        : null;
    const mergedTesting =
      row.testingAccommodations && row.testingAccommodations.length > 0
        ? mergeUnique(match?.testingAccommodations, row.testingAccommodations)
        : null;

    const fields: RosterChildFields = {
      firstName: row.firstName,
      lastName: row.lastName,
      initials,
      gradeLevel: row.gradeLevel,
      districtStudentId,
      schoolId,
      dateOfBirth: row.dateOfBirth ?? null,
      upcomingIepDate: dates?.upcomingIepDate ?? null,
      upcomingTriennialDate: dates?.upcomingTriennialDate ?? null,
      caseManager: row.caseManager,
      accommodations: mergedAccommodations,
      testingAccommodations: mergedTesting,
      districtServices: row.services ?? null,
      districtGoals: row.districtGoals ?? null,
    };

    let action: RosterAction = 'create';
    const changedFields: string[] = [];
    if (match) {
      touchedChildIds.add(match.id);
      const compare: [string, string | null, string | null][] = [
        ['first name', fields.firstName, match.firstName],
        ['last name', fields.lastName, match.lastName],
        ['grade', fields.gradeLevel, match.gradeLevel],
        ['school', fields.schoolId, match.schoolId],
        // Compared through the match key on BOTH sides: the stored value keeps
        // the file's casing, so comparing it raw against an upper-cased one
        // would report a change on every run and rewrite the column forever.
        ['district student ID', rowIdKey, districtIdKey(match.districtStudentId)],
        ['date of birth', fields.dateOfBirth, match.dateOfBirth],
        ['annual review date', fields.upcomingIepDate, match.upcomingIepDate],
        ['triennial date', fields.upcomingTriennialDate, match.upcomingTriennialDate],
        ['case manager', fields.caseManager, match.caseManager],
      ];
      for (const [label, next, current] of compare) {
        // A blank in the file never erases a value already in Speddy — the
        // roster fills gaps and corrects, it does not delete (SPE-447 rule).
        if (next === null || next === '') continue;
        if (clean(next) !== clean(current)) changedFields.push(label);
      }
      // The structured fields follow the same rule through canonical JSON: a
      // file that was not uploaded (null) proposes nothing, and equal content
      // read back from jsonb (whose key order differs) is not a change.
      const compareJson: [string, unknown, unknown][] = [
        ['accommodations', fields.accommodations, match.accommodations],
        ['testing accommodations', fields.testingAccommodations, match.testingAccommodations],
        ['service schedule', fields.districtServices, match.districtServices],
        ['goals', fields.districtGoals, match.districtGoals],
      ];
      for (const [label, next, current] of compareJson) {
        if (next === null || (Array.isArray(next) && next.length === 0)) continue;
        if (stableStringify(next) !== stableStringify(current ?? null)) changedFields.push(label);
      }
      action = changedFields.length > 0 ? 'update' : 'unchanged';
    }

    children.push({
      action,
      matchBasis,
      childId: match?.id,
      fields,
      changedFields,
      initials,
      gradeLevel: row.gradeLevel,
    });

    // Compliance, computed over the roster as it will stand after the import.
    const annual = fields.upcomingIepDate ?? match?.upcomingIepDate ?? null;
    const triennial = fields.upcomingTriennialDate ?? match?.upcomingTriennialDate ?? null;
    if (!annual) compliance.missingAnnualReviewDate++;
    else if (annual < input.today) compliance.overdueAnnualReviews++;
    if (triennial && triennial < input.today) compliance.overdueTriennials++;
    if (!fields.districtStudentId) compliance.cannotLinkToTeachers++;
    if ((match?.caseloadCount ?? 0) === 0) compliance.servedByNobody++;
  }

  // Children this district already has that the roster did not mention.
  // Reported so the admin can see them; never removed (SPE-447 rule).
  const notInRoster = input.existingChildren
    .filter((child) => !touchedChildIds.has(child.id))
    .map((child) => ({
      initials: clean(child.initials) || '—',
      gradeLevel: clean(child.gradeLevel),
      caseloadCount: child.caseloadCount,
    }));

  return {
    refusal: null,
    children,
    exceptions,
    compliance,
    notInRoster,
    counts: {
      creates: children.filter((c) => c.action === 'create').length,
      updates: children.filter((c) => c.action === 'update').length,
      unchanged: children.filter((c) => c.action === 'unchanged').length,
      inFiles: rows.length,
      datesRowsNotUsed,
      servicesStudentsNotUsed,
      accommodationsStudentsNotUsed,
      testingStudentsNotUsed,
      withServices: children.filter((c) => (c.fields.districtServices?.length ?? 0) > 0).length,
      withAccommodations: children.filter((c) => (c.fields.accommodations?.length ?? 0) > 0).length,
      withTestingAccommodations: children.filter(
        (c) => (c.fields.testingAccommodations?.length ?? 0) > 0,
      ).length,
      withGoals: children.filter((c) => (c.fields.districtGoals?.goals.length ?? 0) > 0).length,
    },
  };
}

/** Every write the plan would make — what Publish is count-bound to. */
export function writableRosterChangeCount(plan: RosterPlan): number {
  if (plan.refusal) return 0;
  return plan.counts.creates + plan.counts.updates;
}
