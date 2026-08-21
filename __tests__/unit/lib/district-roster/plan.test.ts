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
  dateOfBirth: null,
  upcomingIepDate: '2027-02-09',
  upcomingTriennialDate: '2029-02-09',
  caseManager: null,
  accommodations: [],
  testingAccommodations: [],
  districtServices: null,
  districtGoals: null,
  caseloadCount: 1,
  ...over,
});

const plan = (over: Partial<RosterPlanInput> = {}) =>
  planDistrictRoster({
    districtId: 'd1',
    today: '2026-08-19',
    goalsStudents: [goalsStudent()],
    datesRecords: [datesRecord()],
    servicesStudents: [],
    accommodationsStudents: [],
    testingStudents: [],
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

    describe('vetting the single name+school candidate (CodeRabbit, PR #917)', () => {
      // The name key excludes grade for the rollover's sake, so without this a
      // grade-4 record from a file with no District ID column would fold into
      // a same-named grade-1 child and rewrite their grade, birth date and
      // district data.
      it('refuses when the grades are too far apart to be a rollover', () => {
        const result = plan({
          goalsStudents: [goalsStudent({ districtStudentId: undefined, gradeLevel: '4' })],
          datesRecords: [],
          existingChildren: [existingChild({ districtStudentId: null, gradeLevel: '1' })],
        });

        expect(result.children).toHaveLength(0);
        // Exceptions name the student and school — the admin has to act on
        // these, and initials cannot locate anyone in a large district.
        expect(result.exceptions[0]).toMatchObject({
          kind: 'identity-mismatch',
          name: 'Ana Alvarez',
          schoolName: 'Rodeo Hills Elementary',
        });
        expect(result.exceptions[0].detail).toMatch(/grade 4.*grade 1/s);
      });

      it('refuses a grade regression too — students do not move down a grade', () => {
        const result = plan({
          goalsStudents: [goalsStudent({ districtStudentId: undefined, gradeLevel: '1' })],
          datesRecords: [],
          existingChildren: [existingChild({ districtStudentId: null, gradeLevel: '2' })],
        });

        expect(result.children).toHaveLength(0);
        expect(result.exceptions[0]).toMatchObject({ kind: 'identity-mismatch' });
      });

      // The transitions the vet deliberately ACCEPTS with no birth date to
      // arbitrate — the tolerance the name key exists for. A future change to
      // the rank table would break these silently otherwise.
      it.each([
        ['the same grade — a mid-year re-import', '1', '1'],
        ['one grade ahead — the fall rollover', '1', '2'],
        ['TK to K — the rollover at the bottom of the scale', 'TK', 'K'],
      ])('accepts %s', (_label, stored, fromFile) => {
        const result = plan({
          goalsStudents: [goalsStudent({ districtStudentId: undefined, gradeLevel: fromFile })],
          datesRecords: [],
          existingChildren: [existingChild({ districtStudentId: null, gradeLevel: stored })],
        });

        expect(result.exceptions).toHaveLength(0);
        expect(result.children[0]).toMatchObject({ matchBasis: 'name-and-school' });
      });

      it('a matching birth date confirms the match whatever the grades say', () => {
        // The file may be correcting a grade Speddy holds wrong.
        const result = plan({
          goalsStudents: [goalsStudent({ districtStudentId: undefined, gradeLevel: '4' })],
          datesRecords: [],
          servicesStudents: [
            {
              firstName: 'Ana',
              lastName: 'Alvarez',
              gradeLevel: '4',
              schoolOfAttendance: 'Rodeo Hills Elementary',
              dateOfBirth: '2016-01-05',
              services: [],
            },
          ],
          existingChildren: [
            existingChild({ districtStudentId: null, gradeLevel: '1', dateOfBirth: '2016-01-05' }),
          ],
        });

        expect(result.exceptions).toHaveLength(0);
        expect(result.children[0]).toMatchObject({ action: 'update', matchBasis: 'name-and-school' });
        expect(result.children[0].changedFields).toContain('grade');
      });

      it('refuses when the birth dates contradict, even with matching grades', () => {
        // Two birth dates are two children; updating would hand one child the
        // other's services and accommodations.
        const result = plan({
          goalsStudents: [goalsStudent({ districtStudentId: undefined })],
          datesRecords: [],
          servicesStudents: [
            {
              firstName: 'Ana',
              lastName: 'Alvarez',
              gradeLevel: '1',
              schoolOfAttendance: 'Rodeo Hills Elementary',
              dateOfBirth: '2017-09-30',
              services: [],
            },
          ],
          existingChildren: [
            existingChild({ districtStudentId: null, dateOfBirth: '2016-01-05' }),
          ],
        });

        expect(result.children).toHaveLength(0);
        expect(result.exceptions[0]).toMatchObject({ kind: 'identity-mismatch' });
        expect(result.exceptions[0].detail).toMatch(/birth date/);
      });

      it('a district-id match is never second-guessed by grade distance', () => {
        // The id IS the identity; a big grade jump there is a data correction.
        const result = plan({
          goalsStudents: [goalsStudent({ gradeLevel: '5' })],
          datesRecords: [],
          existingChildren: [existingChild({ gradeLevel: '1' })],
        });

        expect(result.exceptions).toHaveLength(0);
        expect(result.children[0]).toMatchObject({
          action: 'update',
          matchBasis: 'district-student-id',
        });
      });
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

  describe('two students who share a name at one school', () => {
    const twins = [
      goalsStudent({ firstName: 'Ana', lastName: 'Alvarez', gradeLevel: '1', districtStudentId: '100001' }),
      goalsStudent({ firstName: 'Ana', lastName: 'Alvarez', gradeLevel: '4', districtStudentId: '100002' }),
    ];

    it('keeps both on the roster — merging them would drop one silently', () => {
      const result = plan({ goalsStudents: twins, datesRecords: [] });

      expect(result.counts).toMatchObject({ inFiles: 2, creates: 2 });
      expect(result.children.map((c) => c.fields.districtStudentId).sort()).toEqual([
        '100001',
        '100002',
      ]);
      expect(result.children.map((c) => c.fields.gradeLevel).sort()).toEqual(['1', '4']);
    });

    it('attaches review dates to neither, rather than guessing which one', () => {
      // The dates report carries no grade or district ID, so nothing in it can
      // tell these two apart.
      const result = plan({ goalsStudents: twins, datesRecords: [datesRecord()] });

      expect(result.counts.inFiles).toBe(2);
      expect(result.children.every((c) => c.fields.upcomingIepDate === null)).toBe(true);
      // Reported, not dropped quietly — otherwise these two look like students
      // whose district simply keeps no review dates.
      expect(result.counts.datesRowsNotUsed).toBe(1);
    });
  });

  it('reports a repeated IEP Dates row that disagrees with the first', () => {
    const result = plan({
      datesRecords: [datesRecord(), datesRecord({ upcomingIepDate: '2028-01-01' })],
    });

    // The first row wins — that report is not ordered by recency.
    expect(result.children[0].fields.upcomingIepDate).toBe('2027-02-09');
    expect(result.counts.datesRowsNotUsed).toBe(1);
  });

  it('does not report a repeated row that agrees', () => {
    const result = plan({ datesRecords: [datesRecord(), datesRecord()] });
    expect(result.counts.datesRowsNotUsed).toBe(0);
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

      // Name + school ride along: a large district's admin cannot find a
      // student from initials and a grade alone.
      expect(result.notInRoster).toEqual([
        {
          initials: 'BB',
          name: 'Ben Bishop',
          gradeLevel: '1',
          schoolName: 'Rodeo Hills Elementary',
          caseloadCount: 2,
        },
      ]);
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

// ---------------------------------------------------------------------------
// SPE-575: the Services / Accommodations / Student Download files
// ---------------------------------------------------------------------------

const serviceLine = (over: Partial<{ code: string; name: string; minutes: number; frequency: 'weekly' | 'daily' | 'monthly' | 'yearly'; weeklyMinutes: number }> = {}) => ({
  code: '415',
  name: 'Language and Speech',
  minutes: 30,
  frequency: 'weekly' as const,
  weeklyMinutes: 30,
  ...over,
});

const servicesStudent = (over: Record<string, unknown> = {}) => ({
  firstName: 'Ana',
  lastName: 'Alvarez',
  gradeLevel: '1',
  schoolOfAttendance: 'Rodeo Hills Elementary',
  dateOfBirth: '2019-05-04',
  caseManager: 'Casey Manager',
  services: [serviceLine()],
  ...over,
});

const accommodationsStudent = (over: Record<string, unknown> = {}) => ({
  firstName: 'Ana',
  lastName: 'Alvarez',
  gradeLevel: '1',
  schoolOfAttendance: 'Rodeo Hills Elementary',
  accommodations: ['Extended time', 'Modification: Shortened assignments'],
  testingAccommodations: ['Text-to-Speech (Reading Passages)'],
  ...over,
});

const testingStudent = (over: Record<string, unknown> = {}) => ({
  firstName: 'Ana',
  lastName: 'Alvarez',
  gradeLevel: '1',
  schoolOfAttendance: 'Rodeo Hills Elementary',
  testingAccommodations: ['Masking (embedded)', 'Separate Setting (non-embedded)'],
  ...over,
});

describe('planDistrictRoster — SPE-575 district data files', () => {
  it('attaches services, accommodations and testing data to the goals student', () => {
    const result = plan({
      goalsStudents: [
        goalsStudent({
          iepDate: '2026-01-22',
          goalDetails: [
            { text: 'A speech goal about sounds', areaOfNeed: 'Speech/Language', goalType: '', personResponsible: 'SLP' },
          ],
        }),
      ],
      servicesStudents: [servicesStudent()],
      accommodationsStudents: [accommodationsStudent()],
      testingStudents: [testingStudent()],
    });

    expect(result.refusal).toBeNull();
    expect(result.children).toHaveLength(1);
    const fields = result.children[0].fields;
    expect(fields.dateOfBirth).toBe('2019-05-04');
    expect(fields.districtServices).toEqual([serviceLine()]);
    expect(fields.accommodations).toEqual(['Extended time', 'Modification: Shortened assignments']);
    // The Accommodations report's assessment entries merge with the Student
    // Download's, de-duplicated.
    expect(fields.testingAccommodations).toEqual([
      'Text-to-Speech (Reading Passages)',
      'Masking (embedded)',
      'Separate Setting (non-embedded)',
    ]);
    expect(fields.districtGoals).toEqual({
      iepDate: '2026-01-22',
      goals: [
        { text: 'A speech goal about sounds', areaOfNeed: 'Speech/Language', goalType: '', personResponsible: 'SLP' },
      ],
    });
    expect(result.counts.withServices).toBe(1);
    expect(result.counts.withAccommodations).toBe(1);
    expect(result.counts.withTestingAccommodations).toBe(1);
    expect(result.counts.withGoals).toBe(1);
  });

  it('refuses to attach a record whose district ID contradicts the row it matches', () => {
    // Same name, school and grade, but a different district ID: a different
    // real student. Applying would hand this row their accommodations and
    // silently drop the ID that proves the mismatch.
    const result = plan({
      accommodationsStudents: [accommodationsStudent({ districtStudentId: '999999' })],
    });

    expect(result.counts.accommodationsStudentsNotUsed).toBe(1);
    expect(result.children[0].fields.accommodations).toBeNull();
  });

  it('refuses to attach a record whose birth date contradicts the row', () => {
    const result = plan({
      goalsStudents: [],
      datesRecords: [],
      servicesStudents: [servicesStudent()],
      testingStudents: [testingStudent({ dateOfBirth: '2015-01-01' })],
    });

    expect(result.counts.testingStudentsNotUsed).toBe(1);
    expect(result.children[0].fields.testingAccommodations).toBeNull();
  });

  it('does not duplicate a service line when two records reach one row', () => {
    // A blank-grade second record legitimately folds into the first student's
    // row; repeating the line would double the weekly minutes the claim
    // planner sums from these.
    const result = plan({
      goalsStudents: [],
      datesRecords: [],
      servicesStudents: [servicesStudent(), servicesStudent({ gradeLevel: '' })],
    });

    expect(result.children).toHaveLength(1);
    expect(result.children[0].fields.districtServices).toEqual([serviceLine()]);
  });

  it('creates a roster row for a student only the Services report mentions', () => {
    const result = plan({
      goalsStudents: [],
      datesRecords: [],
      servicesStudents: [
        servicesStudent({ firstName: 'Rex', lastName: 'Edsinger', gradeLevel: 'TK' }),
      ],
    });
    expect(result.children).toHaveLength(1);
    expect(result.children[0].action).toBe('create');
    expect(result.children[0].fields.gradeLevel).toBe('TK');
    expect(result.children[0].fields.districtServices).toEqual([serviceLine()]);
  });

  it('refuses to attach data when two roster students share the name, and counts it', () => {
    const twins = [
      goalsStudent({ districtStudentId: '100001' }),
      goalsStudent({ districtStudentId: '100002' }),
    ];
    const result = plan({
      goalsStudents: twins,
      datesRecords: [],
      servicesStudents: [servicesStudent()],
    });
    expect(result.counts.servicesStudentsNotUsed).toBe(1);
    for (const child of result.children) {
      expect(child.fields.districtServices).toBeNull();
    }
  });

  it('treats identical stored district data as unchanged, whatever the jsonb key order', () => {
    const stored = JSON.parse(
      // Key order scrambled the way jsonb re-orders it.
      '[{"weeklyMinutes":30,"name":"Language and Speech","minutes":30,"frequency":"weekly","code":"415"}]',
    );
    const result = plan({
      servicesStudents: [servicesStudent()],
      accommodationsStudents: [accommodationsStudent()],
      existingChildren: [
        existingChild({
          districtServices: stored,
          accommodations: ['Extended time', 'Modification: Shortened assignments'],
          testingAccommodations: ['Text-to-Speech (Reading Passages)'],
          dateOfBirth: '2019-05-04',
          caseManager: 'Casey Manager',
        }),
      ],
    });
    expect(result.children[0].action).toBe('unchanged');
  });

  it('merges the child\'s stored list with the district\'s, never replacing it', () => {
    // The SPE-347 mirror writes provider-accepted entries onto these child
    // columns; a wholesale replace would drop them on every re-import and then
    // re-flag the student forever as the mirror wrote them back.
    const result = plan({
      accommodationsStudents: [accommodationsStudent()],
      existingChildren: [
        existingChild({
          accommodations: ['Provider-added entry', 'Extended time'],
        }),
      ],
    });
    const child = result.children[0];
    expect(child.fields.accommodations).toEqual([
      'Provider-added entry',
      'Extended time',
      'Modification: Shortened assignments',
    ]);
    expect(child.changedFields).toContain('accommodations');

    // Once the child holds every district entry, a re-import reads unchanged.
    const again = plan({
      accommodationsStudents: [accommodationsStudent()],
      existingChildren: [
        existingChild({
          accommodations: ['Provider-added entry', 'Extended time', 'Modification: Shortened assignments'],
          testingAccommodations: ['Text-to-Speech (Reading Passages)'],
        }),
      ],
    });
    expect(again.children[0].action).toBe('unchanged');
  });

  it('never erases stored district data when the file was not uploaded', () => {
    const result = plan({
      existingChildren: [
        existingChild({
          accommodations: ['Provider-kept entry'],
          testingAccommodations: ['Masking (embedded)'],
          districtServices: [serviceLine()],
        }),
      ],
    });
    const child = result.children[0];
    expect(child.action).toBe('unchanged');
    expect(child.changedFields).toEqual([]);
    // And the fields carry null, which the writer drops from the UPDATE.
    expect(child.fields.accommodations).toBeNull();
    expect(child.fields.districtServices).toBeNull();
  });

  it('fills a missing district ID from the Accommodations report but never overwrites one', () => {
    const filled = plan({
      goalsStudents: [goalsStudent({ districtStudentId: undefined })],
      datesRecords: [],
      accommodationsStudents: [accommodationsStudent({ districtStudentId: '200002' })],
    });
    expect(filled.children[0].fields.districtStudentId).toBe('200002');

    const kept = plan({
      goalsStudents: [goalsStudent({ districtStudentId: '100001' })],
      datesRecords: [],
      accommodationsStudents: [accommodationsStudent({ districtStudentId: '999999' })],
    });
    expect(kept.children[0].fields.districtStudentId).toBe('100001');
  });
});

describe('same-name students across a supplemental-only upload (Codex review, PR #917)', () => {
  it('creates two rows for same-named students in different grades, folding neither into the other', () => {
    const result = plan({
      goalsStudents: [],
      datesRecords: [],
      testingStudents: [
        testingStudent({ gradeLevel: '1', testingAccommodations: ['Masking (embedded)'] }),
        testingStudent({ gradeLevel: '4', testingAccommodations: ['Separate Setting (non-embedded)'] }),
      ],
    });
    expect(result.children).toHaveLength(2);
    const byGrade = new Map(result.children.map((c) => [c.fields.gradeLevel, c]));
    expect(byGrade.get('1')!.fields.testingAccommodations).toEqual(['Masking (embedded)']);
    expect(byGrade.get('4')!.fields.testingAccommodations).toEqual(['Separate Setting (non-embedded)']);
  });

  it('does not attach a graded record onto a roster student whose grade contradicts it', () => {
    const result = plan({
      goalsStudents: [goalsStudent({ gradeLevel: '1' })],
      datesRecords: [],
      servicesStudents: [servicesStudent({ gradeLevel: '4' })],
    });
    // The grade-4 services student is a different child: their own row.
    expect(result.children).toHaveLength(2);
    const grade1 = result.children.find((c) => c.fields.gradeLevel === '1')!;
    expect(grade1.fields.districtServices).toBeNull();
    const grade4 = result.children.find((c) => c.fields.gradeLevel === '4')!;
    expect(grade4.fields.districtServices).toEqual([serviceLine()]);
  });
});

describe('one-grade vintage skew between files (SPE-578, the Gracelynn duplicate)', () => {
  // JSUSD's Goals export straddled a grade rollover against its Services
  // export: one real student arrived as grade 2 and grade 3 and published as
  // two children. Identity PROOF — a matching birth date or district id —
  // now spans exactly one grade of difference; without it, the PR #917 rule
  // above stands untouched.
  it('merges a services record one grade ahead when the birth date matches', () => {
    const result = plan({
      goalsStudents: [
        goalsStudent({ gradeLevel: '2', dateOfBirth: '2018-03-04', districtStudentId: undefined }),
      ],
      datesRecords: [],
      servicesStudents: [servicesStudent({ gradeLevel: '3', dateOfBirth: '2018-03-04' })],
    });
    expect(result.children).toHaveLength(1);
    const fields = result.children[0].fields;
    // The higher grade is the newer vintage — a rollover only moves up.
    expect(fields.gradeLevel).toBe('3');
    expect(fields.dateOfBirth).toBe('2018-03-04');
    expect(fields.districtServices).toEqual([serviceLine()]);
  });

  it('a stale file one grade BEHIND folds in too, and the higher grade stays', () => {
    const result = plan({
      goalsStudents: [
        goalsStudent({ gradeLevel: '3', dateOfBirth: '2018-03-04', districtStudentId: undefined }),
      ],
      datesRecords: [],
      servicesStudents: [servicesStudent({ gradeLevel: '2', dateOfBirth: '2018-03-04' })],
    });
    expect(result.children).toHaveLength(1);
    expect(result.children[0].fields.gradeLevel).toBe('3');
    expect(result.children[0].fields.districtServices).toEqual([serviceLine()]);
  });

  it('a matching district id is proof as well (the Accommodations report carries one)', () => {
    const result = plan({
      goalsStudents: [goalsStudent({ gradeLevel: '2', districtStudentId: '100001' })],
      datesRecords: [],
      accommodationsStudents: [
        accommodationsStudent({ gradeLevel: '3', districtStudentId: '100001' }),
      ],
    });
    expect(result.children).toHaveLength(1);
    expect(result.children[0].fields.gradeLevel).toBe('3');
    expect(result.children[0].fields.accommodations).toEqual([
      'Extended time',
      'Modification: Shortened assignments',
    ]);
  });

  it('without proof, adjacent grades stay two children (PR #917 unchanged)', () => {
    const result = plan({
      goalsStudents: [goalsStudent({ gradeLevel: '2', districtStudentId: undefined })],
      datesRecords: [],
      servicesStudents: [servicesStudent({ gradeLevel: '3', dateOfBirth: undefined })],
    });
    expect(result.children).toHaveLength(2);
  });

  it('a contradicting birth date keeps two children — adjacent grades or not', () => {
    const result = plan({
      goalsStudents: [
        goalsStudent({ gradeLevel: '2', dateOfBirth: '2018-03-04', districtStudentId: undefined }),
      ],
      datesRecords: [],
      servicesStudents: [servicesStudent({ gradeLevel: '3', dateOfBirth: '2017-01-01' })],
    });
    expect(result.children).toHaveLength(2);
  });

  it('proof does not span more than one grade', () => {
    // Same birth date but three grades apart is a data problem to show the
    // admin as two rows, not a merge to guess at.
    const result = plan({
      goalsStudents: [
        goalsStudent({ gradeLevel: '1', dateOfBirth: '2018-03-04', districtStudentId: undefined }),
      ],
      datesRecords: [],
      servicesStudents: [servicesStudent({ gradeLevel: '4', dateOfBirth: '2018-03-04' })],
    });
    expect(result.children).toHaveLength(2);
  });
});
