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
  upcomingIepDate: string | null;
  upcomingTriennialDate: string | null;
  /** How many provider caseloads currently serve this child. */
  caseloadCount: number;
}

export interface RosterPlanInput {
  districtId: string;
  /** Today, as ISO `YYYY-MM-DD` — passed in so the planner stays pure. */
  today: string;
  goalsStudents: RosterFileStudent[];
  datesRecords: RosterDatesRecord[];
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
  upcomingIepDate: string | null;
  upcomingTriennialDate: string | null;
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
    /** Distinct students across both files. */
    inFiles: number;
  };
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const clean = (v: string | null | undefined): string => (v ?? '').trim();

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
 * at one school are reported as ambiguous rather than guessed at.
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
    counts: { creates: 0, updates: 0, unchanged: 0, inFiles: 0 },
  });

  // A goals report with no students is either the wrong file or a failed
  // parse. Applying it would write nothing but still report success, so say
  // so instead — the same posture as the link sync's empty-feed refusal.
  if (input.goalsStudents.length === 0 && input.datesRecords.length === 0) {
    return empty('Neither file contained any students. Nothing was changed.');
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
  const byDistrictId = new Map<string, ExistingChild>();
  const byNameSchool = new Map<string, ExistingChild[]>();
  const nameLessByInitials = new Map<string, ExistingChild[]>();
  for (const child of input.existingChildren) {
    const idKey = districtIdKey(child.districtStudentId);
    if (idKey) byDistrictId.set(idKey, child);
    if (clean(child.firstName) || clean(child.lastName)) {
      const nameKey = nameSchoolKey(child.firstName, child.lastName, child.schoolId);
      byNameSchool.set(nameKey, [...(byNameSchool.get(nameKey) ?? []), child]);
    } else {
      const key = initialsSchoolKey(child.initials, child.gradeLevel, child.schoolId);
      nameLessByInitials.set(key, [...(nameLessByInitials.get(key) ?? []), child]);
    }
  }

  // Dates, indexed by name + school name so they can enrich a goals row. The
  // IEP Dates report is the authority for compliance dates (the Goals report's
  // IEP Date is goal vintage, and the two disagree on real exports).
  //
  // A name-only index rides alongside as a fallback. The two reports are
  // separate SEIS exports, and if one spells a school differently from the
  // other the school-keyed lookup misses — the student would be written with
  // no review dates at all, which looks exactly like a district with no dates
  // on file. The fallback is used ONLY when exactly one student in the whole
  // dates report bears that name, so it can never pick between two.
  const datesByName = new Map<string, RosterDatesRecord>();
  const datesByNameOnly = new Map<string, RosterDatesRecord[]>();
  for (const record of input.datesRecords) {
    const key = nameSchoolKey(
      record.firstName,
      record.lastName,
      normalizeSchoolName(record.schoolOfAttendance),
    );
    if (!datesByName.has(key)) datesByName.set(key, record);
    const nameOnly = nameSchoolKey(record.firstName, record.lastName, null);
    datesByNameOnly.set(nameOnly, [...(datesByNameOnly.get(nameOnly) ?? []), record]);
  }
  const datesFor = (firstName: string, lastName: string, schoolName: string) => {
    const exact = datesByName.get(
      nameSchoolKey(firstName, lastName, normalizeSchoolName(schoolName)),
    );
    if (exact) return exact;
    const sameName = datesByNameOnly.get(nameSchoolKey(firstName, lastName, null)) ?? [];
    return sameName.length === 1 ? sameName[0] : undefined;
  };

  // Merge the two files into one roster of students. The goals report is the
  // spine (it carries the district id and grade); the dates report contributes
  // its own students too — 6 of JSUSD's 223 appear ONLY there, brand-new
  // referrals with no goals written yet, and they belong on the roster.
  interface RosterRow {
    firstName: string;
    lastName: string;
    gradeLevel: string;
    districtStudentId: string | null;
    schoolName: string;
  }
  const rows = new Map<string, RosterRow>();
  /** Row keys by name alone, for the same cross-export spelling fallback. */
  const rowKeysByName = new Map<string, string[]>();

  const addRow = (row: RosterRow, allowNameOnlyMerge: boolean) => {
    const key = nameSchoolKey(row.firstName, row.lastName, normalizeSchoolName(row.schoolName));
    const nameOnly = nameSchoolKey(row.firstName, row.lastName, null);
    let existing = rows.get(key);

    // The dates report's own students merge onto a goals row that differs only
    // in how its school is spelled — but only when there is exactly one such
    // row, so a genuine same-name-different-school pair still stays apart.
    if (!existing && allowNameOnlyMerge) {
      const candidates = rowKeysByName.get(nameOnly) ?? [];
      if (candidates.length === 1) existing = rows.get(candidates[0]);
    }

    if (!existing) {
      rows.set(key, row);
      rowKeysByName.set(nameOnly, [...(rowKeysByName.get(nameOnly) ?? []), key]);
      return;
    }
    // Same student from both files: keep the first non-empty of each field.
    if (!existing.districtStudentId && row.districtStudentId) {
      existing.districtStudentId = row.districtStudentId;
    }
    if (!existing.gradeLevel && row.gradeLevel) existing.gradeLevel = row.gradeLevel;
  };

  for (const student of input.goalsStudents) {
    addRow(
      {
        firstName: clean(student.firstName),
        lastName: clean(student.lastName),
        gradeLevel: clean(student.gradeLevel),
        districtStudentId: districtIdValue(student.districtStudentId),
        schoolName: clean(student.schoolOfAttendance),
      },
      false,
    );
  }
  for (const record of input.datesRecords) {
    addRow(
      {
        firstName: clean(record.firstName),
        lastName: clean(record.lastName),
        gradeLevel: clean(record.gradeLevel),
        districtStudentId: null,
        schoolName: clean(record.schoolOfAttendance),
      },
      true,
    );
  }

  // Two file rows carrying ONE district student id — a mid-year transfer listed
  // at both schools, or a data error in the export. Creating both would violate
  // `ux_children_district_student_id` and abort the publish partway through,
  // so refuse them here, where the admin can be told which students to check.
  const rowsByDistrictId = new Map<string, RosterRow[]>();
  for (const row of rows.values()) {
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

  for (const row of [...rows.values()].sort((a, b) =>
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
      const claimed = byDistrictId.get(rowIdKey);
      if (claimed) touchedChildIds.add(claimed.id);
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

    const dates = datesFor(row.firstName, row.lastName, row.schoolName);

    // Identity, most specific first: district id, then name + school, then —
    // only for a child Speddy holds under initials alone — initials + grade +
    // school. Every rung refuses rather than guesses when more than one child
    // could be the answer.
    let match: ExistingChild | undefined;
    let matchBasis: RosterMatchBasis = 'new';
    if (rowIdKey) {
      match = byDistrictId.get(rowIdKey);
      if (match) matchBasis = 'district-student-id';
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

    const fields: RosterChildFields = {
      firstName: row.firstName,
      lastName: row.lastName,
      initials,
      gradeLevel: row.gradeLevel,
      districtStudentId,
      schoolId,
      upcomingIepDate: dates?.upcomingIepDate ?? null,
      upcomingTriennialDate: dates?.upcomingTriennialDate ?? null,
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
        ['annual review date', fields.upcomingIepDate, match.upcomingIepDate],
        ['triennial date', fields.upcomingTriennialDate, match.upcomingTriennialDate],
      ];
      for (const [label, next, current] of compare) {
        // A blank in the file never erases a value already in Speddy — the
        // roster fills gaps and corrects, it does not delete (SPE-447 rule).
        if (next === null || next === '') continue;
        if (clean(next) !== clean(current)) changedFields.push(label);
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
      inFiles: rows.size,
    },
  };
}

/** Every write the plan would make — what Publish is count-bound to. */
export function writableRosterChangeCount(plan: RosterPlan): number {
  if (plan.refusal) return 0;
  return plan.counts.creates + plan.counts.updates;
}
