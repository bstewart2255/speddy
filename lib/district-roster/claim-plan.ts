/**
 * What one provider is offered from their district's roster (SPE-447, slice 2).
 *
 * Two things, and only two, per the settled design:
 *
 *   1. Students on the roster at their school whose services for THIS
 *      provider's discipline nobody has picked up (SPE-577) — theirs to
 *      claim. A student with academic, speech and OT services appears to all
 *      three disciplines, and each claim closes only its own. Students whose
 *      services the district's data cannot route (none listed, or none a
 *      Speddy discipline delivers) keep the original SPE-447 rule: shown to
 *      everyone while nobody at all serves them.
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
import {
  matchPersonNames,
  normalizePersonName as nameKey,
  personIdentityKey,
  type NameMatchKind,
} from '@/lib/utils/person-name-match';
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
  /** Caseloads currently serving this child, however many providers that is. */
  caseloadCount: number;
  /** The DISTINCT roles of those providers, folded through normalizeServedRole
   *  (lowercase/trimmed; 'unknown' when a role could not be read — treated as
   *  blocking everyone). Role-based claiming (SPE-577) decides visibility from
   *  these, not from the count. */
  servedRoles: string[];
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
   *
   * Matched on the name exactly, with one narrow nickname fold when no spelling
   * of the caller's own name is on the roster — see `acceptedCaseManagerKeys`.
   */
  suggested: boolean;
  /**
   * HOW the name matched, so the screen can be honest about it. `'nickname'`
   * means Speddy folded a spelling ("Antoinette Bentley" for a Toni), and the
   * screen must keep the district's own wording visible: the fold is the one
   * kind of suggestion a provider might need to overrule, and it is worthless
   * to them if the name it came from is hidden. Null when not suggested.
   */
  suggestedMatch: NameMatchKind | null;
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
 * Which SEIS case-manager names mean "this caller", as the roster spells them
 * (SPE-583).
 *
 * Exact comparison is the whole rule whenever it finds anything, because of the
 * cost asymmetry: a miss leaves one unticked checkbox the provider ticks
 * themselves, while a wrong hit pre-selects someone else's student, and a
 * pre-ticked box is exactly the thing people stop reading.
 *
 * The nickname fold applies only where NO spelling of the caller's own name was
 * found — "Toni Bentley" against a roster that only ever says "Antoinette
 * Bentley". That gate is what keeps this safe: it can turn "nothing ticked"
 * into "something ticked", and can never change a suggestion the exact rule
 * already got right. Where the district's system demonstrably spells this
 * provider correctly, a different first name under the same surname is likelier
 * a colleague than a nickname, so nothing is folded.
 *
 * "A spelling of the caller's own name" means the same words, allowing for a
 * middle initial one system carries and the other doesn't. That is not a
 * nickname guess at all, so it is always accepted — otherwise a provider the
 * roster spells correctly would do WORSE than a nicknamed one across rows that
 * disagree about her middle initial.
 *
 * Beyond that the fold must be UNAMBIGUOUS. Two DIFFERENT case managers whose
 * names both fold to mine is precisely the case not to guess through, so
 * neither is pre-selected — both stay on offer, simply unticked. Counting
 * people rather than spellings matters here too: one case manager written
 * "Antoinette Bentley" on one row and "Antoinette M Bentley" on the next is one
 * person, and SEIS exports are not consistent about middle initials.
 */
const acceptedCaseManagerKeys = (
  rosterChildren: RosterChild[],
  myName: string | null | undefined,
): Map<string, NameMatchKind> => {
  const accepted = new Map<string, NameMatchKind>();
  const myIdentity = personIdentityKey(myName);
  if (myIdentity === '') return accepted;

  const foldedKeys = new Set<string>();
  const foldedPeople = new Set<string>();
  for (const child of rosterChildren) {
    const key = nameKey(child.caseManager);
    if (key === '') continue;
    if (personIdentityKey(child.caseManager) === myIdentity) {
      accepted.set(key, 'exact');
      continue;
    }
    if (matchPersonNames(child.caseManager, myName) === 'nickname') {
      foldedKeys.add(key);
      foldedPeople.add(personIdentityKey(child.caseManager));
    }
  }

  if (accepted.size === 0 && foldedPeople.size === 1) {
    for (const key of foldedKeys) accepted.set(key, 'nickname');
  }
  return accepted;
};

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

/**
 * The caseload roles that CLOSE a child to a given caller (SPE-577) — the same
 * table the claim RPC enforces, so what this planner offers is exactly what
 * the database will accept.
 *
 * A provider of the caller's own discipline (counseling and psychologist are
 * one discipline: both deliver 510/515) means the caller's service is spoken
 * for. Generalists (specialist/intervention) block every discipline — their
 * scope is "everything" — and are themselves blocked by ANY caseload, which
 * the ELSE arm produces: their family is every role, so any served child
 * reads as closed. That keeps the original SPE-447 rule for them intact.
 */
export function blockingRolesFor(role: string | null | undefined): readonly string[] {
  switch ((role ?? '').toLowerCase().trim()) {
    case 'resource':
      return ['resource', 'specialist', 'intervention'];
    case 'speech':
      return ['speech', 'specialist', 'intervention'];
    case 'ot':
      return ['ot', 'specialist', 'intervention'];
    case 'counseling':
    case 'psychologist':
      return ['counseling', 'psychologist', 'specialist', 'intervention'];
    default:
      return [
        'resource',
        'specialist',
        'speech',
        'ot',
        'counseling',
        'psychologist',
        'intervention',
      ];
  }
}

/**
 * One vocabulary for caseload roles. The family tables above are lowercase, so
 * raw profile text is folded to lowercase/trimmed at the boundary — the claim
 * RPC applies lower(btrim(…)) to the same effect, keeping what the planner
 * offers and what the database accepts in the same alphabet. Anything
 * unreadable (missing, blank, not text) becomes the 'unknown' sentinel, which
 * blocks every discipline: an unreadable caseload must close the child, never
 * open it.
 */
export function normalizeServedRole(role: unknown): string {
  const text = typeof role === 'string' ? role.trim().toLowerCase() : '';
  return text === '' ? 'unknown' : text;
}

/** Whether the district's services include a line this role delivers. */
const hasServiceForRole = (
  services: DistrictServiceLine[] | null,
  role: string | null | undefined,
): boolean => {
  const codes = getDeliveryServiceTypeCodes(role ?? '');
  if (codes.length === 0) return false;
  return (services ?? []).some((line) => codes.includes(line.code));
};

/**
 * Whether ANY listed service maps to a discipline Speddy routes (330/415/450/
 * 510/515). SEIS lists plenty that no Speddy role delivers — adapted PE,
 * behavior intervention, vision services — and a child whose services are ALL
 * unmapped must fall back to the original everyone-sees-unserved rule, or
 * they would silently vanish from every discipline's claim list.
 * (psychologist shares counseling's codes, so these four cover all five.)
 */
const hasAnyMappedService = (services: DistrictServiceLine[] | null): boolean =>
  ['resource', 'speech', 'ot', 'counseling'].some((role) =>
    hasServiceForRole(services, role),
  );

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

  const acceptedManagers = acceptedCaseManagerKeys(input.rosterChildren, input.myName);
  const blocking = blockingRolesFor(input.myRole);
  const myCodes = getDeliveryServiceTypeCodes(input.myRole ?? '');
  const claimable: ClaimOffer[] = [];
  const rosterByChildId = new Map<string, RosterChild>();
  for (const child of input.rosterChildren) {
    rosterByChildId.set(child.id, child);

    // Role-based claiming (SPE-577). A child is claimable by THIS caller when
    // their discipline's service is unserved — not when nobody serves them:
    //
    //   * Closed when the caller already has the child, or when a provider of
    //     a blocking role does ('unknown' — an unreadable role — blocks
    //     everyone). The same role-family table the claim RPC enforces.
    //   * When the district's data lists a service some discipline DELIVERS,
    //     the child must carry a line this caller's role delivers — the
    //     speech-only student never appears on the OT's list. Generalist
    //     roles have no codes of their own; their blocking family is every
    //     role, so for them this reduces to the original nobody-serves rule.
    //   * A child with NO services data — or none that maps to any discipline
    //     (adapted PE, behavior intervention…) — keeps the original rule for
    //     every role: with nothing saying whose student this is, any caseload
    //     hides them, and everyone at the school is shown the unserved ones.
    //     The RPC enforces this whole table, service arms included — what this
    //     planner offers is exactly what the database will accept.
    //
    // A same-discipline takeover remains SPE-348's flow, with its own
    // confirmation — and the database refuses it through this path regardless
    // of what this planner says.
    const closedForMe =
      myChildIds.has(child.id) ||
      child.servedRoles.some((r) => r === 'unknown' || blocking.includes(r));
    const routableServices = hasAnyMappedService(child.districtServices);
    const visible = routableServices
      ? myCodes.length > 0
        ? hasServiceForRole(child.districtServices, input.myRole) && !closedForMe
        : child.caseloadCount === 0 && !closedForMe
      : child.caseloadCount === 0 && !myChildIds.has(child.id);
    if (visible) {
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
        suggested: acceptedManagers.has(nameKey(child.caseManager)),
        suggestedMatch: acceptedManagers.get(nameKey(child.caseManager)) ?? null,
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
