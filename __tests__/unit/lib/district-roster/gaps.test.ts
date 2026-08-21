/**
 * SPE-587 · Which published students reach no provider, and why.
 *
 * The load-bearing assertion is the split between "waiting on someone" and
 * "waiting on nobody". A student whose case manager is a district admin is in
 * the second state and looks exactly like the first from the outside: they sit
 * on no caseload, with a real person's name against them. Nothing in the
 * product would ever have raised them again, which is what this view is for.
 *
 * The other half is that the name matching agrees with the provider's own claim
 * screen. If this view calls Toni Bentley "no account in Speddy" while her claim
 * banner is showing her those same sixteen students, the district admin is sent
 * to create an account that already exists.
 *
 * All data is fictional, though the shapes are the ones production produced.
 */

import { planRosterGaps, type GapChildInput, type GapStaffInput } from '@/lib/district-roster/gaps';

const SCHOOLS = { 'sch-rodeo': 'Rodeo Hills Elementary', 'sch-high': 'John Swett High' };

let seq = 0;
const child = (over: Partial<GapChildInput> = {}): GapChildInput => ({
  id: `child-${++seq}`,
  firstName: 'Ana',
  lastName: 'Alvarez',
  initials: 'AA',
  gradeLevel: '1',
  schoolId: 'sch-rodeo',
  caseManager: null,
  caseloadCount: 0,
  ...over,
});

const staff = (fullName: string, role: string): GapStaffInput => ({
  id: `staff-${fullName}`,
  fullName,
  role,
});

const run = (
  children: GapChildInput[],
  people: GapStaffInput[] = [],
  caps: { maxPerGroup?: number; maxStudentsListed?: number } = {},
) => planRosterGaps({ children, staff: people, schoolNamesById: SCHOOLS, ...caps });

beforeEach(() => {
  seq = 0;
});

describe('who is stranded, and why', () => {
  it('flags a case manager who cannot hold a caseload, and names their role', () => {
    const gaps = run(
      [child({ caseManager: 'Megan Tucker' })],
      [staff('Megan Tucker', 'district_admin')],
    );

    expect(gaps.countsByKind['case-manager-cannot-serve']).toBe(1);
    expect(gaps.groups).toHaveLength(1);
    expect(gaps.groups[0]).toMatchObject({
      kind: 'case-manager-cannot-serve',
      caseManager: 'Megan Tucker',
      accountRoleLabel: 'District Admin',
      studentCount: 1,
    });
  });

  it('treats every non-provider role the same way, SEA included', () => {
    // An SEA delivers under supervision and owns no caseload row — the claim
    // flow refuses them, so this view must not report their students as merely
    // waiting on a click.
    for (const role of ['sea', 'teacher', 'site_admin', 'district_tech']) {
      const gaps = run([child({ caseManager: 'Sam Reyes' })], [staff('Sam Reyes', role)]);
      expect(gaps.groups[0].kind).toBe('case-manager-cannot-serve');
    }
  });

  it('calls a provider’s students merely unclaimed', () => {
    const gaps = run(
      [child({ caseManager: 'Denise Domich' })],
      [staff('Denise Domich', 'resource')],
    );

    expect(gaps.groups[0]).toMatchObject({
      kind: 'awaiting-provider-claim',
      caseManager: 'Denise Domich',
      // Same spelling both sides, so there is nothing to disambiguate.
      accountName: null,
      accountRoleLabel: 'Resource',
    });
  });

  it('reports a name no account answers to', () => {
    const gaps = run([child({ caseManager: 'Nobody Here' })], [staff('Denise Domich', 'resource')]);

    expect(gaps.groups[0]).toMatchObject({
      kind: 'case-manager-not-in-speddy',
      caseManager: 'Nobody Here',
      accountName: null,
      accountRoleLabel: null,
    });
  });

  it('separates students the files name nobody for', () => {
    const gaps = run([child({ caseManager: '   ' }), child({ caseManager: null })]);

    expect(gaps.groups).toHaveLength(1);
    expect(gaps.groups[0]).toMatchObject({
      kind: 'no-case-manager',
      caseManager: null,
      studentCount: 2,
    });
  });
});

describe('matching the name the district wrote to the account Speddy has', () => {
  it('folds a nickname, the way the provider’s own claim screen does', () => {
    // Toni Bentley signed up under the name she goes by; SEIS carries her legal
    // "Antoinette". Sixteen real students hung on this in production.
    const gaps = run(
      [child({ caseManager: 'Antoinette Bentley' })],
      [staff('Toni Bentley', 'speech')],
    );

    expect(gaps.groups[0]).toMatchObject({
      kind: 'awaiting-provider-claim',
      caseManager: 'Antoinette Bentley',
      accountName: 'Toni Bentley',
    });
  });

  it('ignores punctuation the district’s export drops', () => {
    const gaps = run(
      [child({ caseManager: 'Charli OMalley' })],
      [staff("Charli O'Malley", 'resource')],
    );

    expect(gaps.groups[0]).toMatchObject({
      kind: 'awaiting-provider-claim',
      accountName: "Charli O'Malley",
    });
  });

  it('prefers the provider when one name reaches two accounts', () => {
    // John Swett has both a `resource` provider and a SIS-synced `teacher`
    // account reading "Cynthia Shankle". Resolving to the teacher would strand
    // a student the provider can claim today.
    const gaps = run(
      [child({ caseManager: 'Cynthia Shankle' })],
      [staff('CYNTHIA SHANKLE', 'teacher'), staff('Cynthia Shankle', 'resource')],
    );

    expect(gaps.groups[0]).toMatchObject({
      kind: 'awaiting-provider-claim',
      accountRoleLabel: 'Resource',
    });
  });

  it('names the exactly-spelled account over a nickname match', () => {
    const gaps = run(
      [child({ caseManager: 'Antoinette Bentley' })],
      [staff('Toni Bentley', 'speech'), staff('Antoinette Bentley', 'speech')],
    );

    expect(gaps.groups[0].accountName).toBeNull();
  });
});

describe('what the view counts', () => {
  it('leaves served students out of the groups but inside the roster total', () => {
    const gaps = run(
      [
        child({ caseManager: 'Denise Domich', caseloadCount: 1 }),
        child({ caseManager: 'Denise Domich', caseloadCount: 0 }),
      ],
      [staff('Denise Domich', 'resource')],
    );

    expect(gaps.totalOnRoster).toBe(2);
    expect(gaps.totalUnserved).toBe(1);
    expect(gaps.groups[0].studentCount).toBe(1);
  });

  it('puts the stuck groups above the merely unclaimed ones', () => {
    const gaps = run(
      [
        child({ caseManager: 'Denise Domich' }),
        child({ caseManager: 'Denise Domich' }),
        child({ caseManager: 'Denise Domich' }),
        child({ caseManager: 'Megan Tucker' }),
        child({ caseManager: 'Nobody Here' }),
        child({ caseManager: null }),
      ],
      [staff('Denise Domich', 'resource'), staff('Megan Tucker', 'district_admin')],
    );

    // Ordered by how stuck, NOT by size: one student nobody can reach outranks
    // three a provider could claim this afternoon.
    expect(gaps.groups.map((g) => g.kind)).toEqual([
      'case-manager-cannot-serve',
      'case-manager-not-in-speddy',
      'awaiting-provider-claim',
      'no-case-manager',
    ]);
  });

  it('carries the school and grade an admin needs to find the student', () => {
    const gaps = run(
      [
        child({
          firstName: 'Dana',
          lastName: 'Okonjo',
          gradeLevel: '9',
          schoolId: 'sch-high',
          caseManager: 'Megan Tucker',
        }),
      ],
      [staff('Megan Tucker', 'district_admin')],
    );

    expect(gaps.groups[0].students[0]).toMatchObject({
      name: 'Dana Okonjo',
      gradeLevel: '9',
      schoolName: 'John Swett High',
    });
  });

  it('falls back to initials for a legacy child stored without a name', () => {
    const gaps = run([child({ firstName: null, lastName: null, initials: 'BW', schoolId: 'gone' })]);

    expect(gaps.groups[0].students[0]).toMatchObject({ name: null, initials: 'BW', schoolName: null });
  });

  it('counts the students it does not list rather than dropping them', () => {
    const gaps = run(
      Array.from({ length: 5 }, () => child({ caseManager: 'Megan Tucker' })),
      [staff('Megan Tucker', 'district_admin')],
      { maxPerGroup: 2 },
    );

    expect(gaps.groups[0].studentCount).toBe(5);
    expect(gaps.groups[0].students).toHaveLength(2);
    expect(gaps.groups[0].hiddenCount).toBe(3);
  });

  it('spends a district-wide listing budget on the groups that matter most', () => {
    // The day a big district first publishes, EVERY student is unserved and the
    // total is spread thinly over many case managers — so no single group is
    // large while the page would still render thousands of rows.
    const gaps = run(
      [
        ...Array.from({ length: 3 }, () => child({ caseManager: 'Megan Tucker' })),
        ...Array.from({ length: 3 }, () => child({ caseManager: 'Denise Domich' })),
      ],
      [staff('Megan Tucker', 'district_admin'), staff('Denise Domich', 'resource')],
      { maxStudentsListed: 4 },
    );

    const [stuck, waiting] = gaps.groups;
    // The stranded students are listed in full before the budget reaches the
    // ones a provider could claim today.
    expect(stuck.students).toHaveLength(3);
    expect(stuck.hiddenCount).toBe(0);
    expect(waiting.students).toHaveLength(1);
    expect(waiting.hiddenCount).toBe(2);
    // Counting is never capped, whatever the listing does.
    expect(waiting.studentCount).toBe(3);
    expect(gaps.totalUnserved).toBe(6);
  });

  it('still counts every student when the budget is spent entirely', () => {
    const gaps = run(
      [
        ...Array.from({ length: 2 }, () => child({ caseManager: 'Megan Tucker' })),
        ...Array.from({ length: 2 }, () => child({ caseManager: 'Denise Domich' })),
      ],
      [staff('Megan Tucker', 'district_admin'), staff('Denise Domich', 'resource')],
      { maxStudentsListed: 2 },
    );

    expect(gaps.groups[1].students).toHaveLength(0);
    expect(gaps.groups[1].hiddenCount).toBe(2);
    expect(gaps.groups[1].studentCount).toBe(2);
  });

  it('reports an empty district as empty, not as broken', () => {
    const gaps = run([]);

    expect(gaps).toMatchObject({ totalOnRoster: 0, totalUnserved: 0, groups: [] });
  });

  it('says nothing is stranded when every student is served', () => {
    const gaps = run([child({ caseloadCount: 2 }), child({ caseloadCount: 1 })]);

    expect(gaps.totalUnserved).toBe(0);
    expect(gaps.groups).toEqual([]);
  });
});
