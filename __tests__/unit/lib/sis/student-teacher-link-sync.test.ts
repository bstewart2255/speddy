/**
 * SPE-540 · the link-sync planner, rung by rung.
 *
 * The PURE half — plain data in, a plan out — so every owner-decided rule is
 * pinned without a server: the matching spine (district number, trim-exact,
 * child-record-first with conflict-free caseload fallback), the provenance
 * wall (human links are never added to the diff's writable buckets), the
 * unmatched-children-are-never-diffed rule, and the mass-delete refusals.
 *
 * Fixture names are invented; initials-only display is the real contract.
 */
import {
  LINK_SOURCE,
  linkPlanCounts,
  planStudentTeacherLinkSync,
  writableLinkChangeCount,
  type ExistingLink,
  type LinkPlannerInput,
  type LinkSyncPlan,
} from '@/lib/sis/student-teacher-link-sync';

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
// Builders — one school, one child, one teacher, one shared class by default.
// ---------------------------------------------------------------------------

const SCHOOL = { id: 'sch-1', name: 'Rodeo Vista Elementary' };

function input(overrides: Partial<LinkPlannerInput> = {}): LinkPlannerInput {
  return {
    feedStudents: [{ sourcedId: 'sis-stu-1', identifier: 'DS-100' }],
    feedEnrollments: [
      { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
      { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
    ],
    feedClasses: [{ sourcedId: 'cls-1', title: 'Room 12', periods: ['1'] }],
    speddySchools: [SCHOOL],
    caseloadRows: [{ childId: 'child-1', districtStudentId: 'DS-100' }],
    childRecords: [
      {
        id: 'child-1',
        schoolId: SCHOOL.id,
        initials: 'AB',
        gradeLevel: '3',
        districtStudentId: 'DS-100',
      },
    ],
    sisTeachers: [{ id: 'tch-row-1', schoolId: SCHOOL.id, sisId: 'sis-tch-1' }],
    existingLinks: [],
    ...overrides,
  };
}

const school = (plan: LinkSyncPlan, id: string = SCHOOL.id) => {
  const found = plan.schools.find((s) => s.schoolId === id);
  if (!found) throw new Error(`no plan for ${id}`);
  return found;
};

const link = (overrides: Partial<ExistingLink> = {}): ExistingLink => ({
  id: 'link-1',
  childId: 'child-1',
  teacherId: 'tch-row-1',
  subject: 'Room 12',
  period: '1',
  source: LINK_SOURCE,
  ...overrides,
});

// ---------------------------------------------------------------------------
// The matching spine
// ---------------------------------------------------------------------------

describe('the matching spine', () => {
  it('walks district number → SIS student → live class → teacher row into one add', () => {
    const plan = planStudentTeacherLinkSync(input());
    const s = school(plan);
    expect(s.matchedChildren).toBe(1);
    expect(s.adds).toEqual([
      { childId: 'child-1', teacherId: 'tch-row-1', subject: 'Room 12', period: '1' },
    ]);
    expect(s.removes).toHaveLength(0);
    expect(s.relabels).toHaveLength(0);
    expect(writableLinkChangeCount(plan)).toBe(1);
  });

  it('matches trim-exact: whitespace forgiven, differing digits are different kids', () => {
    const matched = planStudentTeacherLinkSync(
      input({
        feedStudents: [{ sourcedId: 'sis-stu-1', identifier: '  DS-100 ' }],
        childRecords: [
          {
            id: 'child-1',
            schoolId: SCHOOL.id,
            initials: 'AB',
            gradeLevel: '3',
            districtStudentId: ' DS-100  ',
          },
        ],
      }),
    );
    expect(school(matched).matchedChildren).toBe(1);

    const unmatched = planStudentTeacherLinkSync(
      input({
        childRecords: [
          {
            id: 'child-1',
            schoolId: SCHOOL.id,
            initials: 'AB',
            gradeLevel: '3',
            districtStudentId: '0DS-100',
          },
        ],
      }),
    );
    expect(school(unmatched).unmatched).toEqual([
      { initials: 'AB', grade: '3', reason: 'not-in-sis' },
    ]);
  });

  it('falls back to a conflict-free caseload-row number when the child record has none', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        childRecords: [
          {
            id: 'child-1',
            schoolId: SCHOOL.id,
            initials: 'AB',
            gradeLevel: '3',
            districtStudentId: null,
          },
        ],
        caseloadRows: [
          { childId: 'child-1', districtStudentId: null },
          { childId: 'child-1', districtStudentId: ' DS-100 ' },
        ],
      }),
    );
    expect(school(plan).matchedChildren).toBe(1);
    expect(school(plan).adds).toHaveLength(1);
  });

  it('refuses to guess between conflicting caseload-row numbers', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        childRecords: [
          {
            id: 'child-1',
            schoolId: SCHOOL.id,
            initials: 'AB',
            gradeLevel: '3',
            districtStudentId: null,
          },
        ],
        caseloadRows: [
          { childId: 'child-1', districtStudentId: 'DS-100' },
          { childId: 'child-1', districtStudentId: 'DS-200' },
        ],
      }),
    );
    expect(school(plan).unmatched).toEqual([
      { initials: 'AB', grade: '3', reason: 'conflicting-district-ids' },
    ]);
    expect(school(plan).adds).toHaveLength(0);
  });

  it('reports a child with no district number anywhere', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        childRecords: [
          {
            id: 'child-1',
            schoolId: SCHOOL.id,
            initials: 'AB',
            gradeLevel: '3',
            districtStudentId: null,
          },
        ],
        caseloadRows: [{ childId: 'child-1', districtStudentId: '  ' }],
      }),
    );
    expect(school(plan).unmatched).toEqual([
      { initials: 'AB', grade: '3', reason: 'no-district-id' },
    ]);
  });

  it('refuses to pick between two SIS students sharing one district number', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        feedStudents: [
          { sourcedId: 'sis-stu-1', identifier: 'DS-100' },
          { sourcedId: 'sis-stu-2', identifier: 'DS-100' },
        ],
      }),
    );
    expect(school(plan).unmatched).toEqual([
      { initials: 'AB', grade: '3', reason: 'duplicate-in-sis' },
    ]);
    expect(school(plan).adds).toHaveLength(0);
  });

  it('a paging echo of the same SIS student is NOT a duplicate-number refusal', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        feedStudents: [
          { sourcedId: 'sis-stu-1', identifier: 'DS-100' },
          { sourcedId: 'sis-stu-1', identifier: 'DS-100' },
        ],
      }),
    );
    expect(school(plan).matchedChildren).toBe(1);
    expect(plan.feedStudents).toBe(1);
  });

  it('resolves teachers at the CHILD record’s school, not any other', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        sisTeachers: [{ id: 'tch-other', schoolId: 'sch-other', sisId: 'sis-tch-1' }],
      }),
    );
    const s = school(plan);
    expect(s.adds).toHaveLength(0);
    expect(s.teachersNotInDirectory).toBe(1);
  });

  it('skips a child whose record sits at no pilot school — and never diffs it', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        childRecords: [
          {
            id: 'child-1',
            schoolId: 'sch-elsewhere',
            initials: 'AB',
            gradeLevel: '3',
            districtStudentId: 'DS-100',
          },
        ],
        existingLinks: [link()],
      }),
    );
    expect(plan.unplacedChildren).toBe(1);
    expect(school(plan).removes).toHaveLength(0);
    expect(writableLinkChangeCount(plan)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The diff and the provenance wall
// ---------------------------------------------------------------------------

describe('the diff and the provenance wall', () => {
  it('an up-to-date sync link counts unchanged and plans nothing', () => {
    const plan = planStudentTeacherLinkSync(input({ existingLinks: [link()] }));
    const s = school(plan);
    expect(s.unchanged).toBe(1);
    expect(s.adds).toHaveLength(0);
    expect(s.relabels).toHaveLength(0);
    expect(s.removes).toHaveLength(0);
  });

  it('a label drift on a sync link plans a relabel, not an add', () => {
    const plan = planStudentTeacherLinkSync(
      input({ existingLinks: [link({ subject: 'Old Room', period: '9' })] }),
    );
    const s = school(plan);
    expect(s.relabels).toEqual([{ linkId: 'link-1', subject: 'Room 12', period: '1' }]);
    expect(s.adds).toHaveLength(0);
  });

  it('a sync link the rosters no longer assert is planned for removal', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        existingLinks: [link({ id: 'link-stale', teacherId: 'tch-row-gone' })],
      }),
    );
    const s = school(plan);
    expect(s.removes).toEqual([{ linkId: 'link-stale' }]);
    // The still-asserted teacher is a normal add.
    expect(s.adds).toHaveLength(1);
  });

  it('a HUMAN link is never removed, relabeled, or double-added — only counted', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        existingLinks: [
          // Same pair the SIS asserts, owned by a human, with different labels.
          link({ id: 'link-h1', source: 'human', subject: 'Hand-typed', period: '7' }),
          // A pair the SIS does not assert at all, owned by a human.
          link({ id: 'link-h2', teacherId: 'tch-row-extra', source: 'human' }),
        ],
      }),
    );
    const s = school(plan);
    expect(s.adds).toHaveLength(0);
    expect(s.relabels).toHaveLength(0);
    expect(s.removes).toHaveLength(0);
    expect(s.humanLinksKept).toBe(2);
    expect(writableLinkChangeCount(plan)).toBe(0);
  });

  it('an unmatched child’s existing sync links are untouched', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        feedStudents: [{ sourcedId: 'sis-stu-1', identifier: 'DIFFERENT' }],
        existingLinks: [link()],
      }),
    );
    const s = school(plan);
    expect(s.unmatched).toHaveLength(1);
    expect(s.removes).toHaveLength(0);
    expect(writableLinkChangeCount(plan)).toBe(0);
  });

  it('merges every shared class into one link with deterministic labels', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        feedClasses: [
          { sourcedId: 'cls-1', title: 'Science', periods: ['10'] },
          { sourcedId: 'cls-2', title: 'Algebra I', periods: ['2'] },
        ],
        feedEnrollments: [
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-2', role: 'student' },
          { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
          { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-2', role: 'teacher' },
        ],
      }),
    );
    expect(school(plan).adds).toEqual([
      // Titles alphabetical; periods numeric-aware (2 before 10).
      { childId: 'child-1', teacherId: 'tch-row-1', subject: 'Algebra I / Science', period: '2/10' },
    ]);
  });

  it('an enrollment naming a dead class is dropped and counted, not linked', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        feedEnrollments: [
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
          { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-dead', role: 'student' },
          { userSourcedId: 'sis-tch-2', classSourcedId: 'cls-dead', role: 'teacher' },
        ],
        sisTeachers: [
          { id: 'tch-row-1', schoolId: SCHOOL.id, sisId: 'sis-tch-1' },
          { id: 'tch-row-2', schoolId: SCHOOL.id, sisId: 'sis-tch-2' },
        ],
      }),
    );
    expect(plan.staleEnrollments).toBe(2);
    expect(school(plan).adds).toHaveLength(1);
  });

  it('lists a matched child only when the SIS itself shows no teachers', () => {
    // Genuinely teacher-less in the rosters → listed.
    const bare = planStudentTeacherLinkSync(
      input({
        feedEnrollments: [
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
          // Some teacher edge elsewhere keeps the roster side non-zero.
          { userSourcedId: 'sis-tch-9', classSourcedId: 'cls-9', role: 'teacher' },
        ],
        feedClasses: [
          { sourcedId: 'cls-1', title: 'Room 12', periods: [] },
          { sourcedId: 'cls-9', title: 'Elsewhere', periods: [] },
        ],
      }),
    );
    expect(school(bare).noTeachersFound).toEqual([{ initials: 'AB', grade: '3' }]);

    // Teachers exist but aren't in the directory yet → the OTHER bucket.
    const gap = planStudentTeacherLinkSync(input({ sisTeachers: [] }));
    expect(school(gap).noTeachersFound).toHaveLength(0);
    expect(school(gap).teachersNotInDirectory).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The mass-delete refusals
// ---------------------------------------------------------------------------

describe('the whole-run refusals', () => {
  it('refuses an empty student feed instead of diffing against nobody', () => {
    const plan = planStudentTeacherLinkSync(
      input({ feedStudents: [], existingLinks: [link()] }),
    );
    expect(plan.refusal).toMatch(/no students/);
    expect(plan.schools).toHaveLength(0);
    expect(writableLinkChangeCount(plan)).toBe(0);
  });

  it('refuses when the roster’s teacher side is missing — the SPE-538 state', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        feedEnrollments: [
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
        ],
        existingLinks: [link()],
      }),
    );
    expect(plan.refusal).toMatch(/no teacher entries/);
    expect(writableLinkChangeCount(plan)).toBe(0);
  });

  it('refuses when the roster’s student side is missing', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        feedEnrollments: [
          { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
        ],
      }),
    );
    expect(plan.refusal).toMatch(/no student entries/);
  });

  it('refuses when no classes came back to join rosters against', () => {
    const plan = planStudentTeacherLinkSync(input({ feedClasses: [] }));
    expect(plan.refusal).toMatch(/no classes/);
  });
});

// ---------------------------------------------------------------------------
// What the module is allowed to log
// ---------------------------------------------------------------------------

describe('the counts-only log shape', () => {
  it('carries numbers and fixed words — never initials', () => {
    const plan = planStudentTeacherLinkSync(
      input({
        feedStudents: [{ sourcedId: 'sis-stu-1', identifier: 'ZZ-999' }],
      }),
    );
    // The unmatched child (initials AB) exists in the plan…
    expect(school(plan).unmatched).toHaveLength(1);
    // …and is a NUMBER in the loggable shape.
    const counts = linkPlanCounts(plan);
    expect(JSON.stringify(counts)).not.toContain('AB');
    expect(counts.schools[0].unmatched).toBe(1);
  });
});
