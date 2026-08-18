/**
 * SPE-437 · the teacher-sync planner, rung by rung.
 *
 * Everything here is the PURE half — plain data in, a plan out — so each rule
 * the owner decided from JSUSD's live feed is pinned without a server:
 * the staff-ID population rule, the KG-is-filler grade rule, the school-name
 * mapping that refuses ambiguity, and a ladder where a name match NEVER
 * writes anything on its own.
 *
 * Fixture names are invented. The real feed's shapes (sentinel identifiers,
 * ALL-CAPS names, shadow duplicate rows) are reproduced; its people are not.
 */
import {
  planTeacherDirectorySync,
  toFeedTeacher,
  type FeedTeacher,
  type PlannerInput,
} from '@/lib/sis/teacher-directory-sync';

jest.mock('@/lib/logger', () => {
  const fake: Record<string, unknown> = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  fake.child = () => fake;
  return { logger: fake };
});

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const SCHOOL_ELEM = { id: 'sch-elem', name: 'Rodeo Vista Elementary' };
const SCHOOL_HIGH = { id: 'sch-high', name: 'Crockett Point High' };

const FEED_ELEM = { sourcedId: 'org-elem', name: 'Rodeo Vista Elementary School' };
const FEED_HIGH = { sourcedId: 'org-high', name: 'Crockett Point High School' };

let nextId = 0;
function teacher(overrides: Partial<FeedTeacher> = {}): FeedTeacher {
  nextId += 1;
  return {
    sourcedId: `t-${String(nextId).padStart(3, '0')}`,
    firstName: 'PAT',
    lastName: `TEACHER${nextId}`,
    email: `pat${nextId}@example.org`,
    identifier: `11_TCH_${1000 + nextId}`,
    grades: ['03'],
    orgIds: [FEED_ELEM.sourcedId],
    isTeacher: true,
    ...overrides,
  };
}

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    feedSchools: [FEED_ELEM, FEED_HIGH],
    feedTeachers: [],
    speddySchools: [SCHOOL_ELEM, SCHOOL_HIGH],
    existingTeachers: [],
    studentCounts: { [SCHOOL_ELEM.id]: 10, [SCHOOL_HIGH.id]: 10 },
    ...overrides,
  };
}

const schoolPlan = (plan: ReturnType<typeof planTeacherDirectorySync>, id: string) => {
  const found = plan.schools.find((s) => s.schoolId === id);
  if (!found) throw new Error(`no plan for ${id}`);
  return found;
};

beforeEach(() => {
  nextId = 0;
});

// ---------------------------------------------------------------------------
// The population rule (owner decision 1)
// ---------------------------------------------------------------------------

describe('the staff-ID population rule', () => {
  it('creates real-teacher rows and excludes sentinel rows, per school', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [
          teacher(),
          teacher({ isTeacher: false, identifier: 'non-teaching staff', email: 'aide@example.org' }),
        ],
      }),
    );
    const elem = schoolPlan(plan, SCHOOL_ELEM.id);
    expect(elem.creates).toHaveLength(1);
    expect(elem.excludedNonTeaching).toBe(1);
    expect(plan.feedTeacherRows).toBe(1);
    expect(plan.feedTotalRows).toBe(2);
  });

  it('stores names VERBATIM — no case prettifying', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [teacher({ firstName: 'CHARLI', lastName: 'OMALLEY' })],
      }),
    );
    const [create] = schoolPlan(plan, SCHOOL_ELEM.id).creates;
    expect(create.firstName).toBe('CHARLI');
    expect(create.lastName).toBe('OMALLEY');
  });

  it('carries the display staff ID onto the planned create', () => {
    const plan = planTeacherDirectorySync(
      input({ feedTeachers: [teacher({ identifier: '11_TCH_1174' })] }),
    );
    expect(schoolPlan(plan, SCHOOL_ELEM.id).creates[0].staffId).toBe('11_TCH_1174');
  });
});

describe('toFeedTeacher (the feed-row pick)', () => {
  it('flags the sentinel identifier as non-teaching, case- and space-insensitively', () => {
    for (const value of ['non-teaching staff', 'Non-Teaching Staff', ' NON-TEACHING   STAFF ']) {
      const row = toFeedTeacher({
        sourcedId: 'x',
        givenName: 'A',
        familyName: 'B',
        identifier: value,
      });
      expect(row?.isTeacher).toBe(false);
    }
  });

  it('treats a missing identifier as non-teaching (no ID, no auto-create)', () => {
    const row = toFeedTeacher({ sourcedId: 'x', givenName: 'A', familyName: 'B' });
    expect(row?.isTeacher).toBe(false);
  });

  it('drops tobedeleted, nameless, and unkeyable rows entirely', () => {
    expect(
      toFeedTeacher({ sourcedId: 'x', givenName: 'A', familyName: 'B', status: 'tobedeleted' }),
    ).toBeNull();
    expect(toFeedTeacher({ sourcedId: 'x', identifier: '11_TCH_1' })).toBeNull();
    // A blank sourcedId can never become a teachers.sis_id.
    expect(toFeedTeacher({ sourcedId: '   ', givenName: 'A', familyName: 'B' })).toBeNull();
  });

  it('nulls an implausible email so it behaves as absent everywhere at once', () => {
    // GoTrue would reject it mid-apply otherwise, wedging the run on the same
    // row forever (PR #833 review). Same shape check as the admin route.
    for (const bad of ['j smith@district.org', 'none', 'x@y', 'trailingdot@x.', '@x.org']) {
      const row = toFeedTeacher({
        sourcedId: 'x',
        givenName: 'A',
        familyName: 'B',
        identifier: '11_TCH_1',
        email: bad,
      });
      expect(row?.email).toBeNull();
    }
    const good = toFeedTeacher({
      sourcedId: 'x',
      givenName: 'A',
      familyName: 'B',
      identifier: '11_TCH_1',
      email: 'a.b@district.org',
    });
    expect(good?.email).toBe('a.b@district.org');
  });

  it('degrades a non-array orgs value to no schools instead of throwing', () => {
    const row = toFeedTeacher({
      sourcedId: 'x',
      givenName: 'A',
      familyName: 'B',
      identifier: '11_TCH_1',
      orgs: { href: 'not-an-array' } as never,
    });
    expect(row?.orgIds).toEqual([]);
  });

  it('keeps only the fields the pick names — vendor extras cannot ride along', () => {
    const row = toFeedTeacher({
      sourcedId: 'x',
      givenName: 'A',
      familyName: 'B',
      identifier: '11_TCH_1',
      password: 'planted-password',
      birthDate: 'planted-birthdate',
    });
    expect(JSON.stringify(row)).not.toContain('planted-');
  });
});

// ---------------------------------------------------------------------------
// The grade rule
// ---------------------------------------------------------------------------

describe('the grade rules: Speddy dialect + KG-is-filler', () => {
  it("stores the feed's KG as Speddy's K at an elementary school", () => {
    const plan = planTeacherDirectorySync(input({ feedTeachers: [teacher({ grades: ['KG'] })] }));
    expect(schoolPlan(plan, SCHOOL_ELEM.id).creates[0].gradeLevel).toBe('K');
  });

  it('treats a lone KG as unknown at a non-elementary school', () => {
    const plan = planTeacherDirectorySync(
      input({ feedTeachers: [teacher({ grades: ['KG'], orgIds: [FEED_HIGH.sourcedId] })] }),
    );
    expect(schoolPlan(plan, SCHOOL_HIGH.id).creates[0].gradeLevel).toBeNull();
  });

  it('treats a lone literal K the same as a lone KG — filler outside an elementary school', () => {
    // Deliberate widening with the translation: after KG→K, a feed sending
    // 'K' directly is the same unverifiable claim (PR #832 review).
    const plan = planTeacherDirectorySync(
      input({ feedTeachers: [teacher({ grades: ['K'], orgIds: [FEED_HIGH.sourcedId] })] }),
    );
    expect(schoolPlan(plan, SCHOOL_HIGH.id).creates[0].gradeLevel).toBeNull();
  });

  it('strips leading zeros — the feed says 09, Speddy says 9', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [teacher({ grades: ['09', '10', '11', '12'], orgIds: [FEED_HIGH.sourcedId] })],
      }),
    );
    expect(schoolPlan(plan, SCHOOL_HIGH.id).creates[0].gradeLevel).toBe('9,10,11,12');
  });

  it("writes the editor's exact format: its order, bare-comma joined", () => {
    // 'KG, PK, TK' in feed order must store as 'PK,TK,K' — the same string
    // the teacher editor would save for the same selection, so the two
    // writers can never ping-pong formatting "changes" at each other.
    const plan = planTeacherDirectorySync(
      input({ feedTeachers: [teacher({ grades: ['KG', 'PK', 'TK'] })] }),
    );
    expect(schoolPlan(plan, SCHOOL_ELEM.id).creates[0].gradeLevel).toBe('PK,TK,K');
  });

  it('dedupes grades that collapse to the same Speddy value', () => {
    const plan = planTeacherDirectorySync(
      input({ feedTeachers: [teacher({ grades: ['KG', 'K', '01', '1'] })] }),
    );
    expect(schoolPlan(plan, SCHOOL_ELEM.id).creates[0].gradeLevel).toBe('K,1');
  });

  it('passes an unrecognized grade through with its casing intact', () => {
    const plan = planTeacherDirectorySync(
      input({ feedTeachers: [teacher({ grades: [' Other '] })] }),
    );
    expect(schoolPlan(plan, SCHOOL_ELEM.id).creates[0].gradeLevel).toBe('Other');
  });
});

// ---------------------------------------------------------------------------
// School mapping
// ---------------------------------------------------------------------------

describe('school mapping', () => {
  it('matches by normalized name prefix — “X Elementary” ↔ “X Elementary School”', () => {
    const plan = planTeacherDirectorySync(input({ feedTeachers: [teacher()] }));
    expect(schoolPlan(plan, SCHOOL_ELEM.id).sisSchoolName).toBe(FEED_ELEM.name);
    expect(schoolPlan(plan, SCHOOL_ELEM.id).refusal).toBeNull();
  });

  it('REFUSES a school whose name matches two SIS schools, and says so', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedSchools: [
          FEED_ELEM,
          { sourcedId: 'org-elem-2', name: 'Rodeo Vista Elementary Annex' },
        ],
        feedTeachers: [teacher()],
      }),
    );
    const elem = schoolPlan(plan, SCHOOL_ELEM.id);
    expect(elem.refusal).toMatch(/2 SIS schools match/);
    expect(elem.creates).toHaveLength(0);
  });

  it('REFUSES both schools when they claim the same SIS school', () => {
    const plan = planTeacherDirectorySync(
      input({
        speddySchools: [
          { id: 'a', name: 'Crockett Point High' },
          { id: 'b', name: 'Crockett Point' },
        ],
        feedSchools: [FEED_HIGH],
        studentCounts: { a: 1, b: 1 },
      }),
    );
    expect(schoolPlan(plan, 'a').refusal).toMatch(/same SIS school/);
    expect(schoolPlan(plan, 'b').refusal).toMatch(/same SIS school/);
  });

  it('REFUSES a school with no SIS counterpart rather than guessing', () => {
    const plan = planTeacherDirectorySync(
      input({ speddySchools: [{ id: 'x', name: 'Willowbrook K8' }], studentCounts: { x: 5 } }),
    );
    expect(schoolPlan(plan, 'x').refusal).toMatch(/No school in the SIS feed matches/);
  });

  it('reports SIS schools nobody claims, with their teacher-row counts', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedSchools: [FEED_ELEM, FEED_HIGH, { sourcedId: 'org-willow', name: 'Willow High 501' }],
        feedTeachers: [teacher({ orgIds: ['org-willow'] })],
      }),
    );
    expect(plan.unmappedSisSchools).toEqual([{ name: 'Willow High 501', teacherRows: 1 }]);
    // And nothing was created anywhere for it.
    expect(plan.schools.flatMap((s) => s.creates)).toHaveLength(0);
  });

  it('creates a multi-school teacher once per mapped school', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [teacher({ orgIds: [FEED_ELEM.sourcedId, FEED_HIGH.sourcedId] })],
      }),
    );
    expect(schoolPlan(plan, SCHOOL_ELEM.id).creates).toHaveLength(1);
    expect(schoolPlan(plan, SCHOOL_HIGH.id).creates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

const EXISTING_BASE = {
  school_id: SCHOOL_ELEM.id,
  grade_level: null,
  sis_source: null,
  sis_id: null,
};

describe('the reconcile ladder', () => {
  it('keyed + identical → unchanged; nothing written', () => {
    const t = teacher({ grades: [] });
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [t],
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-1',
            first_name: t.firstName,
            last_name: t.lastName,
            email: t.email,
            sis_source: 'oneroster',
            sis_id: t.sourcedId,
          },
        ],
      }),
    );
    const elem = schoolPlan(plan, SCHOOL_ELEM.id);
    expect(elem.unchanged).toBe(1);
    expect(elem.creates).toHaveLength(0);
    expect(elem.updates).toHaveLength(0);
  });

  it('keyed + drifted → update carrying ONLY the changed fields (SIS-owned row)', () => {
    const t = teacher({ email: 'new-address@example.org', grades: [] });
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [t],
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-1',
            first_name: t.firstName,
            last_name: t.lastName,
            email: 'old-address@example.org',
            sis_source: 'oneroster',
            sis_id: t.sourcedId,
          },
        ],
      }),
    );
    const [update] = schoolPlan(plan, SCHOOL_ELEM.id).updates;
    expect(update.teacherId).toBe('row-1');
    expect(update.changes).toEqual({ email: 'new-address@example.org' });
  });

  it('a case-only email difference is NOT a change', () => {
    const t = teacher({ email: 'Same@Example.org', grades: [] });
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [t],
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-1',
            first_name: t.firstName,
            last_name: t.lastName,
            email: 'same@example.org',
            sis_source: 'oneroster',
            sis_id: t.sourcedId,
          },
        ],
      }),
    );
    expect(schoolPlan(plan, SCHOOL_ELEM.id).unchanged).toBe(1);
  });

  it('email match on an unkeyed row → ADOPT, never create', () => {
    const t = teacher({ email: 'shared@example.org' });
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [t],
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-1',
            first_name: 'Hand',
            last_name: 'Entered',
            email: 'SHARED@example.org',
          },
        ],
      }),
    );
    const elem = schoolPlan(plan, SCHOOL_ELEM.id);
    expect(elem.adopts).toEqual([
      expect.objectContaining({ teacherId: 'row-1', sisId: t.sourcedId }),
    ]);
    expect(elem.creates).toHaveLength(0);
  });

  it('a NAME match alone goes to review — never adopted, never created', () => {
    // The mutation-style pin for the ladder's most important property: if
    // someone "simplifies" the name rung into an adopt, this fails.
    const t = teacher({ firstName: 'JORDAN', lastName: 'RIVERA', email: 'jr-new@example.org' });
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [t],
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-1',
            first_name: 'Jordan',
            last_name: 'Rivera',
            email: 'jr-old@example.org',
          },
        ],
      }),
    );
    const elem = schoolPlan(plan, SCHOOL_ELEM.id);
    expect(elem.reviews).toEqual([
      expect.objectContaining({
        existingTeacherId: 'row-1',
        feedName: 'JORDAN RIVERA',
        reason: 'name-match',
      }),
    ]);
    expect(elem.adopts).toHaveLength(0);
    expect(elem.creates).toHaveLength(0);
  });

  it('an email carried by SEVERAL unkeyed rows goes to review — adopting one would be a guess', () => {
    const t = teacher({ email: 'shared@example.org' });
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [t],
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-1',
            first_name: 'First',
            last_name: 'Holder',
            email: 'shared@example.org',
          },
          {
            ...EXISTING_BASE,
            id: 'row-2',
            first_name: 'Second',
            last_name: 'Holder',
            email: 'SHARED@example.org',
          },
        ],
      }),
    );
    const elem = schoolPlan(plan, SCHOOL_ELEM.id);
    expect(elem.adopts).toHaveLength(0);
    expect(elem.creates).toHaveLength(0);
    expect(elem.reviews).toEqual([
      expect.objectContaining({ existingTeacherId: 'row-1', reason: 'ambiguous-email' }),
      expect.objectContaining({ existingTeacherId: 'row-2', reason: 'ambiguous-email' }),
    ]);
  });

  it('no match → create', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [teacher()],
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-1',
            first_name: 'Someone',
            last_name: 'Else',
            email: 'else@example.org',
          },
        ],
      }),
    );
    expect(schoolPlan(plan, SCHOOL_ELEM.id).creates).toHaveLength(1);
  });

  it('a sync-keyed row the feed no longer carries is REPORTED, in no write bucket', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [],
        studentCounts: { [SCHOOL_ELEM.id]: 0, [SCHOOL_HIGH.id]: 0 },
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-gone',
            first_name: 'Gone',
            last_name: 'Fromfeed',
            email: 'gone@example.org',
            sis_source: 'oneroster',
            sis_id: 'no-longer-there',
          },
        ],
      }),
    );
    const elem = schoolPlan(plan, SCHOOL_ELEM.id);
    expect(elem.missingFromSis).toEqual([
      expect.objectContaining({ teacherId: 'row-gone', name: 'Gone Fromfeed' }),
    ]);
    expect(elem.creates).toHaveLength(0);
    expect(elem.adopts).toHaveLength(0);
    expect(elem.updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Feed anomalies
// ---------------------------------------------------------------------------

describe('feed anomalies', () => {
  it('counts a sentinel row whose email matches a real teacher as a shadow duplicate', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [
          teacher({ email: 'both@example.org', orgIds: [FEED_HIGH.sourcedId] }),
          teacher({
            isTeacher: false,
            identifier: 'non-teaching staff',
            email: 'both@example.org',
            orgIds: [FEED_ELEM.sourcedId],
          }),
        ],
      }),
    );
    expect(plan.shadowDuplicates).toBe(1);
    // The person exists once, at the school where they are a teacher.
    expect(schoolPlan(plan, SCHOOL_HIGH.id).creates).toHaveLength(1);
    expect(schoolPlan(plan, SCHOOL_ELEM.id).creates).toHaveLength(0);
  });

  it('keeps one row and counts the rest when two teacher rows share an email at one school', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [
          teacher({ sourcedId: 'aaa', email: 'twin@example.org' }),
          teacher({ sourcedId: 'bbb', email: 'twin@example.org' }),
        ],
      }),
    );
    expect(schoolPlan(plan, SCHOOL_ELEM.id).creates).toHaveLength(1);
    expect(plan.duplicateEmailAnomalies).toBe(1);
  });

  it('the dedup tie goes to the row an existing teacher is KEYED to, never orphaning the key', () => {
    // 'aaa' sorts first, but the existing row is keyed to 'bbb': dropping
    // 'bbb' would create a duplicate and report the real teacher as missing
    // (Codex P1, PR #831).
    const a = teacher({ sourcedId: 'aaa', email: 'twin@example.org', grades: [] });
    const b = teacher({ sourcedId: 'bbb', email: 'twin@example.org', grades: [] });
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [a, b],
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-keyed',
            first_name: b.firstName,
            last_name: b.lastName,
            email: b.email,
            sis_source: 'oneroster',
            sis_id: 'bbb',
          },
        ],
      }),
    );
    const elem = schoolPlan(plan, SCHOOL_ELEM.id);
    expect(elem.unchanged).toBe(1);
    expect(elem.creates).toHaveLength(0);
    expect(elem.missingFromSis).toHaveLength(0);
    expect(plan.duplicateEmailAnomalies).toBe(1);
  });

  it('a feed school whose name normalizes to nothing matches NO school', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedSchools: [FEED_ELEM, FEED_HIGH, { sourcedId: 'org-junk', name: '—***—' }],
        feedTeachers: [teacher()],
        // Students only where the feed has teachers, so the only refusal this
        // fixture could produce is the ambiguity one under test.
        studentCounts: { [SCHOOL_ELEM.id]: 10, [SCHOOL_HIGH.id]: 0 },
      }),
    );
    // Neither poisoned into ambiguity nor matched: both real schools map.
    expect(schoolPlan(plan, SCHOOL_ELEM.id).refusal).toBeNull();
    expect(schoolPlan(plan, SCHOOL_HIGH.id).refusal).toBeNull();
    expect(plan.unmappedSisSchools).toEqual([{ name: '—***—', teacherRows: 0 }]);
  });
});

// ---------------------------------------------------------------------------
// The loud per-school refusal (Carquinez's state)
// ---------------------------------------------------------------------------

describe('the zero-teachers guard', () => {
  it('refuses a school with students whose feed rows all fail the population rule', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [
          teacher({ isTeacher: false, identifier: 'non-teaching staff' }),
          teacher({ isTeacher: false, identifier: 'non-teaching staff' }),
        ],
      }),
    );
    const elem = schoolPlan(plan, SCHOOL_ELEM.id);
    expect(elem.refusal).toMatch(/2 staff row\(s\)/);
    expect(elem.refusal).toMatch(/none with a real staff ID/);
    expect(elem.creates).toHaveLength(0);
  });

  it('does NOT refuse a school whose qualifying rows all await review — and shows them', () => {
    // The false-refusal bug both review bots flagged on PR #831: review rows
    // ARE qualifying rows, and a refusal here would claim "none with a real
    // staff ID" about rows that have one — while hiding the review list.
    const t = teacher({ firstName: 'JORDAN', lastName: 'RIVERA', email: 'jr-new@example.org' });
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [t],
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-1',
            first_name: 'Jordan',
            last_name: 'Rivera',
            email: 'jr-old@example.org',
          },
        ],
      }),
    );
    const elem = schoolPlan(plan, SCHOOL_ELEM.id);
    expect(elem.refusal).toBeNull();
    expect(elem.reviews).toHaveLength(1);
  });

  it('does NOT refuse an empty school with no students — nothing to protect', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [],
        studentCounts: { [SCHOOL_ELEM.id]: 0, [SCHOOL_HIGH.id]: 0 },
      }),
    );
    expect(schoolPlan(plan, SCHOOL_ELEM.id).refusal).toBeNull();
  });

  it('does NOT refuse when the school is already fully synced (unchanged counts as sync)', () => {
    const t = teacher({ grades: [] });
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [t],
        existingTeachers: [
          {
            ...EXISTING_BASE,
            id: 'row-1',
            first_name: t.firstName,
            last_name: t.lastName,
            email: t.email,
            sis_source: 'oneroster',
            sis_id: t.sourcedId,
          },
        ],
      }),
    );
    expect(schoolPlan(plan, SCHOOL_ELEM.id).refusal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The second door: teaches-a-class evidence (SPE-540, the Carquinez rescue)
// ---------------------------------------------------------------------------

describe('the teaches-a-class second door', () => {
  it('rescues a sentinel row the rosters show teaching — and only that row', () => {
    const rescued = toFeedTeacher(
      {
        sourcedId: 'cq-1',
        givenName: 'MORGAN',
        familyName: 'ROOMTEACHER',
        identifier: 'non-teaching staff',
        orgs: [{ sourcedId: FEED_ELEM.sourcedId }],
      },
      new Set(['cq-1']),
    );
    expect(rescued?.isTeacher).toBe(true);

    // Same row, no evidence for it: the sentinel still excludes.
    const counselor = toFeedTeacher(
      {
        sourcedId: 'cq-2',
        givenName: 'ALEX',
        familyName: 'COUNSELOR',
        identifier: 'non-teaching staff',
        orgs: [{ sourcedId: FEED_ELEM.sourcedId }],
      },
      new Set(['cq-1']),
    );
    expect(counselor?.isTeacher).toBe(false);

    // No evidence set at all — exactly the pre-SPE-540 rule.
    const withoutSet = toFeedTeacher({
      sourcedId: 'cq-1',
      givenName: 'MORGAN',
      familyName: 'ROOMTEACHER',
      identifier: 'non-teaching staff',
    });
    expect(withoutSet?.isTeacher).toBe(false);
  });

  it('rescues a row with NO identifier at all when the rosters show it teaching', () => {
    const row = toFeedTeacher(
      { sourcedId: 'cq-3', givenName: 'JO', familyName: 'NOIDENT' },
      new Set(['cq-3']),
    );
    expect(row?.isTeacher).toBe(true);
  });

  it('a rescued create never displays the sentinel as a staff ID', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [
          teacher({ identifier: 'non-teaching staff', isTeacher: true }),
          teacher(),
        ],
        teachingEvidence: 'checked',
      }),
    );
    const creates = schoolPlan(plan, SCHOOL_ELEM.id).creates;
    expect(creates).toHaveLength(2);
    const staffIds = creates.map((c) => c.staffId);
    expect(staffIds).toContain(null);
    expect(staffIds).not.toContain('non-teaching staff');
  });

  it('echoes the evidence posture on the plan, defaulting to unavailable', () => {
    expect(planTeacherDirectorySync(input({})).teachingEvidence).toBe('unavailable');
    expect(
      planTeacherDirectorySync(input({ teachingEvidence: 'checked' })).teachingEvidence,
    ).toBe('checked');
  });

  it('the refusal claims only what was checked: rosters read', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [teacher({ isTeacher: false, identifier: 'non-teaching staff' })],
        teachingEvidence: 'checked',
      }),
    );
    const refusal = schoolPlan(plan, SCHOOL_ELEM.id).refusal;
    expect(refusal).toMatch(/staff ID or a teaching assignment/);
    expect(refusal).not.toMatch(/was not available/);
  });

  it('the refusal claims only what was checked: rosters unreadable', () => {
    const plan = planTeacherDirectorySync(
      input({
        feedTeachers: [teacher({ isTeacher: false, identifier: 'non-teaching staff' })],
        teachingEvidence: 'unavailable',
      }),
    );
    const refusal = schoolPlan(plan, SCHOOL_ELEM.id).refusal;
    expect(refusal).toMatch(/none with a real staff ID/);
    expect(refusal).toMatch(/Class-roster evidence was not available/);
    expect(refusal).not.toMatch(/teaching assignment/);
  });
});
