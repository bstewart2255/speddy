/**
 * OneRoster → Speddy teacher-directory sync (SPE-437, SPE-414 Part 1).
 *
 * Auto-creates gen ed teachers per school from the district's OneRoster feed —
 * the concierge path that spares site admins hand-typing a directory. Runs as
 * a PLAN first (dry-run: the full per-school diff, zero writes), and APPLY
 * recomputes the plan server-side rather than trusting anything a client
 * posts back.
 *
 * The population rule, decided by the owner (2026-08-10) from JSUSD's live
 * feed: a feed row becomes a teacher at school S only when it is org'd to S
 * AND carries a real staff identifier. JSUSD's export marks everyone else
 * with the literal identifier "non-teaching staff" — counselors, office
 * staff, and (at Carquinez Middle) teachers whose SIS records lack the
 * teacher linkage. Those rows are never created: planting office staff in
 * teacher pickers is the inaccuracy this feature exists to avoid, and a
 * school where NO row qualifies refuses loudly rather than syncing nobody.
 *
 * The reconcile ladder (v1 posture, per SPE-412's whose-data-wins decision):
 *   keyed row (sis_source+sis_id)  -> SIS-owned: update changed fields
 *   email match on an unkeyed row  -> ADOPT: stamp the SIS key, touch nothing
 *   name match on an unkeyed row   -> REVIEW bucket; never auto-stamped
 *   no match                       -> CREATE
 * Sync-keyed rows missing from the feed are reported, never deleted.
 *
 * Names are stored VERBATIM as the feed sends them (owner decision):
 * title-casing breaks O'MALLEY and MCKISSOCK, and a human can edit a row a
 * machine got ugly, but nobody notices a name a machine silently mangled.
 *
 * PRIVACY. This module handles teacher directory data (names, work emails,
 * staff IDs) — the same fields the district admin already sees in the SPE-436
 * Directories view. Plans carry them so the reviewing human can review; LOGS
 * carry counts only, and students are never read from the SIS at all.
 *
 * Server-only: dials an external SIS with a decrypted credential.
 */
import { logger } from '@/lib/logger';
import { createServiceClient } from '@/lib/supabase/server';
import { logServerAuditEvent } from '@/lib/supabase/audit-log-server';
import { OneRosterClient, type RawOneRosterUser } from '@/lib/integrations/oneroster';
import { ONEROSTER_URL_LABELS, assertSafeSisUrl } from './ssrf-guard';
import { oneRosterTokenUrlCandidates } from './oneroster-setup';

const log = logger.child({ module: 'teacher-directory-sync' });

/** The value `teachers.sis_source` carries for rows this sync owns. */
export const TEACHER_SIS_SOURCE = 'oneroster';

/**
 * JSUSD's feed marks non-teaching staff with this literal in the identifier
 * field. Compared normalized (case/whitespace) so a vendor's casing change
 * cannot silently turn office staff into teachers.
 */
const NON_TEACHING_SENTINEL = 'non-teaching staff';

// ---------------------------------------------------------------------------
// Planner input shapes — plain data, so the planner is testable without HTTP.
// ---------------------------------------------------------------------------

export interface FeedSchool {
  sourcedId: string;
  name: string;
}

export interface FeedTeacher {
  sourcedId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  /** The staff ID as the district shows it (e.g. `11_TCH_1174`) — display. */
  identifier: string | null;
  grades: string[];
  orgIds: string[];
  /** True when the identifier is present and not the non-teaching sentinel. */
  isTeacher: boolean;
}

export interface SpeddySchool {
  id: string;
  name: string;
}

export interface ExistingTeacher {
  id: string;
  school_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  grade_level: string | null;
  sis_source: string | null;
  sis_id: string | null;
}

export interface PlannerInput {
  feedSchools: FeedSchool[];
  feedTeachers: FeedTeacher[];
  speddySchools: SpeddySchool[];
  existingTeachers: ExistingTeacher[];
  /** Caseload rows per Speddy school id — the "school has students" gate. */
  studentCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Plan shapes — what the staff panel renders and what apply executes.
// ---------------------------------------------------------------------------

export interface PlannedCreate {
  sisId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  staffId: string | null;
  gradeLevel: string | null;
}

export interface PlannedAdopt {
  teacherId: string;
  sisId: string;
  name: string;
  email: string;
}

export interface PlannedUpdate {
  teacherId: string;
  sisId: string;
  name: string;
  changes: Partial<
    Pick<ExistingTeacher, 'first_name' | 'last_name' | 'email' | 'grade_level'>
  >;
}

export interface ReviewCandidate {
  sisId: string;
  feedName: string;
  feedEmail: string | null;
  existingTeacherId: string;
  existingName: string;
  existingEmail: string | null;
  /**
   * Why a human is needed: a bare name match (never auto-stamped), or an
   * email carried by MORE THAN ONE unkeyed row — adopting one of those
   * nondeterministically would make the wrong row SIS-owned forever
   * (Codex P1, PR #831).
   */
  reason: 'name-match' | 'ambiguous-email';
}

export interface SchoolPlan {
  schoolId: string;
  schoolName: string;
  /** The SIS school this Speddy school mapped to, when it mapped. */
  sisSchoolName: string | null;
  creates: PlannedCreate[];
  adopts: PlannedAdopt[];
  updates: PlannedUpdate[];
  unchanged: number;
  reviews: ReviewCandidate[];
  /** Sync-keyed rows the feed no longer carries — reported, never deleted. */
  missingFromSis: { teacherId: string; name: string }[];
  /** Feed rows org'd here that the population rule excluded. */
  excludedNonTeaching: number;
  studentCount: number;
  /**
   * The loud per-school no. Set when this school cannot be synced — no SIS
   * school matched, the name-match was ambiguous, or every row the feed has
   * for it failed the population rule while the school has students
   * (Carquinez's state). A refused school is never written to.
   */
  refusal: string | null;
}

export interface TeacherSyncPlan {
  schools: SchoolPlan[];
  /** SIS schools no Speddy school claims (e.g. non-pilot schools) — skipped. */
  unmappedSisSchools: { name: string; teacherRows: number }[];
  /**
   * Excluded rows whose email also appears on an included teacher — the same
   * human carried twice by the feed (JSUSD: a sentinel row at one school and
   * a real teacher row at another). Informational; the teacher row wins.
   */
  shadowDuplicates: number;
  /** Included rows dropped because another row already claimed their email at that school. */
  duplicateEmailAnomalies: number;
  feedTeacherRows: number;
  feedTotalRows: number;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const trimOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/** Lowercased alphanumerics only — the school-name matching alphabet. */
const normName = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]/g, '');

const normEmail = (v: string | null): string | null => (v ? v.trim().toLowerCase() : null);

/** Case/whitespace-insensitive person-name key for the review rung. */
const personKey = (first: string | null, last: string | null): string =>
  `${(first ?? '').trim().toLowerCase()} ${(last ?? '').trim().toLowerCase()}`
    .replace(/\s+/g, ' ')
    .trim();

const isNonTeachingSentinel = (identifier: string | null): boolean =>
  identifier !== null && identifier.replace(/\s+/g, ' ').trim().toLowerCase() === NON_TEACHING_SENTINEL;

/**
 * The grade rule from the owner's JSUSD review: `KG` alone is the feed's
 * filler value (it appears on every sentinel row and on obvious non-K staff),
 * so it is stored only where the school context corroborates it — an
 * elementary school. Multi-grade lists and non-KG values are stored verbatim.
 */
function gradeLevelFor(grades: string[], speddySchoolName: string): string | null {
  if (grades.length === 0) return null;
  const kgOnly = grades.length === 1 && grades[0].trim().toUpperCase() === 'KG';
  if (kgOnly && !/elementary/i.test(speddySchoolName)) return null;
  return grades.join(', ');
}

// ---------------------------------------------------------------------------
// School mapping
// ---------------------------------------------------------------------------

/**
 * Match Speddy schools to SIS schools by normalized name, prefix in either
 * direction — "Rodeo Hills Elementary" ↔ "Rodeo Hills Elementary School".
 *
 * Ambiguity REFUSES the school rather than guessing: a wrong school mapping
 * would file every teacher under the wrong roof, which is worse than filing
 * none. JSUSD has 2 usable schools; if name-matching proves brittle at a
 * bigger district, persisting a confirmed mapping is the follow-up (SPE-414).
 */
function mapSchools(
  speddySchools: SpeddySchool[],
  feedSchools: FeedSchool[],
): {
  bySchoolId: Map<string, { feed: FeedSchool } | { refusal: string }>;
  claimedFeedIds: Set<string>;
} {
  const bySchoolId = new Map<string, { feed: FeedSchool } | { refusal: string }>();
  const claims = new Map<string, string[]>(); // feed sourcedId -> speddy school ids

  for (const school of speddySchools) {
    const target = normName(school.name);
    if (!target) {
      bySchoolId.set(school.id, { refusal: 'This school has no name to match on.' });
      continue;
    }
    const candidates = feedSchools.filter((f) => {
      const n = normName(f.name);
      // An empty normalized feed name would prefix-match EVERYTHING
      // (`target.startsWith('')` is always true) — a junk-named SIS org must
      // match nothing, not poison every school into ambiguity.
      return n !== '' && (n.startsWith(target) || target.startsWith(n));
    });
    if (candidates.length === 0) {
      bySchoolId.set(school.id, {
        refusal: `No school in the SIS feed matches “${school.name}”.`,
      });
    } else if (candidates.length > 1) {
      bySchoolId.set(school.id, {
        refusal: `${candidates.length} SIS schools match “${school.name}” by name — refusing to guess which.`,
      });
    } else {
      bySchoolId.set(school.id, { feed: candidates[0] });
      const list = claims.get(candidates[0].sourcedId) ?? [];
      list.push(school.id);
      claims.set(candidates[0].sourcedId, list);
    }
  }

  // A feed school claimed by two Speddy schools is the same ambiguity from the
  // other side; refuse both claimants.
  for (const [, schoolIds] of claims) {
    if (schoolIds.length > 1) {
      for (const id of schoolIds) {
        bySchoolId.set(id, {
          refusal: 'Two schools here match the same SIS school by name — refusing to guess.',
        });
      }
    }
  }

  const claimedFeedIds = new Set<string>();
  for (const value of bySchoolId.values()) {
    if ('feed' in value) claimedFeedIds.add(value.feed.sourcedId);
  }
  return { bySchoolId, claimedFeedIds };
}

// ---------------------------------------------------------------------------
// The planner — pure, so tests can pin every rung without a server.
// ---------------------------------------------------------------------------

export function planTeacherDirectorySync(input: PlannerInput): TeacherSyncPlan {
  const { bySchoolId, claimedFeedIds } = mapSchools(input.speddySchools, input.feedSchools);

  const teacherRows = input.feedTeachers.filter((t) => t.isTeacher);

  // Emails carried by included teacher rows — the shadow-duplicate detector.
  const teacherEmails = new Set<string>();
  for (const t of teacherRows) {
    const e = normEmail(t.email);
    if (e) teacherEmails.add(e);
  }
  let shadowDuplicates = 0;
  for (const t of input.feedTeachers) {
    if (t.isTeacher) continue;
    const e = normEmail(t.email);
    if (e && teacherEmails.has(e)) shadowDuplicates += 1;
  }

  let duplicateEmailAnomalies = 0;
  const schools: SchoolPlan[] = [];

  for (const school of input.speddySchools) {
    const mapping = bySchoolId.get(school.id);
    const studentCount = input.studentCounts[school.id] ?? 0;
    const existingAtSchool = input.existingTeachers.filter((t) => t.school_id === school.id);

    if (!mapping || 'refusal' in mapping) {
      schools.push({
        schoolId: school.id,
        schoolName: school.name,
        sisSchoolName: null,
        creates: [],
        adopts: [],
        updates: [],
        unchanged: 0,
        reviews: [],
        missingFromSis: [],
        excludedNonTeaching: 0,
        studentCount,
        refusal: mapping?.refusal ?? 'This school could not be mapped.',
      });
      continue;
    }

    const feedSchool = mapping.feed;
    const atSchool = teacherRows.filter((t) => t.orgIds.includes(feedSchool.sourcedId));
    const excludedNonTeaching = input.feedTeachers.filter(
      (t) => !t.isTeacher && t.orgIds.includes(feedSchool.sourcedId),
    ).length;

    // Index the existing rows once per school, by each ladder key. Indexed
    // BEFORE feed dedup because the dedup preference below needs `keyed`.
    const keyed = new Map<string, ExistingTeacher>();
    const unkeyedByEmail = new Map<string, ExistingTeacher[]>();
    const unkeyedByName = new Map<string, ExistingTeacher>();
    for (const row of existingAtSchool) {
      if (row.sis_source === TEACHER_SIS_SOURCE && row.sis_id) {
        keyed.set(row.sis_id, row);
        continue;
      }
      if (row.sis_id) continue; // keyed to some other SIS — not ours to match
      const e = normEmail(row.email);
      if (e) {
        const list = unkeyedByEmail.get(e) ?? [];
        list.push(row);
        unkeyedByEmail.set(e, list);
      }
      const n = personKey(row.first_name, row.last_name);
      if (n && !unkeyedByName.has(n)) unkeyedByName.set(n, row);
    }

    // One row per person per school: sourcedId is the key; a second included
    // row carrying the same email at the same school is a feed anomaly — keep
    // one, count the rest rather than creating twins. The row an existing
    // teacher is ALREADY KEYED to wins the tie: dropping it would orphan a
    // stable key, create a duplicate, and report the real teacher as missing
    // (Codex P1, PR #831). Ties among unkeyed rows fall back to sourcedId
    // order for determinism.
    const seenIds = new Set<string>();
    const seenEmails = new Set<string>();
    const candidates: FeedTeacher[] = [];
    const deduped = [...atSchool].sort((a, b) => {
      const aKeyed = keyed.has(a.sourcedId) ? 0 : 1;
      const bKeyed = keyed.has(b.sourcedId) ? 0 : 1;
      return aKeyed - bKeyed || a.sourcedId.localeCompare(b.sourcedId);
    });
    for (const t of deduped) {
      if (seenIds.has(t.sourcedId)) continue;
      seenIds.add(t.sourcedId);
      const e = normEmail(t.email);
      if (e) {
        if (seenEmails.has(e)) {
          duplicateEmailAnomalies += 1;
          continue;
        }
        seenEmails.add(e);
      }
      candidates.push(t);
    }

    const creates: PlannedCreate[] = [];
    const adopts: PlannedAdopt[] = [];
    const updates: PlannedUpdate[] = [];
    const reviews: ReviewCandidate[] = [];
    let unchanged = 0;
    // ALL teacher-row ids at the school, pre-dedup: a keyed row whose feed
    // twin lost the dedup tie must not be reported "gone from the SIS" —
    // the feed still carries it (Codex P1, PR #831).
    const feedIdsAtSchool = new Set(atSchool.map((c) => c.sourcedId));

    for (const t of candidates) {
      const gradeLevel = gradeLevelFor(t.grades, school.name);
      const feedName = `${t.firstName} ${t.lastName}`.trim();

      const keyedRow = keyed.get(t.sourcedId);
      if (keyedRow) {
        // SIS-owned row: bring the directory fields up to date. Email is
        // compared normalized (a case-only change is not a change), stored
        // verbatim.
        const changes: PlannedUpdate['changes'] = {};
        if ((keyedRow.first_name ?? '') !== t.firstName) changes.first_name = t.firstName;
        if ((keyedRow.last_name ?? '') !== t.lastName) changes.last_name = t.lastName;
        if (normEmail(keyedRow.email) !== normEmail(t.email)) changes.email = t.email;
        if ((keyedRow.grade_level ?? null) !== gradeLevel) changes.grade_level = gradeLevel;
        if (Object.keys(changes).length === 0) {
          unchanged += 1;
        } else {
          updates.push({ teacherId: keyedRow.id, sisId: t.sourcedId, name: feedName, changes });
        }
        continue;
      }

      const email = normEmail(t.email);
      const emailMatches = email ? (unkeyedByEmail.get(email) ?? []) : [];
      if (emailMatches.length === 1) {
        // Email equality against exactly ONE row is strong identity: stamp
        // the key, touch nothing else. The row stays human-owned.
        adopts.push({
          teacherId: emailMatches[0].id,
          sisId: t.sourcedId,
          name: feedName,
          email: t.email as string,
        });
        continue;
      }
      if (emailMatches.length > 1) {
        // The same email on SEVERAL unkeyed rows (the schema permits it):
        // adopting one nondeterministically would make the wrong row
        // SIS-owned forever. A human picks (Codex P1, PR #831).
        for (const row of emailMatches) {
          reviews.push({
            sisId: t.sourcedId,
            feedName,
            feedEmail: t.email,
            existingTeacherId: row.id,
            existingName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
            existingEmail: row.email,
            reason: 'ambiguous-email',
          });
        }
        continue;
      }

      const nameMatch = unkeyedByName.get(personKey(t.firstName, t.lastName));
      if (nameMatch) {
        // A name alone NEVER stamps a key — same-named humans exist, and the
        // feed itself shows names drifting from emails. A human confirms.
        reviews.push({
          sisId: t.sourcedId,
          feedName,
          feedEmail: t.email,
          existingTeacherId: nameMatch.id,
          existingName: `${nameMatch.first_name ?? ''} ${nameMatch.last_name ?? ''}`.trim(),
          existingEmail: nameMatch.email,
          reason: 'name-match',
        });
        continue;
      }

      creates.push({
        sisId: t.sourcedId,
        firstName: t.firstName,
        lastName: t.lastName,
        email: t.email,
        staffId: t.identifier,
        gradeLevel,
      });
    }

    const missingFromSis = existingAtSchool
      .filter(
        (row) =>
          row.sis_source === TEACHER_SIS_SOURCE && row.sis_id && !feedIdsAtSchool.has(row.sis_id),
      )
      .map((row) => ({
        teacherId: row.id,
        name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
      }));

    // The Carquinez guard: students but not one QUALIFYING teacher row in
    // the feed. Gated on candidates, not on writable buckets — a school
    // whose rows all await human review has qualifying rows and must render
    // them, not a refusal claiming it has none (Codex P2 / CodeRabbit,
    // PR #831). Say exactly what the feed had, so the district-side fix is
    // nameable.
    const refusal =
      studentCount > 0 && candidates.length === 0
        ? `“${feedSchool.name}” has ${excludedNonTeaching} staff row(s) in the feed, ` +
          'none with a real staff ID — nothing here can be created accurately. ' +
          'This is district-side data (teacher records missing their staff linkage), not a Speddy failure.'
        : null;

    schools.push({
      schoolId: school.id,
      schoolName: school.name,
      sisSchoolName: feedSchool.name,
      creates,
      adopts,
      updates,
      unchanged,
      reviews,
      missingFromSis,
      excludedNonTeaching,
      studentCount,
      refusal,
    });
  }

  const unmappedSisSchools = input.feedSchools
    .filter((f) => !claimedFeedIds.has(f.sourcedId))
    .map((f) => ({
      name: f.name,
      teacherRows: teacherRows.filter((t) => t.orgIds.includes(f.sourcedId)).length,
    }));

  return {
    schools,
    unmappedSisSchools,
    shadowDuplicates,
    duplicateEmailAnomalies,
    feedTeacherRows: teacherRows.length,
    feedTotalRows: input.feedTeachers.length,
  };
}

// ---------------------------------------------------------------------------
// IO: fetch the inputs (SIS + database), run the planner, optionally write.
// ---------------------------------------------------------------------------

export interface TeacherSyncConnectionParams {
  districtId: string;
  baseUrl: string;
  tokenUrl?: string | null;
  clientId: string;
  clientSecret: string;
}

/** Exported for tests: the feed-row pick, sentinel rule included. */
export function toFeedTeacher(raw: RawOneRosterUser): FeedTeacher | null {
  if (raw.status === 'tobedeleted') return null;
  // A blank sourcedId cannot key anything — writing it to `teachers.sis_id`
  // would collide every such row into one "identity".
  const sourcedId = trimOrNull(raw.sourcedId);
  if (!sourcedId) return null;
  const firstName = trimOrNull(raw.givenName) ?? '';
  const lastName = trimOrNull(raw.familyName) ?? '';
  // A row with no name at all cannot become a picker entry anyone recognizes.
  if (!firstName && !lastName) return null;
  const identifier = trimOrNull(raw.identifier);
  return {
    sourcedId,
    firstName,
    lastName,
    email: trimOrNull(raw.email),
    identifier,
    grades: Array.isArray(raw.grades)
      ? raw.grades.filter((g): g is string => typeof g === 'string' && g.trim() !== '')
      : [],
    // Guarded like `grades`: the shape comes from an external SIS, and a
    // vendor sending `orgs` as an object must degrade to "no schools", not
    // throw away the whole run.
    orgIds: Array.isArray(raw.orgs)
      ? raw.orgs.flatMap((o) => {
          const id = trimOrNull(o?.sourcedId);
          return id ? [id] : [];
        })
      : [],
    isTeacher: identifier !== null && !isNonTeachingSentinel(identifier),
  };
}

/**
 * Fetch everything the planner needs. SIS reads are FULL pagination — a
 * first-page sample was fine for the probe, but a sync that missed page two
 * would report the missing teachers as "missing from SIS" on the next run.
 *
 * Uses the stored token address (or the first derived candidate), never the
 * candidate hunt — same posture as the SPE-436 directory: resolution belongs
 * to the connection test, and an unhealthy connection should fail here and
 * point at the tech portal, not probe a production SIS.
 */
export async function loadTeacherSyncInput(
  params: TeacherSyncConnectionParams,
): Promise<PlannerInput> {
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

  const rawSchools = await client.getAllPages<Record<string, unknown>>('schools', 'orgs');
  const feedSchools: FeedSchool[] = rawSchools.flatMap((s) => {
    const sourcedId = trimOrNull(s.sourcedId);
    const name = trimOrNull(s.name);
    return sourcedId && name && s.status !== 'tobedeleted' ? [{ sourcedId, name }] : [];
  });

  const rawTeachers = await client.getAllPages<RawOneRosterUser>('teachers', 'users');
  const feedTeachers = rawTeachers
    .map(toFeedTeacher)
    .filter((t): t is FeedTeacher => t !== null);

  const supabase = createServiceClient();
  const { data: schoolRows, error: schoolsError } = await supabase
    .from('schools')
    .select('id, name')
    .eq('district_id', params.districtId);
  if (schoolsError) throw new Error(`Could not load this district's schools: ${schoolsError.message}`);
  const speddySchools: SpeddySchool[] = (schoolRows ?? []).map((s) => ({
    id: String(s.id),
    name: String(s.name ?? ''),
  }));
  const schoolIds = speddySchools.map((s) => s.id);

  const existingTeachers: ExistingTeacher[] = [];
  const studentCounts: Record<string, number> = {};
  if (schoolIds.length > 0) {
    // Paged to completion: PostgREST caps a select at max_rows (1000 on this
    // project), and a truncated read here has the same failure mode the SIS
    // side avoids with getAllPages — keyed rows past the cap look absent, so
    // the planner re-creates teachers that already exist and the apply then
    // trips the unique index mid-school. Ordered so pages cannot shear.
    const DB_PAGE = 1000;
    for (let from = 0; ; from += DB_PAGE) {
      const { data: teacherRows, error: teachersError } = await supabase
        .from('teachers')
        .select('id, school_id, first_name, last_name, email, grade_level, sis_source, sis_id')
        .in('school_id', schoolIds)
        .order('id')
        .range(from, from + DB_PAGE - 1);
      if (teachersError) {
        throw new Error(`Could not load existing teachers: ${teachersError.message}`);
      }
      existingTeachers.push(...((teacherRows ?? []) as ExistingTeacher[]));
      if (!teacherRows || teacherRows.length < DB_PAGE) break;
    }

    // Caseload rows per school — the "has students" side of the loud-refusal
    // gate. Head-counts run concurrently; the exact number is display-only.
    await Promise.all(
      schoolIds.map(async (id) => {
        const { count, error: countError } = await supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', id);
        if (countError) {
          throw new Error(`Could not count students: ${countError.message}`);
        }
        studentCounts[id] = count ?? 0;
      }),
    );
  }

  return { feedSchools, feedTeachers, speddySchools, existingTeachers, studentCounts };
}

/** Counts-only view of a plan — the ONLY shape this module ever logs. */
export function planCounts(plan: TeacherSyncPlan) {
  return {
    schools: plan.schools.map((s) => ({
      schoolId: s.schoolId,
      creates: s.creates.length,
      adopts: s.adopts.length,
      updates: s.updates.length,
      unchanged: s.unchanged,
      reviews: s.reviews.length,
      missingFromSis: s.missingFromSis.length,
      excludedNonTeaching: s.excludedNonTeaching,
      refused: s.refusal !== null,
    })),
    unmappedSisSchools: plan.unmappedSisSchools.length,
    shadowDuplicates: plan.shadowDuplicates,
    duplicateEmailAnomalies: plan.duplicateEmailAnomalies,
    feedTeacherRows: plan.feedTeacherRows,
    feedTotalRows: plan.feedTotalRows,
  };
}

export interface SchoolWriteResult {
  schoolId: string;
  schoolName: string;
  created: number;
  adopted: number;
  updated: number;
}

/**
 * Apply a freshly computed plan: creates + adopts + keyed updates only.
 * Review candidates and missing-from-SIS rows are never written — the first
 * needs a human's "same person", the second is a delete this sync does not do.
 *
 * Writes run through the service role: this is the staff-gated concierge
 * path (SPE-427 pattern), not a district session. Adoption re-checks
 * `sis_id IS NULL` in the WHERE so a concurrent apply cannot double-stamp.
 */
export async function applyTeacherSyncPlan(params: {
  plan: TeacherSyncPlan;
  actorId: string;
  connectionId: string;
  districtId: string;
}): Promise<SchoolWriteResult[]> {
  const supabase = createServiceClient();
  const results: SchoolWriteResult[] = [];

  // Written in BOTH outcomes. Stop-on-failure means a school can fail after
  // earlier schools committed, and service-role writes that happened must
  // never go unrecorded because a later school threw (CodeRabbit, PR #831).
  // Counts only, per the module's logging rule.
  const recordOutcome = async (partial: boolean) => {
    const written = results.map(({ schoolId, created, adopted, updated }) => ({
      schoolId,
      created,
      adopted,
      updated,
    }));
    await logServerAuditEvent({
      user_id: params.actorId,
      action: 'sis_teacher_sync_applied',
      resource_type: 'district_sis_connection',
      resource_id: params.connectionId,
      metadata: { districtId: params.districtId, partial, written },
    });
    log.info('Teacher directory sync applied', {
      connectionId: params.connectionId,
      districtId: params.districtId,
      partial,
      written,
    });
  };

  try {
    await applySchools(supabase, params.plan, results);
  } catch (err) {
    await recordOutcome(true);
    throw err;
  }

  await recordOutcome(false);
  return results;
}

async function applySchools(
  supabase: ReturnType<typeof createServiceClient>,
  plan: TeacherSyncPlan,
  results: SchoolWriteResult[],
): Promise<void> {
  for (const school of plan.schools) {
    if (school.refusal) continue;
    const result: SchoolWriteResult = {
      schoolId: school.schoolId,
      schoolName: school.schoolName,
      created: 0,
      adopted: 0,
      updated: 0,
    };
    // Pushed BEFORE the writes, counts accumulating on the shared reference:
    // a school that fails halfway must still contribute what it DID write to
    // the partial-outcome audit record, not vanish from it.
    results.push(result);

    if (school.creates.length > 0) {
      const rows = school.creates.map((c) => ({
        first_name: c.firstName,
        last_name: c.lastName,
        email: c.email,
        school_id: school.schoolId,
        school_site: school.schoolName,
        grade_level: c.gradeLevel,
        created_by_admin: false,
        sis_source: TEACHER_SIS_SOURCE,
        sis_id: c.sisId,
      }));
      const { data, error } = await supabase
        .from('teachers')
        .insert(rows)
        .select('id');
      if (error) {
        // Stop rather than continue past a failed school: a partial apply that
        // keeps going reports success about a state it does not know.
        throw new Error(`Creating teachers for ${school.schoolName} failed: ${error.message}`);
      }
      result.created = (data ?? []).length;
    }

    for (const adopt of school.adopts) {
      const { data, error } = await supabase
        .from('teachers')
        .update({ sis_source: TEACHER_SIS_SOURCE, sis_id: adopt.sisId })
        .eq('id', adopt.teacherId)
        .is('sis_id', null)
        .select('id');
      if (error) {
        throw new Error(`Adopting a teacher at ${school.schoolName} failed: ${error.message}`);
      }
      // RLS is bypassed here (service role), so an empty result means the row
      // changed since the plan was computed — count honestly, don't guess.
      result.adopted += (data ?? []).length;
    }

    for (const update of school.updates) {
      const { data, error } = await supabase
        .from('teachers')
        .update(update.changes)
        .eq('id', update.teacherId)
        .eq('sis_source', TEACHER_SIS_SOURCE)
        .eq('sis_id', update.sisId)
        .select('id');
      if (error) {
        throw new Error(`Updating a teacher at ${school.schoolName} failed: ${error.message}`);
      }
      result.updated += (data ?? []).length;
    }

  }
}
