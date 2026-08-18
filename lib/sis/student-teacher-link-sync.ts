/**
 * OneRoster class rosters → `student_teachers` links (SPE-540, SPE-414 Part 2).
 *
 * Fills in "who teaches this kid" for every caseload child at the district's
 * pilot schools, from the same class rosters the SIS uses to run the school
 * day. Runs as a PLAN first (dry-run: per-school counts plus the anomalies a
 * human can actually fix, zero writes); APPLY recomputes server-side and is
 * count-bound to the preview the admin reviewed.
 *
 * The matching spine (owner-approved 2026-08-18):
 *
 *   SIS student ──(identifier)──> children.district_student_id, trim-exact —
 *                                 compound identifiers (Aeries sends
 *                                 `33_STU_900012345`) also match by the bare
 *                                 number after the last underscore — falling
 *                                 back to a CONFLICT-FREE value from the
 *                                 child's caseload copies when the child
 *                                 record's own field is blank
 *   SIS student ──(enrollments, role=student)──> their live classes
 *   live class  ──(enrollments, role=teacher)──> SIS teacher sourcedIds
 *   SIS teacher ──(teachers.sis_id)──> the directory row AT THE CHILD'S
 *                                      SCHOOL (written by the teacher sync)
 *
 * PROVENANCE IS THE SAFETY RAIL. Links written here carry
 * `source = 'oneroster'` and those are the ONLY rows this sync will ever
 * relabel or remove; a provider's hand-added link (`source = 'human'`) is
 * never touched, even when the rosters disagree with it. Every UPDATE and
 * DELETE repeats the source in its WHERE clause as a second lock.
 *
 * WHAT NEVER HAPPENS: an unmatched child's links are never diffed (a typo'd
 * district ID must not strip a kid's teachers), and a feed that comes back
 * with no students, no classes, a roster side missing, or rosters that no
 * longer line up with the class list (a partially updated snapshot) refuses
 * the whole run loudly instead of planning a mass delete.
 *
 * PRIVACY. Plans carry child INITIALS and grade only — enough for a district
 * admin (who already sees full names in Directories) to find the record to
 * fix. Logs and audit rows carry counts and fixed words, never initials,
 * names, or IDs. This surface exists ONLY in the district-admin portal; no
 * staff/internal panel renders any of it.
 *
 * Server-only: dials an external SIS with a decrypted credential.
 */
import { logger } from '@/lib/logger';
import { createServiceClient } from '@/lib/supabase/server';
import { logServerAuditEvent } from '@/lib/supabase/audit-log-server';
import {
  OneRosterClient,
  type RawOneRosterClass,
  type RawOneRosterEnrollment,
  type RawOneRosterUser,
} from '@/lib/integrations/oneroster';
import { ONEROSTER_URL_LABELS, assertSafeSisUrl } from './ssrf-guard';
import { oneRosterTokenUrlCandidates } from './oneroster-setup';
import {
  TEACHER_SIS_SOURCE,
  type SpeddySchool,
  type TeacherSyncConnectionParams,
} from './teacher-directory-sync';

const log = logger.child({ module: 'student-teacher-link-sync' });

/** The value `student_teachers.source` carries for rows this sync owns. */
export const LINK_SOURCE = 'oneroster';

/**
 * Every key form a SIS student identifier can honestly answer to: the
 * identifier verbatim (trimmed) and — when it carries Aeries' `STU` segment
 * (`{schoolCode}_STU_{number}`, verified against JSUSD live 2026-08-18;
 * teachers use the same wrapper as `11_TCH_1174`) — the bare number after
 * the last underscore, which is what Speddy's district_student_id holds.
 *
 * The unwrap is DELIBERATELY anchored to the STU marker rather than any
 * underscore: a different vendor whose real identifiers merely contain
 * underscores (`local_123`) must not be indexed under a tail that could
 * exact-equal an unrelated child's stored ID (PR #894 review, self + Codex).
 *
 * ONE definition, shared by the link-sync planner and the import-preview
 * lookup (SPE-546), so the identifier dialect cannot drift between the two
 * surfaces that answer "which SIS student is this child".
 */
export function studentIdentifierKeys(identifier: string): string[] {
  const verbatim = identifier.trim();
  if (!verbatim) return [];
  const keys = new Set<string>([verbatim]);
  if (/(^|_)STU_/i.test(verbatim)) {
    const tail = verbatim.slice(verbatim.lastIndexOf('_') + 1).trim();
    if (tail) keys.add(tail);
  }
  return [...keys];
}

// ---------------------------------------------------------------------------
// Planner input shapes — plain data, so the planner is testable without HTTP.
// ---------------------------------------------------------------------------

export interface LinkFeedStudent {
  sourcedId: string;
  /** The district's own student number — the field that matches Speddy. */
  identifier: string | null;
}

export interface LinkFeedEnrollment {
  userSourcedId: string;
  classSourcedId: string;
  role: 'student' | 'teacher';
}

export interface LinkFeedClass {
  sourcedId: string;
  title: string | null;
  periods: string[];
}

/** One caseload copy's contribution to matching: its child and its ID field. */
export interface CaseloadRow {
  childId: string;
  districtStudentId: string | null;
}

/** The child record — canonical school, display initials, primary ID field. */
export interface ChildRecord {
  id: string;
  schoolId: string | null;
  initials: string;
  gradeLevel: string | null;
  districtStudentId: string | null;
}

/** A directory row the teacher sync keyed — the only linkable teachers. */
export interface SisKeyedTeacher {
  id: string;
  schoolId: string;
  sisId: string;
}

export interface ExistingLink {
  id: string;
  childId: string;
  teacherId: string;
  subject: string | null;
  period: string | null;
  source: string;
}

export interface LinkPlannerInput {
  feedStudents: LinkFeedStudent[];
  feedEnrollments: LinkFeedEnrollment[];
  feedClasses: LinkFeedClass[];
  speddySchools: SpeddySchool[];
  caseloadRows: CaseloadRow[];
  childRecords: ChildRecord[];
  sisTeachers: SisKeyedTeacher[];
  existingLinks: ExistingLink[];
}

// ---------------------------------------------------------------------------
// Plan shapes — what the district panel renders and what apply executes.
// ---------------------------------------------------------------------------

export interface PlannedLinkAdd {
  childId: string;
  teacherId: string;
  subject: string | null;
  period: string | null;
}

export interface PlannedLinkRemove {
  linkId: string;
}

export interface PlannedLinkRelabel {
  linkId: string;
  subject: string | null;
  period: string | null;
}

export type UnmatchedReason =
  | 'no-district-id'
  | 'conflicting-district-ids'
  | 'not-in-sis'
  | 'duplicate-in-sis'
  /** Same bare number under different SIS wrappers — a dual-site student. */
  | 'multiple-sis-records';

/** A child a human can go fix — initials and grade, never a name. */
export interface UnmatchedChild {
  initials: string;
  grade: string | null;
  reason: UnmatchedReason;
}

export interface LinkSchoolPlan {
  schoolId: string;
  schoolName: string;
  /** Caseload children whose child record sits at this school. */
  caseloadChildren: number;
  /** Of those, how many resolved to exactly one SIS student. */
  matchedChildren: number;
  adds: PlannedLinkAdd[];
  removes: PlannedLinkRemove[];
  relabels: PlannedLinkRelabel[];
  unchanged: number;
  /** Hand-added links of matched children — reported, NEVER written to. */
  humanLinksKept: number;
  /**
   * Distinct (child, SIS teacher) edges dropped because no directory row at
   * this school carries that SIS key — the "run the Teacher sync first" gap.
   */
  teachersNotInDirectory: number;
  unmatched: UnmatchedChild[];
  /** Matched, rosters read, and the SIS genuinely lists no teachers. */
  noTeachersFound: { initials: string; grade: string | null }[];
}

export interface LinkSyncPlan {
  /**
   * The loud whole-run no. Set when the feed's shape makes a diff unsafe —
   * no students, no classes, or a roster side absent — because reconciling
   * against an empty feed would plan removal of every synced link. A refused
   * plan writes nothing and its writable count is zero.
   */
  refusal: string | null;
  schools: LinkSchoolPlan[];
  /** Caseload children whose child record sits at no pilot school — skipped. */
  unplacedChildren: number;
  /** Enrollment rows naming a class the live class list doesn't carry. */
  staleEnrollments: number;
  feedStudents: number;
  studentEnrollments: number;
  teacherEnrollments: number;
  liveClasses: number;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const trimOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** One key for "this SIS teacher at this school". */
// The separator is an ESCAPED NUL — written as an escape on purpose: a raw
// 0x00 byte here makes git classify this whole module as binary and hides
// it from every diff-based review (found the hard way on PR #886).
const teacherKey = (schoolId: string, sisId: string): string => `${schoolId}\u0000${sisId}`;

/**
 * The display labels for one link, derived from EVERY class this teacher
 * shares with this student. Deterministic (sorted, distinct) so re-running
 * the sync can never flap a label back and forth, and the relabel diff means
 * "the rosters changed", not "the join order changed".
 *
 * Exported for the import preview (SPE-546), which must show EXACTLY the
 * label this sync will write — a preview computing its own sort order would
 * make the label appear to change right after importing (PR #896 review).
 */
export function linkLabels(titles: Set<string>, periods: Set<string>): {
  subject: string | null;
  period: string | null;
} {
  const subject = [...titles].sort((a, b) => a.localeCompare(b)).join(' / ');
  const period = [...periods]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .join('/');
  return { subject: subject || null, period: period || null };
}

// ---------------------------------------------------------------------------
// The planner — pure, so tests can pin every rung without a server.
// ---------------------------------------------------------------------------

export function planStudentTeacherLinkSync(input: LinkPlannerInput): LinkSyncPlan {
  // Live classes, deduped by sourcedId (a paging echo must not double a class).
  const classById = new Map<string, LinkFeedClass>();
  for (const c of input.feedClasses) {
    if (c.sourcedId && !classById.has(c.sourcedId)) classById.set(c.sourcedId, c);
  }

  // Enrollment edges → the two directed maps. Each side is counted TWICE:
  // raw presence (the evidence the roster option is on at all) and edges
  // that actually JOINED a live class. The refusals below need both — a
  // snapshot whose roster entries all name vanished classes has healthy raw
  // counts and an empty joined side, and diffing against it would plan
  // removal of every synced link (Codex P1, PR #886).
  let studentEnrollments = 0;
  let teacherEnrollments = 0;
  let joinedStudentEdges = 0;
  let joinedTeacherEdges = 0;
  let staleEnrollments = 0;
  const classesByStudent = new Map<string, Set<string>>();
  const teachersByClass = new Map<string, Set<string>>();
  for (const e of input.feedEnrollments) {
    if (!e.userSourcedId || !e.classSourcedId) continue;
    if (e.role === 'student') studentEnrollments += 1;
    else if (e.role === 'teacher') teacherEnrollments += 1;
    else continue;
    if (!classById.has(e.classSourcedId)) {
      staleEnrollments += 1;
      continue;
    }
    if (e.role === 'student') joinedStudentEdges += 1;
    else joinedTeacherEdges += 1;
    const map = e.role === 'student' ? classesByStudent : teachersByClass;
    const key = e.role === 'student' ? e.userSourcedId : e.classSourcedId;
    const value = e.role === 'student' ? e.classSourcedId : e.userSourcedId;
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  }

  // SIS students by district number. Deduped by sourcedId first so a paging
  // echo cannot manufacture a fake "two SIS students share this number".
  // Key derivation (verbatim + Aeries STU-tail) lives in
  // studentIdentifierKeys, shared with the import preview; records colliding
  // on any key form land in an unmatched refusal below, never a guess.
  const seenSisStudents = new Set<string>();
  const sisStudentsByIdentifier = new Map<string, { sourcedId: string; verbatim: string }[]>();
  let feedStudentCount = 0;
  for (const s of input.feedStudents) {
    if (!s.sourcedId || seenSisStudents.has(s.sourcedId)) continue;
    seenSisStudents.add(s.sourcedId);
    feedStudentCount += 1;
    const verbatim = s.identifier?.trim();
    if (!verbatim) continue;
    for (const key of studentIdentifierKeys(verbatim)) {
      const list = sisStudentsByIdentifier.get(key) ?? [];
      list.push({ sourcedId: s.sourcedId, verbatim });
      sisStudentsByIdentifier.set(key, list);
    }
  }

  const emptyPlan = (refusal: string): LinkSyncPlan => ({
    refusal,
    schools: [],
    unplacedChildren: 0,
    staleEnrollments,
    feedStudents: feedStudentCount,
    studentEnrollments,
    teacherEnrollments,
    liveClasses: classById.size,
  });

  // The mass-delete guards: reconciling against a feed with a whole side
  // missing would plan removal of every link a previous run wrote. Refuse
  // and say which side, so the district knows what to flip back on.
  if (feedStudentCount === 0) {
    return emptyPlan(
      'Your SIS returned no students at all, so nothing can be matched. Nothing was changed — ' +
        'run the connection test in the tech portal.',
    );
  }
  if (studentEnrollments === 0 || teacherEnrollments === 0) {
    const side = studentEnrollments === 0 ? 'student' : 'teacher';
    return emptyPlan(
      `Your SIS class rosters came back with no ${side} entries — the roster sharing option ` +
        'may be turned off in your SIS. Nothing was changed.',
    );
  }
  if (classById.size === 0) {
    return emptyPlan(
      'Your SIS returned no classes, so rosters cannot be read. Nothing was changed.',
    );
  }
  if (joinedStudentEdges === 0 || joinedTeacherEdges === 0) {
    // Both roster sides exist and classes exist, but they don't reference
    // each other — a partially updated snapshot (e.g. rosters exported
    // before a term rollover the class list already made). Diffing would
    // read as "every student lost every teacher".
    return emptyPlan(
      "Your SIS roster entries don't line up with its current class list — the feed looks " +
        'partially updated. Nothing was changed — try again later.',
    );
  }

  // Directory rows by (school, SIS key) — the only teachers a link can name.
  const teacherRowByKey = new Map<string, string>();
  for (const t of input.sisTeachers) {
    if (t.schoolId && t.sisId) teacherRowByKey.set(teacherKey(t.schoolId, t.sisId), t.id);
  }

  const childRecordById = new Map(input.childRecords.map((c) => [c.id, c]));
  const existingByChild = new Map<string, ExistingLink[]>();
  for (const link of input.existingLinks) {
    const list = existingByChild.get(link.childId) ?? [];
    list.push(link);
    existingByChild.set(link.childId, list);
  }

  // Caseload-copy district numbers per child — the fallback matching source.
  const rowIdsByChild = new Map<string, Set<string>>();
  const childIds = new Set<string>();
  for (const row of input.caseloadRows) {
    if (!row.childId) continue;
    childIds.add(row.childId);
    const value = row.districtStudentId?.trim();
    if (!value) continue;
    const set = rowIdsByChild.get(row.childId) ?? new Set<string>();
    set.add(value);
    rowIdsByChild.set(row.childId, set);
  }

  const schoolPlans = new Map<string, LinkSchoolPlan>();
  for (const school of input.speddySchools) {
    schoolPlans.set(school.id, {
      schoolId: school.id,
      schoolName: school.name,
      caseloadChildren: 0,
      matchedChildren: 0,
      adds: [],
      removes: [],
      relabels: [],
      unchanged: 0,
      humanLinksKept: 0,
      teachersNotInDirectory: 0,
      unmatched: [],
      noTeachersFound: [],
    });
  }

  let unplacedChildren = 0;

  // Sorted for a deterministic plan — same feed, same database, same bytes.
  for (const childId of [...childIds].sort()) {
    const record = childRecordById.get(childId);
    const school = record?.schoolId ? schoolPlans.get(record.schoolId) : undefined;
    if (!record || !school) {
      // The child record sits at no pilot school (or is missing). Out of
      // scope by the owner's decision — and deliberately NOT diffed, so
      // nothing is ever removed from a child this run cannot see properly.
      unplacedChildren += 1;
      continue;
    }
    school.caseloadChildren += 1;

    // District number: the child record's own field first, else the single
    // conflict-free value its caseload copies carry (11 JSUSD children live
    // in that gap today; 0 conflict).
    let districtNumber = record.districtStudentId?.trim() || null;
    if (!districtNumber) {
      const fromRows = rowIdsByChild.get(childId) ?? new Set<string>();
      if (fromRows.size > 1) {
        school.unmatched.push({
          initials: record.initials,
          grade: record.gradeLevel,
          reason: 'conflicting-district-ids',
        });
        continue;
      }
      districtNumber = fromRows.size === 1 ? [...fromRows][0] : null;
    }
    if (!districtNumber) {
      school.unmatched.push({
        initials: record.initials,
        grade: record.gradeLevel,
        reason: 'no-district-id',
      });
      continue;
    }

    const sisMatches = sisStudentsByIdentifier.get(districtNumber) ?? [];
    if (sisMatches.length === 0) {
      school.unmatched.push({
        initials: record.initials,
        grade: record.gradeLevel,
        reason: 'not-in-sis',
      });
      continue;
    }
    if (sisMatches.length > 1) {
      // More than one SIS record answers to this number — linking any one
      // record's teachers would be a guess about a child, so both shapes
      // refuse. They still need DIFFERENT advice: identical full identifiers
      // are a district-side data error, while different wrappers around the
      // same bare number is Aeries' own export for a student enrolled at two
      // sites — nothing to "fix" district-side, link by hand for now
      // (PR #894 review; union-of-records is the follow-up if it recurs).
      const verbatims = new Set(sisMatches.map((m) => m.verbatim));
      school.unmatched.push({
        initials: record.initials,
        grade: record.gradeLevel,
        reason: verbatims.size > 1 ? 'multiple-sis-records' : 'duplicate-in-sis',
      });
      continue;
    }
    school.matchedChildren += 1;

    // The desired teacher set: every teacher of every live class the student
    // sits in, resolved to directory rows at the CHILD'S school (the same
    // school the database's link trigger enforces).
    const desired = new Map<string, { titles: Set<string>; periods: Set<string> }>();
    const missingFromDirectory = new Set<string>();
    for (const classId of classesByStudent.get(sisMatches[0].sourcedId) ?? []) {
      const cls = classById.get(classId);
      if (!cls) continue;
      for (const teacherSisId of teachersByClass.get(classId) ?? []) {
        const rowId = teacherRowByKey.get(teacherKey(school.schoolId, teacherSisId));
        if (!rowId) {
          missingFromDirectory.add(teacherSisId);
          continue;
        }
        const entry = desired.get(rowId) ?? { titles: new Set(), periods: new Set() };
        if (cls.title) entry.titles.add(cls.title);
        for (const p of cls.periods) {
          if (p) entry.periods.add(p);
        }
        desired.set(rowId, entry);
      }
    }
    school.teachersNotInDirectory += missingFromDirectory.size;
    if (desired.size === 0 && missingFromDirectory.size === 0) {
      school.noTeachersFound.push({ initials: record.initials, grade: record.gradeLevel });
    }

    // The per-child diff — the only place links are compared, and it only
    // ever runs for a MATCHED child.
    const existing = existingByChild.get(childId) ?? [];
    const existingByTeacher = new Map(existing.map((l) => [l.teacherId, l]));
    school.humanLinksKept += existing.filter((l) => l.source !== LINK_SOURCE).length;

    for (const [teacherId, sets] of desired) {
      const { subject, period } = linkLabels(sets.titles, sets.periods);
      const current = existingByTeacher.get(teacherId);
      if (!current) {
        school.adds.push({ childId, teacherId, subject, period });
      } else if (current.source !== LINK_SOURCE) {
        // A human already asserts this exact link. Theirs, not ours —
        // counted above, never rewritten.
      } else if (current.subject === subject && current.period === period) {
        school.unchanged += 1;
      } else {
        school.relabels.push({ linkId: current.id, subject, period });
      }
    }
    // Removals only when this child's desired set is COMPLETE. An edge that
    // fell into missingFromDirectory means the rosters assert a teacher this
    // run couldn't resolve to a row (directory not synced yet, or a re-keyed
    // row) — the same "cannot see properly" posture that keeps unmatched
    // children undiffed. The amber run-the-Teacher-sync-first hint covers
    // the why; the links wait.
    if (missingFromDirectory.size === 0) {
      for (const link of existing) {
        if (link.source === LINK_SOURCE && !desired.has(link.teacherId)) {
          school.removes.push({ linkId: link.id });
        }
      }
    }
  }

  return {
    refusal: null,
    schools: [...schoolPlans.values()],
    unplacedChildren,
    staleEnrollments,
    feedStudents: feedStudentCount,
    studentEnrollments,
    teacherEnrollments,
    liveClasses: classById.size,
  };
}

/**
 * The count Apply binds to: every write the plan would make. One definition
 * for the route's drift check; the district panel carries a local copy (this
 * module is server-only) that a drift would fail loudly against, not silently.
 */
export function writableLinkChangeCount(plan: LinkSyncPlan): number {
  if (plan.refusal) return 0;
  return plan.schools.reduce(
    (sum, s) => sum + s.adds.length + s.removes.length + s.relabels.length,
    0,
  );
}

/** Counts-only view of a plan — the ONLY shape this module ever logs. */
export function linkPlanCounts(plan: LinkSyncPlan) {
  return {
    refused: plan.refusal !== null,
    schools: plan.schools.map((s) => ({
      schoolId: s.schoolId,
      caseloadChildren: s.caseloadChildren,
      matchedChildren: s.matchedChildren,
      adds: s.adds.length,
      removes: s.removes.length,
      relabels: s.relabels.length,
      unchanged: s.unchanged,
      humanLinksKept: s.humanLinksKept,
      teachersNotInDirectory: s.teachersNotInDirectory,
      unmatched: s.unmatched.length,
      noTeachersFound: s.noTeachersFound.length,
    })),
    unplacedChildren: plan.unplacedChildren,
    staleEnrollments: plan.staleEnrollments,
    feedStudents: plan.feedStudents,
    studentEnrollments: plan.studentEnrollments,
    teacherEnrollments: plan.teacherEnrollments,
    liveClasses: plan.liveClasses,
  };
}

// ---------------------------------------------------------------------------
// IO: fetch the inputs (SIS + database), run the planner, optionally write.
// ---------------------------------------------------------------------------

export type LinkSyncConnectionParams = TeacherSyncConnectionParams;

/** `.in()` filters ride in the request URL — chunked so ids can't overflow it. */
const IN_CHUNK = 100;

function chunked<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/**
 * Fetch everything the planner needs. SIS reads are FULL pagination — a
 * missed page of enrollments would read as "these classes lost their
 * teachers" and plan removals. Database reads page to completion for the
 * same reason (PostgREST caps a select at max_rows).
 *
 * Enrollments are fetched UNFILTERED here on purpose: this sync needs both
 * roles, and asking once beats trusting a server's filter support twice.
 */
/** The SIS half of a roster read — what both roster consumers share. */
export interface OneRosterRosterFeed {
  feedStudents: LinkFeedStudent[];
  feedEnrollments: LinkFeedEnrollment[];
  feedClasses: LinkFeedClass[];
}

/**
 * Walk the three roster collections to completion and apply the ONE set of
 * row picks. Shared by the link sync and the import preview (SPE-546) so a
 * feed-mapping fix — a new status value, the PR #886 role-normalization —
 * can never land in one and silently not the other.
 *
 * The three walks run CONCURRENTLY (token fetched once first): they are
 * independent reads and this path has a human waiting on it in the preview
 * case (PR #896 review). Enrollments are fetched unfiltered on purpose:
 * both roles are needed, and asking once beats trusting a server's filter
 * support twice.
 */
export async function loadOneRosterRosterFeed(
  params: Omit<LinkSyncConnectionParams, 'districtId'>,
): Promise<OneRosterRosterFeed> {
  const tokenUrl =
    (params.tokenUrl ?? '').trim() || oneRosterTokenUrlCandidates(params.baseUrl)[0];
  if (!tokenUrl) throw new Error('This connection has no usable token address.');

  await assertSafeSisUrl(params.baseUrl, ONEROSTER_URL_LABELS);
  await assertSafeSisUrl(tokenUrl, ONEROSTER_URL_LABELS);

  const client = new OneRosterClient({
    baseUrl: params.baseUrl,
    tokenUrl,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });

  // One token exchange, then the walks in parallel — without this, three
  // concurrent first requests would each dial the token endpoint.
  await client.fetchToken();
  const [rawStudents, rawEnrollments, rawClasses] = await Promise.all([
    client.getAllPages<RawOneRosterUser>('students', 'users'),
    client.getAllPages<RawOneRosterEnrollment>('enrollments', 'enrollments'),
    client.getAllPages<RawOneRosterClass>('classes', 'classes'),
  ]);

  const feedStudents: LinkFeedStudent[] = rawStudents.flatMap((s) => {
    const sourcedId = trimOrNull(s.sourcedId);
    if (!sourcedId || s.status === 'tobedeleted') return [];
    return [{ sourcedId, identifier: trimOrNull(s.identifier) }];
  });

  const feedEnrollments: LinkFeedEnrollment[] = rawEnrollments.flatMap((e) => {
    // Role and status are compared normalized (trim + lowercase): the spec's
    // canon is lowercase, but a vendor's casing must not silently drop a
    // whole roster side (CodeRabbit, PR #886).
    const role = typeof e.role === 'string' ? e.role.trim().toLowerCase() : '';
    const status = typeof e.status === 'string' ? e.status.trim().toLowerCase() : '';
    if (status === 'tobedeleted') return [];
    if (role !== 'student' && role !== 'teacher') return [];
    const userSourcedId = trimOrNull(e.user?.sourcedId);
    const classSourcedId = trimOrNull(e.class?.sourcedId);
    if (!userSourcedId || !classSourcedId) return [];
    return [{ userSourcedId, classSourcedId, role }];
  });

  const feedClasses: LinkFeedClass[] = rawClasses.flatMap((c) => {
    const sourcedId = trimOrNull(c.sourcedId);
    if (!sourcedId || c.status === 'tobedeleted') return [];
    return [
      {
        sourcedId,
        title: trimOrNull(c.title),
        periods: Array.isArray(c.periods)
          ? c.periods.flatMap((p) => {
              const period = trimOrNull(p);
              return period ? [period] : [];
            })
          : [],
      },
    ];
  });

  return { feedStudents, feedEnrollments, feedClasses };
}

export async function loadLinkSyncInput(
  params: LinkSyncConnectionParams,
): Promise<LinkPlannerInput> {
  const { feedStudents, feedEnrollments, feedClasses } = await loadOneRosterRosterFeed(params);

  const supabase = createServiceClient();
  const { data: schoolRows, error: schoolsError } = await supabase
    .from('schools')
    .select('id, name')
    .eq('district_id', params.districtId);
  if (schoolsError) {
    throw new Error(`Could not load this district's schools: ${schoolsError.message}`);
  }
  const speddySchools: SpeddySchool[] = (schoolRows ?? []).map((s) => ({
    id: String(s.id),
    name: String(s.name ?? ''),
  }));
  const schoolIds = speddySchools.map((s) => s.id);

  const caseloadRows: CaseloadRow[] = [];
  const childRecords: ChildRecord[] = [];
  const sisTeachers: SisKeyedTeacher[] = [];
  const existingLinks: ExistingLink[] = [];

  if (schoolIds.length > 0) {
    // Paged to completion, ordered so pages cannot shear (same posture as
    // the teacher sync's database reads).
    const DB_PAGE = 1000;
    for (let from = 0; ; from += DB_PAGE) {
      const { data, error } = await supabase
        .from('students')
        .select('child_id, district_student_id')
        .in('school_id', schoolIds)
        .not('child_id', 'is', null)
        .order('id')
        .range(from, from + DB_PAGE - 1);
      if (error) throw new Error(`Could not load caseload rows: ${error.message}`);
      caseloadRows.push(
        ...(data ?? []).map((r) => ({
          childId: String(r.child_id),
          districtStudentId: (r.district_student_id as string | null) ?? null,
        })),
      );
      if (!data || data.length < DB_PAGE) break;
    }

    const childIds = [...new Set(caseloadRows.map((r) => r.childId))];
    for (const chunk of chunked(childIds, IN_CHUNK)) {
      const { data, error } = await supabase
        .from('children')
        .select('id, school_id, initials, grade_level, district_student_id')
        .in('id', chunk);
      if (error) throw new Error(`Could not load child records: ${error.message}`);
      childRecords.push(
        ...(data ?? []).map((c) => ({
          id: String(c.id),
          schoolId: (c.school_id as string | null) ?? null,
          initials: String(c.initials ?? ''),
          gradeLevel: (c.grade_level as string | null) ?? null,
          districtStudentId: (c.district_student_id as string | null) ?? null,
        })),
      );
    }

    for (let from = 0; ; from += DB_PAGE) {
      const { data, error } = await supabase
        .from('teachers')
        .select('id, school_id, sis_id')
        .in('school_id', schoolIds)
        // The DIRECTORY's constant, not this module's link-provenance one —
        // they are both 'oneroster' today only by coincidence of vendor.
        .eq('sis_source', TEACHER_SIS_SOURCE)
        .not('sis_id', 'is', null)
        .order('id')
        .range(from, from + DB_PAGE - 1);
      if (error) throw new Error(`Could not load the teacher directory: ${error.message}`);
      sisTeachers.push(
        ...(data ?? []).map((t) => ({
          id: String(t.id),
          schoolId: String(t.school_id ?? ''),
          sisId: String(t.sis_id ?? ''),
        })),
      );
      if (!data || data.length < DB_PAGE) break;
    }

    for (const chunk of chunked(childIds, IN_CHUNK)) {
      // Paged WITHIN each chunk: 100 secondary children can carry more than
      // max_rows links between them, and PostgREST truncates silently — a
      // truncated read here hides sync-owned rows from the diff, so stale
      // links never clear and their pairs re-plan as adds forever
      // (self-review, PR #886).
      for (let from = 0; ; from += DB_PAGE) {
        const { data, error } = await supabase
          .from('student_teachers')
          .select('id, child_id, teacher_id, subject, period, source')
          .in('child_id', chunk)
          .order('id')
          .range(from, from + DB_PAGE - 1);
        if (error) throw new Error(`Could not load existing links: ${error.message}`);
        existingLinks.push(
          ...(data ?? []).map((l) => ({
            id: String(l.id),
            childId: String(l.child_id),
            teacherId: String(l.teacher_id),
            subject: (l.subject as string | null) ?? null,
            period: (l.period as string | null) ?? null,
            source: String(l.source ?? 'human'),
          })),
        );
        if (!data || data.length < DB_PAGE) break;
      }
    }
  }

  return {
    feedStudents,
    feedEnrollments,
    feedClasses,
    speddySchools,
    caseloadRows,
    childRecords,
    sisTeachers,
    existingLinks,
  };
}

export interface LinkSchoolWriteResult {
  schoolId: string;
  schoolName: string;
  added: number;
  removed: number;
  relabeled: number;
}

/**
 * Apply a freshly computed plan: adds, relabels, then removes — removals
 * last, mirroring SPE-337's ordering, so a child never passes through a
 * teacher-less moment that the legacy-column mirror would write out.
 *
 * Every mutating statement carries `source = 'oneroster'` in its WHERE (or
 * VALUES): even if the plan were somehow stale, a human's link physically
 * cannot be relabeled or deleted here. Adds are ON CONFLICT DO NOTHING on
 * the (child, teacher) unique key, so racing a human adding the same link
 * loses politely and the count reports what actually landed.
 *
 * Stop-on-failure with a partial audit record in both outcomes, same as the
 * teacher sync: service-role writes that happened must never go unrecorded.
 */
export async function applyLinkSyncPlan(params: {
  plan: LinkSyncPlan;
  /**
   * Who set this run in motion. Null ONLY for scheduled runs (SPE-545) —
   * `audit_logs.user_id` is nullable and the trigger field below says why.
   * An import-triggered run carries the importing provider's id: that person
   * really did cause the write, and a null there would erase attribution.
   */
  actorId: string | null;
  connectionId: string;
  districtId: string;
  /** How the run started; lands in the audit metadata (SPE-545). */
  trigger?: 'manual' | 'import' | 'cron';
}): Promise<LinkSchoolWriteResult[]> {
  const supabase = createServiceClient();
  const results: LinkSchoolWriteResult[] = [];
  const trigger = params.trigger ?? 'manual';

  const recordOutcome = async (partial: boolean) => {
    const written = results.map(({ schoolId, added, removed, relabeled }) => ({
      schoolId,
      added,
      removed,
      relabeled,
    }));
    await logServerAuditEvent({
      user_id: params.actorId,
      action: 'sis_link_sync_applied',
      resource_type: 'district_sis_connection',
      resource_id: params.connectionId,
      metadata: { districtId: params.districtId, partial, trigger, written },
    });
    log.info('Student–teacher link sync applied', {
      connectionId: params.connectionId,
      districtId: params.districtId,
      partial,
      trigger,
      written,
    });
  };

  try {
    await applyLinkSchools(supabase, params.plan, results);
  } catch (err) {
    await recordOutcome(true);
    throw err;
  }

  await recordOutcome(false);
  return results;
}

async function applyLinkSchools(
  supabase: ReturnType<typeof createServiceClient>,
  plan: LinkSyncPlan,
  results: LinkSchoolWriteResult[],
): Promise<void> {
  if (plan.refusal) {
    // Routes refuse before calling apply; this is the belt to that suspender.
    throw new Error('A refused plan cannot be applied.');
  }

  for (const school of plan.schools) {
    const result: LinkSchoolWriteResult = {
      schoolId: school.schoolId,
      schoolName: school.schoolName,
      added: 0,
      removed: 0,
      relabeled: 0,
    };
    // Pushed BEFORE the writes so a school that fails halfway still
    // contributes what it DID write to the partial-outcome audit record.
    results.push(result);

    if (school.adds.length > 0) {
      const { data, error } = await supabase
        .from('student_teachers')
        .upsert(
          school.adds.map((a) => ({
            child_id: a.childId,
            teacher_id: a.teacherId,
            subject: a.subject,
            period: a.period,
            source: LINK_SOURCE,
          })),
          { onConflict: 'child_id,teacher_id', ignoreDuplicates: true },
        )
        .select('id');
      if (error) {
        throw new Error(`Linking teachers at ${school.schoolName} failed: ${error.message}`);
      }
      // ignore-duplicates returns only the rows actually inserted — a link a
      // human raced in ahead of us is theirs now, and is not counted.
      result.added += (data ?? []).length;
    }

    for (const relabel of school.relabels) {
      const { data, error } = await supabase
        .from('student_teachers')
        .update({ subject: relabel.subject, period: relabel.period })
        .eq('id', relabel.linkId)
        .eq('source', LINK_SOURCE)
        .select('id');
      if (error) {
        throw new Error(`Relabeling a link at ${school.schoolName} failed: ${error.message}`);
      }
      // A row that changed hands (or vanished) since the plan reports zero
      // here — count honestly, don't guess.
      result.relabeled += (data ?? []).length;
    }

    // Chunked like the reads: a big cleanup's ids all in one .in() would
    // overflow the request URL and wedge the apply at the same point on
    // every retry (self-review, PR #886).
    for (const chunk of chunked(school.removes.map((r) => r.linkId), IN_CHUNK)) {
      const { data, error } = await supabase
        .from('student_teachers')
        .delete()
        .in('id', chunk)
        .eq('source', LINK_SOURCE)
        .select('id');
      if (error) {
        throw new Error(`Removing stale links at ${school.schoolName} failed: ${error.message}`);
      }
      result.removed += (data ?? []).length;
    }
  }
}
