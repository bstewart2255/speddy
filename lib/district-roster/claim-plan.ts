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
 * SPE-575 widened what the roster carries: service minutes, accommodation
 * lists, and goals with routing metadata. The goals/list rules stay the
 * strongest form of "merge, never replace" — an offer only ever APPENDS the
 * district's entries the provider lacks, keeps every entry of theirs, and a
 * non-empty list is never pre-ticked. Service minutes compare on the weekly
 * total, because the session split is the provider's scheduling call.
 *
 * Pure and IO-free, so the rules can be tested without a database.
 */

import {
  calculateSessions,
  fitsScheduleConstraints,
  shouldUseWeeklyBucket,
} from '@/lib/services/weekly-minutes';
import {
  getDeliveryServiceTypeCodes,
  isGoalForProviderByKeywords,
} from '@/lib/parsers/service-type-mapping';
import { dedupeEntries } from '@/lib/parsers/district-reports';
import type { SchoolLevelInput } from '@/lib/school-helpers';
import type { DistrictServiceLine } from '@/lib/parsers/district-reports';
import type { RosterDistrictGoals } from './plan';

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
  dateOfBirth: string | null;
  upcomingIepDate: string | null;
  upcomingTriennialDate: string | null;
  /** Who SEIS names as case manager, verbatim. A hint, never an assignment. */
  caseManager: string | null;
  /** District-supplied lists (SPE-575); empty when the district hasn't uploaded them. */
  accommodations: string[];
  testingAccommodations: string[];
  districtServices: DistrictServiceLine[] | null;
  districtGoals: RosterDistrictGoals | null;
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
  dateOfBirth: string | null;
  upcomingIepDate: string | null;
  upcomingTriennialDate: string | null;
  sessionsPerWeek: number | null;
  minutesPerSession: number | null;
  accommodations: string[];
  testingAccommodations: string[];
  iepGoals: string[];
}

export interface ClaimPlanInput {
  rosterChildren: RosterChild[];
  myStudents: ProviderStudent[];
  /** The caller's own name, for matching the roster's case-manager text. */
  myName?: string | null;
  /** The caller's role — decides which services and goals are theirs (SPE-575). */
  myRole?: string | null;
  /** Level info per school id, for the secondary-resource weekly bucket. */
  schoolLevels?: Record<string, SchoolLevelInput | undefined>;
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
  | 'dateOfBirth'
  | 'upcomingIepDate'
  | 'upcomingTriennialDate'
  | 'serviceMinutes'
  | 'accommodations'
  | 'testingAccommodations'
  | 'iepGoals';

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
   * `conflict` — they have a DIFFERENT value, so accepting overwrites theirs
   * (for the list fields: adds to a list they curated, which is theirs to
   * decide too).
   */
  kind: 'fill' | 'conflict';
  /**
   * List fields only: the FULL list acceptance stores — the provider's own
   * entries first, the district's additions appended. The write layer uses
   * this, never the display strings above.
   */
  values?: string[];
  /** serviceMinutes only: the split acceptance stores. */
  split?: { sessionsPerWeek: number; minutesPerSession: number };
  /** iepGoals only: the goal vintage written to `goals_iep_date`. */
  goalsIepDate?: string | null;
}

/** What claiming would put on the new caseload row, per the caller's role. */
export interface ServiceMinutesProposal {
  weeklyMinutes: number;
  sessionsPerWeek: number;
  minutesPerSession: number;
  /** The service names the minutes came from, e.g. ["Language and Speech"]. */
  serviceNames: string[];
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
  dateOfBirth: string | null;
  upcomingIepDate: string | null;
  upcomingTriennialDate: string | null;
  /** Verbatim, for the screen to say WHY this one is suggested. */
  caseManager: string | null;
  /**
   * What claiming brings along (SPE-575), all computed for THIS caller: their
   * role's service minutes, the district's accommodation lists, and the goals
   * whose SEIS metadata routes to their discipline. Applied right after the
   * claim through the provider's own session — never someone else's row.
   */
  minutesProposal: ServiceMinutesProposal | null;
  accommodations: string[];
  testingAccommodations: string[];
  goals: string[];
  goalsIepDate: string | null;
  /**
   * The district names this provider as the student's case manager, so the
   * screen may pre-select them. Being a hint is the whole point: case manager
   * is not the same role as service provider (one pilot SLP serves 42 students
   * while managing 17), so a false means "decide yourself", never "not yours".
   */
  suggested: boolean;
}

export interface ClaimPlan {
  claimable: ClaimOffer[];
  updates: RosterUpdateOffer[];
  counts: {
    claimable: number;
    /** Students of theirs with at least one change on offer. */
    updates: number;
    /** Of the claimable, how many the district says this provider manages. */
    suggested: number;
    /** Blanks the roster can fill — safe to accept in bulk. */
    fills: number;
    /** Values that disagree — each one is a decision. */
    conflicts: number;
  };
}

// ---------------------------------------------------------------------------

const clean = (v: string | null | undefined): string => (v ?? '').trim();

/**
 * Compare a SEIS case-manager name with a Speddy provider's name.
 *
 * Exact after normalizing case, punctuation and spacing — deliberately no fuzzy
 * matching. A miss costs one unticked checkbox the provider ticks themselves; a
 * wrong hit pre-selects someone else's student, and although the provider still
 * confirms, a pre-ticked box is exactly the thing people stop reading.
 */
const nameKey = (name: string | null | undefined): string =>
  clean(name)
    .toLowerCase()
    // Apostrophes are pure noise between two spellings of one name — the pilot
    // district's SEIS writes "Charli OMalley" where Speddy has "Charli
    // O'Malley". Both the straight and curly forms, since exports use either.
    .replace(/['\u2019.,]/g, '')
    .replace(/\s+/g, ' ');

/** Labels are the provider's words, not the column names. */
const FIELD_LABELS: Record<RosterFieldKey, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  gradeLevel: 'Grade',
  districtStudentId: 'District student ID',
  dateOfBirth: 'Date of birth',
  upcomingIepDate: 'Annual review date',
  upcomingTriennialDate: 'Triennial date',
  serviceMinutes: 'Service minutes',
  accommodations: 'Classroom accommodations',
  testingAccommodations: 'Testing accommodations',
  iepGoals: 'IEP goals',
};

// ---------------------------------------------------------------------------
// District data helpers (SPE-575)
// ---------------------------------------------------------------------------

/**
 * Validate the `children.district_services` JSON into typed service lines.
 * Anything malformed is dropped rather than crashing an offer — a child with
 * unreadable stored data simply carries no proposal.
 */
export function parseDistrictServices(value: unknown): DistrictServiceLine[] | null {
  if (!Array.isArray(value)) return null;
  const lines: DistrictServiceLine[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== 'object') continue;
    const line = raw as Record<string, unknown>;
    if (typeof line.code !== 'string' || typeof line.weeklyMinutes !== 'number') continue;
    lines.push({
      code: line.code,
      name: typeof line.name === 'string' ? line.name : `Service ${line.code}`,
      minutes: typeof line.minutes === 'number' ? line.minutes : 0,
      frequency:
        line.frequency === 'daily' ||
        line.frequency === 'weekly' ||
        line.frequency === 'monthly' ||
        line.frequency === 'yearly'
          ? line.frequency
          : 'weekly',
      weeklyMinutes: line.weeklyMinutes,
    });
  }
  return lines.length > 0 ? lines : null;
}

/** Validate the `children.district_goals` JSON. Same drop-don't-crash posture. */
export function parseDistrictGoals(value: unknown): RosterDistrictGoals | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const parsed = value as Record<string, unknown>;
  if (!Array.isArray(parsed.goals)) return null;
  const goals = parsed.goals
    .filter((g): g is Record<string, unknown> => g !== null && typeof g === 'object')
    .filter((g) => typeof g.text === 'string' && (g.text as string).trim() !== '')
    .map((g) => ({
      text: String(g.text),
      areaOfNeed: typeof g.areaOfNeed === 'string' ? g.areaOfNeed : '',
      goalType: typeof g.goalType === 'string' ? g.goalType : '',
      personResponsible: typeof g.personResponsible === 'string' ? g.personResponsible : '',
    }));
  if (goals.length === 0) return null;
  return { iepDate: typeof parsed.iepDate === 'string' ? parsed.iepDate : null, goals };
}

/**
 * The minutes a claim would pre-fill for THIS role, from the child's district
 * service lines: the role's own services (the deliveries question, SPE-554),
 * summed across split lines, shaped by the same session math the per-provider
 * minutes import uses. Roles that deliver no single service (specialist,
 * intervention) get no proposal — summing every service on the IEP into one
 * caseload number would be wrong for all of them.
 */
export function proposeServiceMinutes(
  services: DistrictServiceLine[] | null,
  role: string | null | undefined,
  school: SchoolLevelInput | null | undefined,
): ServiceMinutesProposal | null {
  if (!services || !role) return null;
  const codes = getDeliveryServiceTypeCodes(role);
  if (codes.length === 0) return null;
  const mine = services.filter((line) => codes.includes(line.code));
  const weeklyMinutes = mine.reduce((sum, line) => sum + line.weeklyMinutes, 0);
  // Whole positive integers only: the parsers always produce them, but the
  // stored JSONB is untyped, and a fractional total would flow into the
  // integer minutes columns unchecked.
  if (!Number.isInteger(weeklyMinutes) || weeklyMinutes <= 0) return null;
  const split = calculateSessions(weeklyMinutes, {
    weeklyBucket: shouldUseWeeklyBucket(role, school),
  });
  if (!fitsScheduleConstraints(split)) return null;
  const serviceNames: string[] = [];
  for (const line of mine) {
    if (!serviceNames.includes(line.name)) serviceNames.push(line.name);
  }
  return { weeklyMinutes, ...split, serviceNames };
}

/** The district goals whose SEIS metadata routes to this role's discipline. */
export function goalsForRole(
  districtGoals: RosterDistrictGoals | null,
  role: string | null | undefined,
): string[] {
  if (!districtGoals || !role) return [];
  // De-duped: one goal text can carry several routing signatures (the same
  // goal listed under two disciplines), and more than one may match this role.
  return dedupeEntries(
    districtGoals.goals
      .filter((goal) =>
        isGoalForProviderByKeywords(goal.areaOfNeed, goal.goalType, goal.personResponsible, role),
      )
      .map((goal) => goal.text),
  );
}

/** Whitespace-insensitive text key, for "does the provider already have this entry". */
const entryKey = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

/** The district entries the provider's own list is missing, themselves de-duped. */
const listAdditions = (mine: string[], district: string[]): string[] => {
  const have = new Set(mine.map(entryKey));
  const additions: string[] = [];
  for (const entry of district) {
    const key = entryKey(entry);
    if (entry.trim() === '' || have.has(key)) continue;
    have.add(key);
    additions.push(entry);
  }
  return additions;
};

const describeSplit = (split: { sessionsPerWeek: number; minutesPerSession: number }): string =>
  `${split.sessionsPerWeek}×${split.minutesPerSession} min/week`;

export function planRosterClaims(input: ClaimPlanInput): ClaimPlan {
  const myChildIds = new Set(
    input.myStudents.map((s) => clean(s.childId)).filter((id) => id !== ''),
  );

  const myKey = nameKey(input.myName);
  const claimable: ClaimOffer[] = [];
  const rosterByChildId = new Map<string, RosterChild>();
  for (const child of input.rosterChildren) {
    rosterByChildId.set(child.id, child);

    // Claimable means nobody serves them — not merely "not me". Taking over a
    // student another provider already has is a different decision with its own
    // confirmation (SPE-348), and the database refuses it through this path
    // regardless of what this planner says.
    if (child.caseloadCount === 0 && !myChildIds.has(child.id)) {
      const school = input.schoolLevels?.[child.schoolId] ?? null;
      claimable.push({
        childId: child.id,
        initials: child.initials,
        firstName: child.firstName,
        lastName: child.lastName,
        gradeLevel: child.gradeLevel,
        schoolId: child.schoolId,
        districtStudentId: child.districtStudentId,
        dateOfBirth: child.dateOfBirth,
        upcomingIepDate: child.upcomingIepDate,
        upcomingTriennialDate: child.upcomingTriennialDate,
        caseManager: child.caseManager,
        minutesProposal: proposeServiceMinutes(child.districtServices, input.myRole, school),
        accommodations: child.accommodations,
        testingAccommodations: child.testingAccommodations,
        goals: goalsForRole(child.districtGoals, input.myRole),
        goalsIepDate: child.districtGoals?.iepDate ?? null,
        suggested: myKey !== '' && nameKey(child.caseManager) === myKey,
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
      ['dateOfBirth', child.dateOfBirth, student.dateOfBirth],
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

    // Service minutes compare on the WEEKLY TOTAL, never the split: how a
    // mandate is chopped into sessions is the provider's scheduling call, so
    // their 2×15 equals the district's 30 min/week and proposes nothing.
    // A current split equal to the one acceptance would WRITE is also not a
    // change: the 30-minute chop rounds up (51 min/week stores as 2×30 = 60),
    // so comparing the stored 60 against the mandate's 51 after acceptance
    // would re-flag a conflict forever that accepting can never clear.
    const school = input.schoolLevels?.[child.schoolId] ?? null;
    const proposal = proposeServiceMinutes(child.districtServices, input.myRole, school);
    if (proposal) {
      const hasMinutes =
        typeof student.sessionsPerWeek === 'number' &&
        student.sessionsPerWeek > 0 &&
        typeof student.minutesPerSession === 'number' &&
        student.minutesPerSession > 0;
      const currentWeekly = hasMinutes
        ? student.sessionsPerWeek! * student.minutesPerSession!
        : null;
      const matchesProposalSplit =
        hasMinutes &&
        student.sessionsPerWeek === proposal.sessionsPerWeek &&
        student.minutesPerSession === proposal.minutesPerSession;
      if (!matchesProposalSplit && (currentWeekly === null || currentWeekly !== proposal.weeklyMinutes)) {
        changes.push({
          field: 'serviceMinutes',
          label: FIELD_LABELS.serviceMinutes,
          current: hasMinutes
            ? `${describeSplit({
                sessionsPerWeek: student.sessionsPerWeek!,
                minutesPerSession: student.minutesPerSession!,
              })} (${currentWeekly} min/week)`
            : null,
          roster: `${proposal.weeklyMinutes} min/week of ${proposal.serviceNames.join(' + ')} — would be set as ${describeSplit(proposal)}`,
          kind: currentWeekly === null ? 'fill' : 'conflict',
          split: {
            sessionsPerWeek: proposal.sessionsPerWeek,
            minutesPerSession: proposal.minutesPerSession,
          },
        });
      }
    }

    // The three lists MERGE, never replace: acceptance appends the district's
    // entries the provider lacks and keeps every entry of theirs. An empty
    // list fills quietly; additions to a list they curated are their call.
    const listOffers: Array<{
      field: RosterFieldKey;
      mine: string[];
      district: string[];
      noun: string;
      goalsIepDate?: string | null;
    }> = [
      {
        field: 'accommodations',
        mine: student.accommodations,
        district: child.accommodations,
        noun: 'accommodation',
      },
      {
        field: 'testingAccommodations',
        mine: student.testingAccommodations,
        district: child.testingAccommodations,
        noun: 'testing accommodation',
      },
      {
        field: 'iepGoals',
        mine: student.iepGoals,
        district: goalsForRole(child.districtGoals, input.myRole),
        noun: 'goal',
        goalsIepDate: child.districtGoals?.iepDate ?? null,
      },
    ];
    for (const offer of listOffers) {
      const additions = listAdditions(offer.mine, offer.district);
      if (additions.length === 0) continue;
      changes.push({
        field: offer.field,
        label: FIELD_LABELS[offer.field],
        current: offer.mine.length > 0 ? `${offer.mine.length} of your own` : null,
        roster: `adds ${additions.length} ${offer.noun}${additions.length === 1 ? '' : 's'} from the district`,
        kind: offer.mine.length === 0 ? 'fill' : 'conflict',
        values: [...offer.mine, ...additions],
        ...(offer.field === 'iepGoals' ? { goalsIepDate: offer.goalsIepDate } : {}),
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
      suggested: claimable.filter((c) => c.suggested).length,
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
