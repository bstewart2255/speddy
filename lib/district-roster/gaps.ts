/**
 * Which students on the district's roster reach no provider, and WHY.
 *
 * The import already counts them — `RosterCompliance.servedByNobody` — but that
 * number lives for as long as the review screen is open and is then gone, and a
 * number on its own is unactionable anyway. 51 of John Swett's 221 published
 * students sit on nobody's caseload, and the four reasons behind that call for
 * four completely different responses: fix SEIS, nudge a provider, create an
 * account, or nothing at all. So the answer is grouped by CAUSE, not by student.
 *
 * The distinction the whole view exists for is the first kind. A student whose
 * SEIS case manager is a district admin is not waiting on anybody: district
 * admins cannot hold a caseload, so no provider is ever shown that student as
 * theirs to claim, and nothing in the product would ever have mentioned them
 * again. Six John Swett students are in exactly that state.
 *
 * Pure and IO-free — the rules can be tested without a database, and the type
 * exports can be imported by the client bundle.
 */

import { isSpecialistSourceRole } from '@/lib/auth/role-utils';
import { formatRoleLabel } from '@/lib/utils/role-utils';
import { matchPersonNames } from '@/lib/utils/person-name-match';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** One child on the district's roster, with who currently serves them. */
export interface GapChildInput {
  id: string;
  firstName: string | null;
  lastName: string | null;
  initials: string;
  gradeLevel: string | null;
  schoolId: string | null;
  /** Who SEIS names as case manager, verbatim. A claim hint, never an assignment. */
  caseManager: string | null;
  /** How many providers currently serve them. Zero is what this view is about. */
  caseloadCount: number;
}

/** One staff account in the district, for matching the roster's case-manager text. */
export interface GapStaffInput {
  id: string;
  fullName: string | null;
  role: string | null;
  /**
   * The schools this account works at — their profile's own school plus every
   * `provider_schools` link. Both halves are needed: the signup trigger writes
   * `provider_schools` rows only for MULTI-school providers (SPE-573), so a
   * single-school provider is reachable by `profiles.school_id` alone.
   */
  schoolIds: string[];
}

export interface RosterGapsInput {
  children: GapChildInput[];
  staff: GapStaffInput[];
  /** School names by id, for showing an admin where a student actually sits. */
  schoolNamesById: Record<string, string>;
  /** Per-group cap on listed students; the rest are counted, never dropped silently. */
  maxPerGroup?: number;
  /** Cap across ALL groups, spent in display order. Same promise: counted, not dropped. */
  maxStudentsListed?: number;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Why a student reaches no provider. Ordered by how stuck they are: the first
 * three need someone to act before anything can happen, the fourth is waiting on
 * a click, and the fifth is a fact about the files rather than a problem.
 */
export type RosterGapKind =
  | 'case-manager-cannot-serve'
  | 'case-manager-at-another-school'
  | 'case-manager-not-in-speddy'
  | 'awaiting-provider-claim'
  | 'no-case-manager';

/** The order groups are returned in, most stuck first. */
export const GAP_KIND_ORDER: readonly RosterGapKind[] = [
  'case-manager-cannot-serve',
  'case-manager-at-another-school',
  'case-manager-not-in-speddy',
  'awaiting-provider-claim',
  'no-case-manager',
];

export interface GapStudent {
  childId: string;
  /** Full name, or null for a legacy child stored without one — then use initials. */
  name: string | null;
  initials: string;
  gradeLevel: string;
  schoolName: string | null;
}

/** One case manager's stranded students, or the unnamed pile. */
export interface RosterGapGroup {
  kind: RosterGapKind;
  /** The case-manager name as the district's files spell it. Null for `no-case-manager`. */
  caseManager: string | null;
  /** The Speddy account it resolved to, when one exists and is spelled differently. */
  accountName: string | null;
  /** That account's role, for display ("District Admin"). Null when no account matched. */
  accountRoleLabel: string | null;
  /** Total stranded students behind this case manager. */
  studentCount: number;
  /** Up to `maxPerGroup` of them. */
  students: GapStudent[];
  /** How many more than `students` holds — shown, never silently dropped. */
  hiddenCount: number;
}

export interface RosterGaps {
  /** Every child the district has published. */
  totalOnRoster: number;
  /** Of those, how many no provider serves. */
  totalUnserved: number;
  /** Stranded students per reason, whether or not any group carries that reason. */
  countsByKind: Record<RosterGapKind, number>;
  groups: RosterGapGroup[];
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const clean = (v: string | null | undefined): string => (v ?? '').trim();

/** Every Speddy account a case-manager name reaches, split by what it can do. */
interface CaseManagerMatches {
  /** Accounts that can hold a caseload, exact spellings first. */
  providers: GapStaffInput[];
  /** Accounts that cannot, exact spellings first. */
  others: GapStaffInput[];
}

/**
 * Every Speddy account a case-manager name refers to.
 *
 * ALL matches are kept, not just the best one, because which of them counts
 * depends on the STUDENT: two providers can share a matching name and work at
 * different schools, and picking one here would strand every student at the
 * other's campus. `classifyChild` does the choosing, per child.
 *
 * The provider/other split is `isSpecialistSourceRole`, and deliberately nothing
 * else: it is the same set `requireProvider` admits and `claim_roster_children`
 * enforces in the database, so this view can never call someone a provider that
 * the claim flow would refuse — or strand a student it would happily offer.
 * SEAs are outside it (they deliver under supervision and own no caseload), and
 * so is every admin and teacher role.
 *
 * A name reaching several accounts is not hypothetical: John Swett has both a
 * `resource` provider and a SIS-synced `teacher` account reading "Cynthia
 * Shankle". Exact spellings sort ahead of nickname matches within each list, so
 * the account named back to the admin is the one they will recognize.
 */
function matchCaseManager(caseManager: string, staff: GapStaffInput[]): CaseManagerMatches {
  const providers: { staff: GapStaffInput; exact: boolean }[] = [];
  const others: { staff: GapStaffInput; exact: boolean }[] = [];

  for (const member of staff) {
    const match = matchPersonNames(caseManager, member.fullName);
    if (match === null) continue;
    const candidate = { staff: member, exact: match === 'exact' };
    if (isSpecialistSourceRole(clean(member.role))) providers.push(candidate);
    else others.push(candidate);
  }

  const exactFirst = (list: { staff: GapStaffInput; exact: boolean }[]) =>
    list
      .slice()
      .sort((a, b) => Number(b.exact) - Number(a.exact))
      .map((c) => c.staff);

  return { providers: exactFirst(providers), others: exactFirst(others) };
}

/**
 * Why THIS child reaches no provider, given everyone their case manager names.
 *
 * Per child rather than per case manager, because the answer genuinely differs
 * between two students of the same case manager: one at a school that case
 * manager works at is waiting on a click, one at a school they don't is
 * unreachable. The same is true across two same-named providers at different
 * campuses — whichever of them covers this child's school is the one that
 * matters, so the whole candidate list has to survive to this point.
 *
 * A child with no school recorded cannot be checked against anyone's schools,
 * and is left in the waiting bucket rather than accused of a problem we cannot
 * see.
 */
function classifyChild(
  matches: CaseManagerMatches,
  childSchoolId: string | null,
): { kind: RosterGapKind; account: GapStaffInput | null } {
  const { providers, others } = matches;

  if (providers.length > 0) {
    if (childSchoolId === null) {
      return { kind: 'awaiting-provider-claim', account: providers[0] };
    }
    const atThisSchool = providers.find((p) => p.schoolIds.includes(childSchoolId));
    return atThisSchool
      ? { kind: 'awaiting-provider-claim', account: atThisSchool }
      : { kind: 'case-manager-at-another-school', account: providers[0] };
  }

  if (others.length > 0) return { kind: 'case-manager-cannot-serve', account: others[0] };
  return { kind: 'case-manager-not-in-speddy', account: null };
}

/**
 * The key a group is collected under: kind, case-manager spelling, and the
 * account that spelling resolved to for these students.
 *
 * The SPELLING is kept, not replaced by the account. Where a district's files
 * carry both "Antoinette Bentley" and "Toni Bentley", both reach the same
 * provider and each keeps its own row — the honest report, and it shows the
 * admin their SEIS data disagrees with itself. Folding them would hide it.
 *
 * The ACCOUNT is in the key because one spelling can resolve to DIFFERENT people
 * for different students: two providers named "Sam Reyes" working at different
 * campuses each cover their own school's children. Keying on the name alone put
 * both sets in one row headed by whichever account the first child happened to
 * match, which sends the admin to nudge the wrong specialist.
 *
 * CASE is folded: "DENISE DOMICH" and "Denise Domich" are one group, because a
 * difference only of case says nothing an admin could act on.
 *
 * `kind` is part of the key too, so one case manager legitimately appears twice
 * when their students split across campuses they do and don't work at. Every
 * separator is a NUL, which neither a name nor a uuid can contain, so no two
 * distinct triples can collide on one key.
 */
const groupKey = (
  kind: RosterGapKind,
  caseManager: string,
  account: GapStaffInput | null,
): string => `${kind}\u0000${caseManager.toLowerCase()}\u0000${account?.id ?? ''}`;

/**
 * Sort students the way an admin reads them: by school, then by name, so a
 * multi-site district's list doesn't interleave campuses. Initials stand in for
 * a legacy child with no name stored.
 */
const studentOrder = (a: GapStudent, b: GapStudent): number =>
  (a.schoolName ?? '').localeCompare(b.schoolName ?? '') ||
  (a.name ?? a.initials).localeCompare(b.name ?? b.initials);

/** Most stuck kind first, then the biggest group, then alphabetical. */
const groupOrder = (a: RosterGapGroup, b: RosterGapGroup): number =>
  GAP_KIND_ORDER.indexOf(a.kind) - GAP_KIND_ORDER.indexOf(b.kind) ||
  b.studentCount - a.studentCount ||
  (a.caseManager ?? '').localeCompare(b.caseManager ?? '');

/**
 * Listing caps, and why there are two of them.
 *
 * The day a big district publishes for the first time, EVERY student is
 * unserved — that is the normal state of a fresh roster, not a disaster. A
 * 5,000-student district would otherwise ship every one of them down the wire
 * and render 5,000 list items, on a page whose job is to be glanceable.
 *
 * A per-group cap alone does not bound that: the students are spread over a
 * hundred case managers, so no single group is large while the total is
 * enormous. Hence a budget across all groups as well, spent in display order so
 * what an admin can actually act on is what survives.
 *
 * Every count stays exact either way. What a cap removes is only ever LISTED
 * detail, and `hiddenCount` says how much — a silently short list would read as
 * "that's all of them", which is the one thing this view must never imply.
 */
const DEFAULT_MAX_PER_GROUP = 100;
const DEFAULT_MAX_STUDENTS_LISTED = 500;

/**
 * Group every unserved child on the roster by why no provider has them.
 *
 * Children WITH a provider are counted and otherwise ignored: this view answers
 * one question, and a student someone already serves is not part of it.
 */
export function planRosterGaps(input: RosterGapsInput): RosterGaps {
  const maxPerGroup = input.maxPerGroup ?? DEFAULT_MAX_PER_GROUP;
  const countsByKind: Record<RosterGapKind, number> = {
    'case-manager-cannot-serve': 0,
    'case-manager-at-another-school': 0,
    'case-manager-not-in-speddy': 0,
    'awaiting-provider-claim': 0,
    'no-case-manager': 0,
  };

  // NAME MATCHING is memoized per distinct case-manager spelling — it walks
  // every staff account, and redoing that for each of several thousand children
  // would be the same work thousands of times over. CLASSIFICATION is not
  // memoized: it depends on the child's school, so two students of one case
  // manager can land in different groups.
  const matched = new Map<string, CaseManagerMatches>();
  const byGroup = new Map<string, RosterGapGroup>();

  let totalUnserved = 0;

  for (const child of input.children) {
    if (child.caseloadCount > 0) continue;
    totalUnserved++;

    const caseManager = clean(child.caseManager);
    let kind: RosterGapKind;
    let account: GapStaffInput | null = null;

    if (caseManager === '') {
      kind = 'no-case-manager';
    } else {
      const nameKey = caseManager.toLowerCase();
      let matches = matched.get(nameKey);
      if (!matches) {
        matches = matchCaseManager(caseManager, input.staff);
        matched.set(nameKey, matches);
      }
      ({ kind, account } = classifyChild(matches, child.schoolId));
    }

    countsByKind[kind]++;

    const key = groupKey(kind, caseManager, account);
    let group = byGroup.get(key);
    if (!group) {
      group = {
        kind,
        caseManager: caseManager === '' ? null : caseManager,
        // Only worth naming when it differs from the file's spelling — otherwise
        // the row would read "Denise Domich (Denise Domich)".
        accountName:
          account && clean(account.fullName) !== caseManager ? clean(account.fullName) : null,
        accountRoleLabel: account ? formatRoleLabel(clean(account.role) || null) : null,
        studentCount: 0,
        students: [],
        hiddenCount: 0,
      };
      byGroup.set(key, group);
    }

    group.studentCount++;
    group.students.push({
      childId: child.id,
      name: `${clean(child.firstName)} ${clean(child.lastName)}`.trim() || null,
      initials: clean(child.initials) || '—',
      gradeLevel: clean(child.gradeLevel),
      schoolName: (child.schoolId ? input.schoolNamesById[child.schoolId] : null) ?? null,
    });
  }

  const groups = [...byGroup.values()];
  groups.sort(groupOrder);

  // Sorted first, then trimmed — the budget is spent on the groups an admin
  // reads first, so a district whose list overflows still gets the students
  // nobody can reach ahead of the ones a provider could claim this afternoon.
  let budget = input.maxStudentsListed ?? DEFAULT_MAX_STUDENTS_LISTED;
  for (const group of groups) {
    group.students.sort(studentOrder);
    const listed = Math.min(group.students.length, maxPerGroup, Math.max(budget, 0));
    group.hiddenCount = group.students.length - listed;
    group.students = group.students.slice(0, listed);
    budget -= listed;
  }

  return {
    totalOnRoster: input.children.length,
    totalUnserved,
    countsByKind,
    groups,
  };
}
