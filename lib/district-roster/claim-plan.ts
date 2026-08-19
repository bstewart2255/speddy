/**
 * What one provider is offered from their district's roster (SPE-447, slice 2).
 *
 * Two things, and only two, per the settled design:
 *
 *   1. Students on the roster at their school that NOBODY serves yet — theirs
 *      to claim.
 *   2. Students they ALREADY serve where the roster holds something newer.
 *
 * Nothing here decides anything on the provider's behalf. Every change is shown
 * before it is written, and the two kinds are kept apart because they carry
 * very different risk: filling a blank is safe, overwriting a value the
 * provider typed is not.
 *
 * WHAT IS NEVER OFFERED: a goal. The roster holds none — slice 1 writes names,
 * grade, school, district student id and the two review dates, and nothing
 * else — so a provider's own goals cannot be touched by this flow even in
 * principle. That is the strongest form of "merge, never replace".
 *
 * Pure and IO-free, so the rules can be tested without a database.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A child on the district roster, at a school this provider works at. */
export interface RosterChild {
  id: string;
  initials: string;
  firstName: string | null;
  lastName: string | null;
  gradeLevel: string;
  schoolId: string;
  districtStudentId: string | null;
  upcomingIepDate: string | null;
  upcomingTriennialDate: string | null;
  /** Caseloads currently serving this child. 0 means claimable. */
  caseloadCount: number;
}

/** One of the caller's OWN caseload rows, joined to its details. */
export interface ProviderStudent {
  studentId: string;
  /** Null only for a legacy row the SPE-347 backfill never linked. */
  childId: string | null;
  initials: string;
  firstName: string | null;
  lastName: string | null;
  gradeLevel: string;
  districtStudentId: string | null;
  upcomingIepDate: string | null;
  upcomingTriennialDate: string | null;
}

export interface ClaimPlanInput {
  rosterChildren: RosterChild[];
  myStudents: ProviderStudent[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** The roster fields a provider may accept onto their own row. */
export type RosterFieldKey =
  | 'firstName'
  | 'lastName'
  | 'gradeLevel'
  | 'districtStudentId'
  | 'upcomingIepDate'
  | 'upcomingTriennialDate';

export interface RosterFieldChange {
  field: RosterFieldKey;
  /** Wording for the review screen. */
  label: string;
  /** What this provider has today. Null when they have nothing. */
  current: string | null;
  /** What the district's roster says. Never blank — a blank is not a change. */
  roster: string;
  /**
   * `fill` — the provider has nothing here, so accepting only adds.
   * `conflict` — they have a DIFFERENT value, so accepting overwrites theirs.
   */
  kind: 'fill' | 'conflict';
}

export interface RosterUpdateOffer {
  studentId: string;
  childId: string;
  initials: string;
  gradeLevel: string;
  changes: RosterFieldChange[];
}

export interface ClaimOffer {
  childId: string;
  initials: string;
  firstName: string | null;
  lastName: string | null;
  gradeLevel: string;
  schoolId: string;
  districtStudentId: string | null;
  upcomingIepDate: string | null;
  upcomingTriennialDate: string | null;
}

export interface ClaimPlan {
  claimable: ClaimOffer[];
  updates: RosterUpdateOffer[];
  counts: {
    claimable: number;
    /** Students of theirs with at least one change on offer. */
    updates: number;
    /** Blanks the roster can fill — safe to accept in bulk. */
    fills: number;
    /** Values that disagree — each one is a decision. */
    conflicts: number;
  };
}

// ---------------------------------------------------------------------------

const clean = (v: string | null | undefined): string => (v ?? '').trim();

/** Labels are the provider's words, not the column names. */
const FIELD_LABELS: Record<RosterFieldKey, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  gradeLevel: 'Grade',
  districtStudentId: 'District student ID',
  upcomingIepDate: 'Annual review date',
  upcomingTriennialDate: 'Triennial date',
};

export function planRosterClaims(input: ClaimPlanInput): ClaimPlan {
  const myChildIds = new Set(
    input.myStudents.map((s) => clean(s.childId)).filter((id) => id !== ''),
  );

  const claimable: ClaimOffer[] = [];
  const rosterByChildId = new Map<string, RosterChild>();
  for (const child of input.rosterChildren) {
    rosterByChildId.set(child.id, child);

    // Claimable means nobody serves them — not merely "not me". Taking over a
    // student another provider already has is a different decision with its own
    // confirmation (SPE-348), and the database refuses it through this path
    // regardless of what this planner says.
    if (child.caseloadCount === 0 && !myChildIds.has(child.id)) {
      claimable.push({
        childId: child.id,
        initials: child.initials,
        firstName: child.firstName,
        lastName: child.lastName,
        gradeLevel: child.gradeLevel,
        schoolId: child.schoolId,
        districtStudentId: child.districtStudentId,
        upcomingIepDate: child.upcomingIepDate,
        upcomingTriennialDate: child.upcomingTriennialDate,
      });
    }
  }

  const updates: RosterUpdateOffer[] = [];
  for (const student of input.myStudents) {
    const childId = clean(student.childId);
    if (!childId) continue;
    const child = rosterByChildId.get(childId);
    if (!child) continue; // Theirs, but the district's roster doesn't list them.

    const pairs: [RosterFieldKey, string | null, string | null][] = [
      ['firstName', child.firstName, student.firstName],
      ['lastName', child.lastName, student.lastName],
      ['gradeLevel', child.gradeLevel, student.gradeLevel],
      ['districtStudentId', child.districtStudentId, student.districtStudentId],
      ['upcomingIepDate', child.upcomingIepDate, student.upcomingIepDate],
      ['upcomingTriennialDate', child.upcomingTriennialDate, student.upcomingTriennialDate],
    ];

    const changes: RosterFieldChange[] = [];
    for (const [field, rosterValue, currentValue] of pairs) {
      const roster = clean(rosterValue);
      const current = clean(currentValue);
      // A blank on the roster is not a change. The roster fills gaps and
      // corrects; it never proposes emptying something a provider entered.
      if (roster === '') continue;
      if (roster === current) continue;
      changes.push({
        field,
        label: FIELD_LABELS[field],
        current: current === '' ? null : current,
        roster,
        kind: current === '' ? 'fill' : 'conflict',
      });
    }

    if (changes.length > 0) {
      updates.push({
        studentId: student.studentId,
        childId,
        initials: student.initials || child.initials,
        gradeLevel: student.gradeLevel,
        changes,
      });
    }
  }

  const allChanges = updates.flatMap((u) => u.changes);
  return {
    claimable,
    updates,
    counts: {
      claimable: claimable.length,
      updates: updates.length,
      fills: allChanges.filter((c) => c.kind === 'fill').length,
      conflicts: allChanges.filter((c) => c.kind === 'conflict').length,
    },
  };
}

/** True when there is anything at all to show the provider. */
export function hasRosterOffers(plan: ClaimPlan): boolean {
  return plan.counts.claimable > 0 || plan.counts.updates > 0;
}
