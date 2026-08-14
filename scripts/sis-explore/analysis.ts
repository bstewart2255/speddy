/**
 * SPE-398 · the analysis half of the SIS exploration tooling.
 *
 * Deliberately PURE. Nothing here touches a network or a database: it takes
 * already-fetched rows and returns findings. That split is the point — the
 * questions this tool answers are the ones we cannot answer today, so the logic
 * that answers them has to be testable without a district's credentials, and
 * has to keep being testable after JSUSD connects.
 *
 * Every report separates AGGREGATES from DETAIL. Aggregates are safe to paste
 * into Linear or a chat; detail carries student-level district IDs and is
 * written only to a git-ignored file. `report.ts` enforces that split; this
 * module just keeps the two apart so it can.
 *
 * Why these four, in this order (SPE-392's "I don't want the concierge option
 * if it makes us blind"): each one is a precondition for the next. If our
 * student number does not mean the same thing as theirs, the match rate is
 * meaningless; if nothing matches, teacher linkage has nothing to link.
 */
import { isSecondarySchool, parseGradeLevel } from '../../lib/school-helpers';
import { normalizeDistrictStudentId } from '../../lib/utils/student-matcher';

/**
 * Compare IDs the way the rest of the app already does (`.trim().toUpperCase()`).
 *
 * Raised by Codex. Raw exact-match would call `abc123` and `ABC123` different
 * students, where the import path (`lib/import/classify.ts`) treats them as the
 * same — so a formatting-only difference could report `no-overlap` and void the
 * whole run. Comparison is normalized; the values SHOWN in the detail report
 * stay exactly as they were entered, so somebody can look them up.
 */
const norm = (id: string | null | undefined): string => normalizeDistrictStudentId(id);

// ---------------------------------------------------------------------------
// Inputs — normalized so Aeries and OneRoster produce the same shapes.
// ---------------------------------------------------------------------------

/** A caseload row as Speddy holds it. */
export interface SpeddyStudent {
  studentId: string;
  childId: string;
  /** What a provider typed in (SPE-339), from the CHILD record — canonical. */
  districtStudentId: string | null;
  /**
   * The same column on `students`, which predates the child record (SPE-347).
   *
   * Carried so the match-rate report can tell "nobody entered an ID" apart from
   * "an ID was entered but the backfill never moved it to the child record".
   * Production has rows in that second state, and they would otherwise be
   * counted as missing data at the district rather than a gap on our side.
   */
  legacyDistrictStudentId?: string | null;
  schoolId: string | null;
  gradeLevel: string;
  teacherId: string | null;
}

/** A student as the SIS holds it. */
export interface SisStudent {
  /** The SIS's own primary key — Aeries StudentID, OneRoster sourcedId. */
  sisId: string;
  /** The field we HOPE is the district's student number. Report 1 tests that. */
  districtStudentId: string | null;
  schoolId: string | null;
  gradeLevel: string | null;
}

/** One student↔teacher edge from the SIS's schedule/enrollment data. */
export interface SisTeacherLink {
  districtStudentId: string;
  /** Stable SIS-side teacher key — TeacherNumber, or a OneRoster sourcedId. */
  teacherKey: string;
}

/** Enough of a school to ask whether it runs the secondary experience. */
export interface SchoolRow {
  id: string;
  name: string;
  school_type?: string | null;
  grade_span_low?: string | null;
}

// ---------------------------------------------------------------------------
// 1. ID semantics — the cheapest question, and everything depends on it.
// ---------------------------------------------------------------------------

export interface FormatSummary {
  /** How many values were examined. */
  count: number;
  allDigits: number;
  lengths: Record<number, number>;
}

export interface IdSemanticsReport {
  speddyIdsEntered: number;
  sisRecords: number;
  sisIdsPresent: number;
  /** Speddy IDs that appear in the SIS's identifier set. */
  overlap: number;
  speddyFormat: FormatSummary;
  sisFormat: FormatSummary;
  /**
   * The actual answer.
   *
   * `same-namespace` — enough overlap that the two fields plainly mean the same
   *   thing, and the match-rate number below can be believed.
   * `no-overlap` — they do NOT mean the same thing. Everything downstream is
   *   void, and the next move is finding which SIS field our providers were
   *   actually copying from. This is the outcome worth catching early, because
   *   it invalidates the whole OneRoster strategy rather than degrading it.
   * `inconclusive` — too little data on one side to say. Not the same as
   *   `no-overlap`, and must never be reported as if it were.
   */
  verdict: 'same-namespace' | 'no-overlap' | 'inconclusive';
  verdictReason: string;
}

function summarizeFormat(values: string[]): FormatSummary {
  const lengths: Record<number, number> = {};
  let allDigits = 0;
  for (const v of values) {
    lengths[v.length] = (lengths[v.length] ?? 0) + 1;
    if (/^\d+$/.test(v)) allDigits++;
  }
  return { count: values.length, allDigits, lengths };
}

export function analyzeIdSemantics(
  speddy: SpeddyStudent[],
  sis: SisStudent[],
): IdSemanticsReport {
  const speddyIds = speddy.map((s) => s.districtStudentId).filter((v): v is string => !!v);
  const sisIds = sis.map((s) => s.districtStudentId).filter((v): v is string => !!v);
  const sisSet = new Set(sisIds.map(norm));
  const overlap = new Set(speddyIds.map(norm).filter((id) => sisSet.has(id))).size;
  const distinctSpeddy = new Set(speddyIds.map(norm)).size;

  let verdict: IdSemanticsReport['verdict'];
  let verdictReason: string;
  if (distinctSpeddy === 0) {
    verdict = 'inconclusive';
    verdictReason = 'No Speddy student has a district student ID entered, so there is nothing to compare.';
  } else if (sisSet.size === 0) {
    verdict = 'inconclusive';
    verdictReason = 'The SIS returned no identifiers in the field we read, so the comparison could not be made.';
  } else if (overlap === 0) {
    verdict = 'no-overlap';
    verdictReason =
      `None of the ${distinctSpeddy} district IDs entered in Speddy appear in the SIS's identifier field. ` +
      'These are almost certainly different numbers — find which SIS field providers were copying before trusting any match rate.';
  } else {
    // A partial overlap is still the same namespace: we hold a caseload, they
    // hold the whole district, and our data is hand-entered. What would signal
    // a DIFFERENT namespace is zero overlap, not incomplete overlap.
    verdict = 'same-namespace';
    verdictReason =
      `${overlap} of ${distinctSpeddy} district IDs entered in Speddy were found in the SIS. ` +
      'The two fields refer to the same numbering, so the match rate below is meaningful.';
  }

  return {
    speddyIdsEntered: distinctSpeddy,
    sisRecords: sis.length,
    sisIdsPresent: sisSet.size,
    overlap,
    speddyFormat: summarizeFormat([...new Set(speddyIds)]),
    sisFormat: summarizeFormat([...sisSet]),
    verdict,
    verdictReason,
  };
}

// ---------------------------------------------------------------------------
// 2. Match rate — does the "we identify the caseload, the SIS enriches it"
//    strategy actually work at this district?
// ---------------------------------------------------------------------------

export interface MatchRateReport {
  speddyStudents: number;
  speddyChildren: number;
  withId: number;
  withoutId: number;
  matched: number;
  /** An ID was entered, but the SIS has no student with it. */
  unmatchedNotInSis: number;
  /** Percentage of the WHOLE caseload we could enrich. */
  matchRateOfAll: number;
  /** Percentage of those that even had an ID to match on. */
  matchRateOfThoseWithId: number;
  /** Same district ID on more than one child — a data-entry collision. */
  duplicates: { districtStudentId: string; childIds: string[] }[];
  /**
   * An ID sits on the `students` row but not on that child record, AND the ID
   * is not on any other child either. Nothing else claims it, so moving it
   * across is the safe remedy — this is the state the label "backfill gap"
   * actually describes.
   */
  backfillGap: number;
  /**
   * The same shape, except the ID ALREADY belongs to a different child record.
   * That is not a backfill that failed to run — it is one student holding two
   * child records (SPE-408), and copying the ID across would put one district
   * student ID on two children.
   *
   * Split out from `backfillGap` because the two states have opposite remedies
   * and, on the only real data this tool has seen (JSUSD), every single
   * instance was this one. A report that names the cheap remedy for the
   * expensive state is worse than no report (SPE-409).
   */
  probableDuplicateChild: number;
  /** DETAIL — student-level, never leaves the git-ignored report. */
  unmatchedIds: string[];
}

export function analyzeMatchRate(
  speddy: SpeddyStudent[],
  sis: SisStudent[],
): MatchRateReport {
  const sisSet = new Set(
    sis.map((s) => norm(s.districtStudentId)).filter((v) => v !== ''),
  );

  // Children, not caseload rows: a co-served child appears on two providers'
  // caseloads and must count once, or the match rate is quietly inflated by
  // however much co-serving this district does.
  const byChild = new Map<string, SpeddyStudent>();
  for (const s of speddy) if (!byChild.has(s.childId)) byChild.set(s.childId, s);
  const children = [...byChild.values()];

  const withId = children.filter((c) => !!c.districtStudentId);
  const matched = withId.filter((c) => sisSet.has(norm(c.districtStudentId)));
  const unmatched = withId.filter((c) => !sisSet.has(norm(c.districtStudentId)));

  const collisions = new Map<string, string[]>();
  for (const c of children) {
    if (!c.districtStudentId) continue;
    const key = norm(c.districtStudentId);
    const list = collisions.get(key) ?? [];
    list.push(c.childId);
    collisions.set(key, list);
  }

  const stranded = children.filter(
    (c) => !c.districtStudentId && !!c.legacyDistrictStudentId,
  );

  // How many children would hold each ID once every stranded one is copied
  // across. Counting is cheap, and it is the whole difference between "copy
  // this across" and "merge these two children" — so the tool decides it
  // rather than whoever reads the report.
  //
  // Both sources have to be counted, not just the child records: two stranded
  // children can carry the SAME legacy ID with neither holding it on a child
  // record yet. Looking only at child records calls both of those a safe
  // backfill, and following that advice lands one district student ID on two
  // children — the exact outcome SPE-409 exists to prevent.
  const claims = new Map<string, number>();
  const claim = (id: string) => {
    if (id !== '') claims.set(id, (claims.get(id) ?? 0) + 1);
  };
  for (const c of children) claim(norm(c.districtStudentId));
  for (const c of stranded) claim(norm(c.legacyDistrictStudentId));

  // >1 means somebody else claims it too, so a copy would collide.
  const probableDuplicateChild = stranded.filter(
    (c) => (claims.get(norm(c.legacyDistrictStudentId)) ?? 0) > 1,
  ).length;
  const backfillGap = stranded.length - probableDuplicateChild;

  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

  return {
    speddyStudents: speddy.length,
    speddyChildren: children.length,
    withId: withId.length,
    withoutId: children.length - withId.length,
    matched: matched.length,
    unmatchedNotInSis: unmatched.length,
    matchRateOfAll: pct(matched.length, children.length),
    matchRateOfThoseWithId: pct(matched.length, withId.length),
    duplicates: [...collisions.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([districtStudentId, childIds]) => ({ districtStudentId, childIds })),
    backfillGap,
    probableDuplicateChild,
    unmatchedIds: unmatched.map((c) => c.districtStudentId!),
  };
}

// ---------------------------------------------------------------------------
// 3. Secondary teacher linkage — the owner's named question, and the empirical
//    input SPE-334/SPE-342 have been missing.
// ---------------------------------------------------------------------------

export interface TeacherLinkageReport {
  /** Matched children at a school that runs the secondary experience. */
  secondaryMatched: number;
  /** How many SIS teachers each of those students has: count keyed by teachers. */
  teachersPerStudent: Record<number, number>;
  /** Students whose SIS teacher set contains the one teacher Speddy records. */
  speddyTeacherConfirmed: number;
  /** Speddy records a teacher, resolved to a SIS teacher, who is NOT listed. */
  speddyTeacherNotInSisSet: number;
  /**
   * Speddy records a teacher we could not resolve to any SIS teacher at all.
   *
   * A SEPARATE bucket from the one above, because they are different findings
   * with different fixes: "the SIS disagrees about this student's teacher" is
   * about rostering, while "we cannot tell who this Speddy teacher is in the
   * SIS" is about our own teacher records lacking an email that matches. The
   * `teachers` table carries no SIS key, so resolution is by email and will
   * fail often — collapsing the two would report our own data gap as a
   * disagreement with the district.
   */
  speddyTeacherUnresolvable: number;
  /** Speddy records no teacher at all. */
  speddyTeacherAbsent: number;
  /** Students the SIS gave no teacher edges for. */
  noSisTeachers: number;
  /**
   * The number that answers the question. What share of secondary students does
   * today's single-teacher model actually describe?
   */
  oneTeacherModelCoverage: number;
  /** DETAIL — district IDs of students with more than one SIS teacher. */
  multiTeacherIds: string[];
}

export function analyzeTeacherLinkage(
  speddy: SpeddyStudent[],
  sis: SisStudent[],
  links: SisTeacherLink[],
  schools: SchoolRow[],
  /** Maps a Speddy teacher_id to the SIS-side key, when we can resolve it. */
  speddyTeacherToSisKey: Map<string, string>,
): TeacherLinkageReport {
  const secondaryIds = new Set(
    schools.filter((s) => isSecondarySchool(s)).map((s) => s.id),
  );
  const sisSet = new Set(
    sis.map((s) => norm(s.districtStudentId)).filter((v) => v !== ''),
  );

  const byChild = new Map<string, SpeddyStudent>();
  for (const s of speddy) if (!byChild.has(s.childId)) byChild.set(s.childId, s);

  // A school flagged secondary wins; otherwise fall back to the student's own
  // grade, so a district whose school_type is blank still gets an answer rather
  // than a silently empty report.
  const isSecondary = (s: SpeddyStudent) => {
    if (s.schoolId && secondaryIds.has(s.schoolId)) return true;
    const g = parseGradeLevel(s.gradeLevel);
    return g !== null && g >= 6;
  };

  const subjects = [...byChild.values()].filter(
    (s) => s.districtStudentId && sisSet.has(norm(s.districtStudentId)) && isSecondary(s),
  );

  const linksByStudent = new Map<string, Set<string>>();
  for (const l of links) {
    const key = norm(l.districtStudentId);
    const set = linksByStudent.get(key) ?? new Set<string>();
    set.add(l.teacherKey);
    linksByStudent.set(key, set);
  }

  const teachersPerStudent: Record<number, number> = {};
  let confirmed = 0;
  let notInSet = 0;
  let unresolvable = 0;
  let absent = 0;
  let noSis = 0;
  const multiTeacherIds: string[] = [];

  for (const s of subjects) {
    const sisTeachers = linksByStudent.get(norm(s.districtStudentId)) ?? new Set<string>();
    const n = sisTeachers.size;
    teachersPerStudent[n] = (teachersPerStudent[n] ?? 0) + 1;
    if (n === 0) noSis++;
    if (n > 1) multiTeacherIds.push(s.districtStudentId!);

    if (!s.teacherId) {
      absent++;
    } else {
      const sisKey = speddyTeacherToSisKey.get(s.teacherId);
      // Never counted as confirmed. "We could not check" and "it matched" are
      // the two answers a reassuring report would merge.
      if (!sisKey) unresolvable++;
      else if (sisTeachers.has(sisKey)) confirmed++;
      else notInSet++;
    }
  }

  const withAnySis = subjects.length - noSis;
  const exactlyOne = teachersPerStudent[1] ?? 0;

  return {
    secondaryMatched: subjects.length,
    teachersPerStudent,
    speddyTeacherConfirmed: confirmed,
    speddyTeacherNotInSisSet: notInSet,
    speddyTeacherUnresolvable: unresolvable,
    speddyTeacherAbsent: absent,
    noSisTeachers: noSis,
    oneTeacherModelCoverage:
      withAnySis === 0 ? 0 : Math.round((exactlyOne / withAnySis) * 1000) / 10,
    multiTeacherIds,
  };
}

// ---------------------------------------------------------------------------
// 4. SpEd-flag comparison — Aeries only; OneRoster carries no such flag.
// ---------------------------------------------------------------------------

export interface SpedFlagReport {
  sisSpedStudents: number;
  speddyCaseloadChildren: number;
  inBoth: number;
  /** Flagged special education in Aeries, absent from every Speddy caseload. */
  sisOnly: number;
  /** On a Speddy caseload, not flagged in Aeries. */
  speddyOnly: number;
  /** DETAIL — district IDs, never leaves the git-ignored report. */
  sisOnlyIds: string[];
  speddyOnlyIds: string[];
}

export function analyzeSpedFlags(
  speddy: SpeddyStudent[],
  sisSpedDistrictIds: string[],
): SpedFlagReport {
  const sisSet = new Set(sisSpedDistrictIds.map(norm).filter((v) => v !== ''));
  const speddySet = new Set(
    speddy.map((s) => norm(s.districtStudentId)).filter((v) => v !== ''),
  );

  const inBoth = [...speddySet].filter((id) => sisSet.has(id));
  const sisOnly = [...sisSet].filter((id) => !speddySet.has(id));
  const speddyOnly = [...speddySet].filter((id) => !sisSet.has(id));

  return {
    sisSpedStudents: sisSet.size,
    speddyCaseloadChildren: speddySet.size,
    inBoth: inBoth.length,
    sisOnly: sisOnly.length,
    speddyOnly: speddyOnly.length,
    sisOnlyIds: sisOnly,
    speddyOnlyIds: speddyOnly,
  };
}

// ---------------------------------------------------------------------------
// OneRoster enrollments → student↔teacher edges.
// ---------------------------------------------------------------------------

export interface EnrollmentRow {
  role?: string;
  user?: { sourcedId: string };
  class?: { sourcedId: string };
}

/**
 * Turn OneRoster enrollments into the student↔teacher edges report 3 needs.
 *
 * OneRoster does not state "this teacher teaches this student" anywhere. It
 * states that a user is enrolled in a class, with a role. The edge has to be
 * derived by joining the two roles THROUGH the class, which is the step that
 * can be silently wrong — and wrong here means a fabricated teachers-per-student
 * distribution, which is the exact number SPE-334/342 are waiting on.
 *
 * @param studentSourcedIdToDistrictId maps a OneRoster student to the district
 *   number the rest of the analysis keys on. Students missing from it are
 *   dropped rather than guessed at.
 */
export function enrollmentsToTeacherLinks(
  enrollments: EnrollmentRow[],
  studentSourcedIdToDistrictId: Map<string, string>,
): SisTeacherLink[] {
  const studentsByClass = new Map<string, Set<string>>();
  const teachersByClass = new Map<string, Set<string>>();

  for (const e of enrollments) {
    const classId = e.class?.sourcedId;
    const userId = e.user?.sourcedId;
    if (!classId || !userId) continue;
    const bucket = e.role === 'teacher' ? teachersByClass : e.role === 'student' ? studentsByClass : null;
    // Any other role (administrator, or a value this district invented) is
    // skipped rather than defaulted into one of the two — an administrator
    // counted as a teacher would inflate every student's teacher count.
    if (!bucket) continue;
    const set = bucket.get(classId) ?? new Set<string>();
    set.add(userId);
    bucket.set(classId, set);
  }

  const seen = new Set<string>();
  const links: SisTeacherLink[] = [];
  for (const [classId, students] of studentsByClass) {
    const teachers = teachersByClass.get(classId);
    if (!teachers) continue;
    for (const studentSourcedId of students) {
      const districtStudentId = studentSourcedIdToDistrictId.get(studentSourcedId);
      if (!districtStudentId) continue;
      for (const teacherKey of teachers) {
        // A student and teacher who share several classes are ONE edge, not
        // several — otherwise a district with period-by-period enrollments
        // reports six teachers where there is one.
        const key = `${districtStudentId}::${teacherKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ districtStudentId, teacherKey });
      }
    }
  }
  return links;
}
