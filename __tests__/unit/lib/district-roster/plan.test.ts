/**
 * District roster planner (SPE-447 slice 1).
 *
 * Pins the matching ladder and the rules that keep a re-import from damaging
 * data: district id first, then name+school WITHOUT grade, blanks never erase,
 * ambiguity refuses rather than guesses, and nothing is ever removed.
 *
 * All names are fictional, matching the fixture convention in this suite.
 */

import {
  planDistrictRoster,
  writableRosterChangeCount,
  type DistrictSchool,
  type ExistingChild,
  type RosterDatesRecord,
  type RosterFileStudent,
  type RosterPlanInput,
} from '@/lib/district-roster/plan';

const SCHOOLS: DistrictSchool[] = [
  { id: 'sch-rodeo', name: 'Rodeo Hills Elementary' },
  { id: 'sch-high', name: 'John Swett High' },
];

const goalsStudent = (over: Partial<RosterFileStudent> = {}): RosterFileStudent => ({
  firstName: 'Ana',
  lastName: 'Alvarez',
  initials: 'AA',
  gradeLevel: '1',
  districtStudentId: '100001',
  schoolOfAttendance: 'Rodeo Hills Elementary',
  ...over,
});

const datesRecord = (over: Partial<RosterDatesRecord> = {}): RosterDatesRecord => ({
  firstName: 'Ana',
  lastName: 'Alvarez',
  gradeLevel: '1',
  schoolOfAttendance: 'Rodeo Hills Elementary',
  upcomingIepDate: '2027-02-09',
  upcomingTriennialDate: '2029-02-09',
  ...over,
});

const existingChild = (over: Partial<ExistingChild> = {}): ExistingChild => ({
  id: 'child-1',
  districtStudentId: '100001',
  firstName: 'Ana',
  lastName: 'Alvarez',
  initials: 'AA',
  gradeLevel: '1',
  schoolId: 'sch-rodeo',
  upcomingIepDate: '2027-02-09',
  upcomingTriennialDate: '2029-02-09',
  caseloadCount: 1,
  ...over,
});

const plan = (over: Partial<RosterPlanInput> = {}) =>
  planDistrictRoster({
    districtId: 'd1',
    today: '2026-08-19',
    goalsStudents: [goalsStudent()],
    datesRecords: [datesRecord()],
    schools: SCHOOLS,
    existingChildren: [],
    ...over,
  });

describe('planDistrictRoster', () => {
  it('creates a child from the two files, taking dates from the IEP Dates report', () => {
    const result = plan();

    expect(result.refusal).toBeNull();
    expect(result.counts).toMatchObject({ creates: 1, updates: 0, unchanged: 0, inFiles: 1 });
    expect(result.children[0]).toMatchObject({
      action: 'create',
      matchBasis: 'new',
      fields: {
        firstName: 'Ana',
        lastName: 'Alvarez',
        initials: 'AA',
        gradeLevel: '1',
        districtStudentId: '100001',
        schoolId: 'sch-rodeo',
        upcomingIepDate: '2027-02-09',
        upcomingTriennialDate: '2029-02-09',
      },
    });
  });

  it('refuses an empty pair of files rather than reporting a no-op success', () => {
    const result = plan({ goalsStudents: [], datesRecords: [] });

    expect(result.refusal).toMatch(/did not contain|contained any students/i);
    expect(writableRosterChangeCount(result)).toBe(0);
  });

  it('keeps a student who appears only in the IEP Dates report', () => {
    // 6 of JSUSD's 223 are new referrals with no goals written yet.
    const result = plan({
      goalsStudents: [],
      datesRecords: [datesRecord({ firstName: 'Rex', lastName: 'Edsinger', gradeLevel: '2' })],
    });

    expect(result.counts.creates).toBe(1);
    expect(result.children[0].fields).toMatchObject({
      firstName: 'Rex',
      gradeLevel: '2',
      // That report carries no District ID column, so this student cannot link.
      districtStudentId: null,
    });
    expect(result.compliance.cannotLinkToTeachers).toBe(1);
  });

  describe('identity matching', () => {
    it('matches on district student ID even when the name changed', () => {
      const result = plan({
        existingChildren: [existingChild({ lastName: 'Alvarez-Reyes' })],
      });

      expect(result.children[0]).toMatchObject({
        action: 'update',
        matchBasis: 'district-student-id',
        childId: 'child-1',
      });
      expect(result.children[0].changedFields).toContain('last name');
    });

    it('matches on name and school when the file has no district ID', () => {
      const result = plan({
        goalsStudents: [goalsStudent({ districtStudentId: undefined })],
        existingChildren: [existingChild({ districtStudentId: null })],
      });

      expect(result.children[0]).toMatchObject({ matchBasis: 'name-and-school', action: 'unchanged' });
    });

    it('still matches after a grade rollover — the fallback key excludes grade', () => {
      // Including grade would duplicate every id-less student each September.
      const result = plan({
        goalsStudents: [goalsStudent({ districtStudentId: undefined, gradeLevel: '2' })],
        datesRecords: [datesRecord({ gradeLevel: '2' })],
        existingChildren: [existingChild({ districtStudentId: null, gradeLevel: '1' })],
      });

      expect(result.counts.creates).toBe(0);
      expect(result.children[0]).toMatchObject({ action: 'update', matchBasis: 'name-and-school' });
      expect(result.children[0].changedFields).toEqual(['grade']);
    });

    it('refuses to guess when two children at one school share a name', () => {
      const result = plan({
        goalsStudents: [goalsStudent({ districtStudentId: undefined })],
        existingChildren: [
          existingChild({ id: 'child-1', districtStudentId: null }),
          existingChild({ id: 'child-2', districtStudentId: null, gradeLevel: '3' }),
        ],
      });

      expect(result.children).toHaveLength(0);
      expect(result.exceptions[0]).toMatchObject({ kind: 'ambiguous-name-match', initials: 'AA' });
    });

    it('leaves a name-matched child alone when its district ID contradicts the file', () => {
      // Overwriting would repoint the SIS teacher join onto another student.
      const result = plan({
        existingChildren: [existingChild({ districtStudentId: '999999' })],
      });

      expect(result.children).toHaveLength(0);
      expect(result.exceptions[0]).toMatchObject({ kind: 'conflicting-district-id' });
    });

    describe('children Speddy holds under initials only', () => {
      // Most children in Speddy have no name at all — a provider typed
      // initials. Neither key above can reach them, so without this rung the
      // first import duplicates every one of them.
      const nameLess = (over: Partial<ExistingChild> = {}) =>
        existingChild({ firstName: null, lastName: null, districtStudentId: null, ...over });

      it('matches one on initials + grade + school and fills in the real name', () => {
        const result = plan({ existingChildren: [nameLess()] });

        expect(result.counts.creates).toBe(0);
        expect(result.children[0]).toMatchObject({
          action: 'update',
          matchBasis: 'initials-and-school',
          childId: 'child-1',
        });
        expect(result.children[0].changedFields).toEqual(
          expect.arrayContaining(['first name', 'last name', 'district student ID']),
        );
      });

      it('refuses when two name-less children share initials and grade there', () => {
        const result = plan({
          existingChildren: [nameLess(), nameLess({ id: 'child-2' })],
        });

        expect(result.children).toHaveLength(0);
        expect(result.exceptions[0]).toMatchObject({ kind: 'ambiguous-name-match' });
        expect(result.exceptions[0].detail).toMatch(/with no name/);
      });

      it('never falls back to initials for a child that HAS a name', () => {
        // A stored name that doesn't match means a different student; matching
        // on initials anyway would merge two real children.
        const result = plan({
          existingChildren: [existingChild({ firstName: 'Amy', lastName: 'Anders', districtStudentId: null })],
        });

        expect(result.counts.creates).toBe(1);
        expect(result.children[0].matchBasis).toBe('new');
      });

      it('does not report a matched name-less child as missing from the roster', () => {
        const result = plan({ existingChildren: [nameLess()] });
        expect(result.notInRoster).toEqual([]);
      });
    });

    it('keeps the district ID spelling Speddy already stored', () => {
      // The SIS teacher join compares this value case-sensitively, so a silent
      // re-casing could break a link that works today.
      const result = plan({
        goalsStudents: [goalsStudent({ districtStudentId: 'abc-1', gradeLevel: '2' })],
        datesRecords: [],
        existingChildren: [existingChild({ districtStudentId: 'ABC-1' })],
      });

      expect(result.children[0]).toMatchObject({ action: 'update', matchBasis: 'district-student-id' });
      expect(result.children[0].changedFields).toEqual(['grade']);
      expect(result.children[0].fields.districtStudentId).toBe('ABC-1');
    });

    it('writes a NEW student\'s district ID exactly as the file spells it', () => {
      const result = plan({ goalsStudents: [goalsStudent({ districtStudentId: 'abc-1' })] });
      expect(result.children[0].fields.districtStudentId).toBe('abc-1');
    });
  });

  describe('rows the files cannot pin down', () => {
    it('refuses both students when two rows claim one district student ID', () => {
      // A mid-year transfer listed at both schools, or a mistyped ID. Creating
      // both would violate the unique index and abort the publish partway.
      const result = plan({
        goalsStudents: [
          goalsStudent({ districtStudentId: '100001' }),
          goalsStudent({ firstName: 'Ben', lastName: 'Bishop', districtStudentId: '100001' }),
        ],
        datesRecords: [],
      });

      expect(result.children).toHaveLength(0);
      expect(result.exceptions.map((e) => e.kind)).toEqual([
        'duplicate-in-files',
        'duplicate-in-files',
      ]);
    });

    it('does not list an exception student as one the files never mentioned', () => {
      const result = plan({
        existingChildren: [existingChild({ districtStudentId: '999999' })],
      });

      expect(result.exceptions[0].kind).toBe('conflicting-district-id');
      expect(result.notInRoster).toEqual([]);
    });
  });

  it('joins the two reports when they spell the school differently', () => {
    // Separate SEIS exports; one saying "John Swett High" and the other
    // "John Swett High School" must not split one student into two rows.
    const result = plan({
      goalsStudents: [
        goalsStudent({ firstName: 'Rex', lastName: 'Edsinger', gradeLevel: '9', schoolOfAttendance: 'John Swett High' }),
      ],
      datesRecords: [
        datesRecord({ firstName: 'Rex', lastName: 'Edsinger', gradeLevel: '9', schoolOfAttendance: 'John Swett High School' }),
      ],
    });

    expect(result.counts.inFiles).toBe(1);
    expect(result.exceptions).toEqual([]);
    expect(result.children[0].fields).toMatchObject({
      schoolId: 'sch-high',
      upcomingIepDate: '2027-02-09',
    });
  });

  describe('rules that protect existing data', () => {
    it('never erases a stored value with a blank from the file', () => {
      const result = plan({
        // No dates report at all: the child's stored dates must survive.
        datesRecords: [],
        existingChildren: [existingChild()],
      });

      expect(result.children[0]).toMatchObject({ action: 'unchanged', changedFields: [] });
    });

    it('reports children the roster did not mention, and removes nothing', () => {
      const result = plan({
        existingChildren: [
          existingChild(),
          existingChild({ id: 'child-2', districtStudentId: '200002', firstName: 'Ben', lastName: 'Bishop', initials: 'BB', caseloadCount: 2 }),
        ],
      });

      expect(result.notInRoster).toEqual([{ initials: 'BB', gradeLevel: '1', caseloadCount: 2 }]);
      // Nothing in the plan touches that child.
      expect(result.children.every((c) => c.childId !== 'child-2')).toBe(true);
    });

    it('counts only creates and updates as writes', () => {
      const result = plan({ existingChildren: [existingChild()] });

      expect(result.counts.unchanged).toBe(1);
      expect(writableRosterChangeCount(result)).toBe(0);
    });
  });

  describe('rows it will not write', () => {
    it('reports an out-of-district placement instead of creating a school-less child', () => {
      const result = plan({
        goalsStudents: [goalsStudent({ schoolOfAttendance: 'St. Joseph School' })],
        datesRecords: [],
      });

      expect(result.children).toHaveLength(0);
      expect(result.exceptions[0]).toMatchObject({ kind: 'unknown-school' });
      expect(result.exceptions[0].detail).toMatch(/St\. Joseph School/);
    });

    it('reports a student with no grade — the column is NOT NULL', () => {
      const result = plan({
        goalsStudents: [goalsStudent({ gradeLevel: '' })],
        datesRecords: [datesRecord({ gradeLevel: '' })],
      });

      expect(result.children).toHaveLength(0);
      expect(result.exceptions[0]).toMatchObject({ kind: 'missing-grade' });
    });
  });

  describe('compliance signals', () => {
    it('counts overdue reviews, missing dates, unlinkable and unserved students', () => {
      const result = plan({
        goalsStudents: [
          goalsStudent({ firstName: 'Ana', lastName: 'Alvarez', districtStudentId: '100001' }),
          goalsStudent({ firstName: 'Ben', lastName: 'Bishop', districtStudentId: undefined, gradeLevel: '2' }),
        ],
        datesRecords: [
          // Overdue annual, overdue triennial.
          datesRecord({ upcomingIepDate: '2026-06-01', upcomingTriennialDate: '2026-05-01' }),
          // No dates at all for Ben.
          datesRecord({ firstName: 'Ben', lastName: 'Bishop', gradeLevel: '2', upcomingIepDate: undefined, upcomingTriennialDate: undefined }),
        ],
      });

      expect(result.compliance).toEqual({
        overdueAnnualReviews: 1,
        overdueTriennials: 1,
        missingAnnualReviewDate: 1,
        // Neither exists in Speddy yet, so nobody serves either of them.
        servedByNobody: 2,
        cannotLinkToTeachers: 1,
      });
    });

    it('does not count a student as unserved when a provider already has them', () => {
      const result = plan({ existingChildren: [existingChild({ caseloadCount: 1 })] });
      expect(result.compliance.servedByNobody).toBe(0);
    });
  });

  it('resolves a school however the export spells it', () => {
    const result = plan({
      goalsStudents: [goalsStudent({ schoolOfAttendance: 'RODEO HILLS ELEMENTARY  ' })],
      datesRecords: [],
    });

    expect(result.children[0].fields.schoolId).toBe('sch-rodeo');
  });
});
