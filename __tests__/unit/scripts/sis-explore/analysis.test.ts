/**
 * SPE-398 · the SIS exploration analysis.
 *
 * This tool exists to answer questions we cannot answer today, and its whole
 * value is that the answers are TRUE. A match-rate report that flatters us is
 * worse than no report: it would be used to decide whether the OneRoster
 * strategy works, and nobody would re-check it.
 *
 * So the cases below are weighted toward the ways a report can be wrong in the
 * reassuring direction — counting a co-served child twice, calling "we could
 * not check" a confirmation, reporting "no overlap" when there was simply no
 * data to overlap.
 */
import {
  analyzeIdSemantics,
  analyzeMatchRate,
  analyzeSpedFlags,
  analyzeTeacherLinkage,
  enrollmentsToTeacherLinks,
  type SchoolRow,
  type SisStudent,
  type SpeddyStudent,
} from '../../../../scripts/sis-explore/analysis';

const student = (o: Partial<SpeddyStudent> & { childId: string }): SpeddyStudent => ({
  studentId: `s-${o.childId}`,
  districtStudentId: null,
  schoolId: 'SCH-1',
  gradeLevel: '3',
  teacherId: null,
  ...o,
});

const sisStudent = (districtStudentId: string | null, o: Partial<SisStudent> = {}): SisStudent => ({
  sisId: `sis-${districtStudentId}`,
  districtStudentId,
  schoolId: 'SCH-1',
  gradeLevel: '3',
  ...o,
});

describe('analyzeIdSemantics — does our number mean their number?', () => {
  it('reports same-namespace when the IDs overlap', () => {
    const r = analyzeIdSemantics(
      [student({ childId: 'a', districtStudentId: '100001' })],
      [sisStudent('100001'), sisStudent('100002')],
    );
    expect(r.verdict).toBe('same-namespace');
    expect(r.overlap).toBe(1);
  });

  it('a PARTIAL overlap is still the same namespace, not a failure', () => {
    // We hold a caseload; they hold the district. Incomplete overlap is the
    // expected shape. Only ZERO overlap means different numbering — conflating
    // the two would condemn a working integration.
    const r = analyzeIdSemantics(
      [
        student({ childId: 'a', districtStudentId: '100001' }),
        student({ childId: 'b', districtStudentId: '999999' }),
      ],
      [sisStudent('100001')],
    );
    expect(r.verdict).toBe('same-namespace');
    expect(r.overlap).toBe(1);
  });

  it('reports no-overlap when the two sets are disjoint', () => {
    const r = analyzeIdSemantics(
      [student({ childId: 'a', districtStudentId: 'ABC-1' })],
      [sisStudent('100001')],
    );
    expect(r.verdict).toBe('no-overlap');
    expect(r.verdictReason).toMatch(/different numbers/i);
  });

  // The distinction that matters most in this file.
  it('reports INCONCLUSIVE, not no-overlap, when Speddy has no IDs at all', () => {
    // Zero overlap because there was nothing to overlap. Reporting that as
    // "these are different numbers" would send someone hunting a field problem
    // that does not exist — the real finding is "nobody entered any IDs".
    const r = analyzeIdSemantics([student({ childId: 'a' })], [sisStudent('100001')]);
    expect(r.verdict).toBe('inconclusive');
    expect(r.verdict).not.toBe('no-overlap');
    expect(r.verdictReason).toMatch(/nothing to compare/i);
  });

  it('reports INCONCLUSIVE when the SIS returned no identifiers', () => {
    const r = analyzeIdSemantics(
      [student({ childId: 'a', districtStudentId: '100001' })],
      [sisStudent(null), sisStudent(null)],
    );
    expect(r.verdict).toBe('inconclusive');
    expect(r.verdictReason).toMatch(/no identifiers/i);
  });

  it('summarizes the format of each side, so a shape mismatch is visible', () => {
    const r = analyzeIdSemantics(
      [student({ childId: 'a', districtStudentId: '100001' })],
      [sisStudent('SIS-000001')],
    );
    expect(r.speddyFormat).toEqual({ count: 1, allDigits: 1, lengths: { 6: 1 } });
    expect(r.sisFormat).toEqual({ count: 1, allDigits: 0, lengths: { 10: 1 } });
  });
});

describe('analyzeMatchRate', () => {
  const sis = [sisStudent('100001'), sisStudent('100002'), sisStudent('100003')];

  it('counts matched, no-ID, and ID-not-in-SIS separately', () => {
    const r = analyzeMatchRate(
      [
        student({ childId: 'a', districtStudentId: '100001' }),
        student({ childId: 'b', districtStudentId: '999999' }),
        student({ childId: 'c' }),
      ],
      sis,
    );
    expect(r.matched).toBe(1);
    expect(r.unmatchedNotInSis).toBe(1);
    expect(r.withoutId).toBe(1);
    // The two denominators answer different questions and must not be merged:
    // 33% of the caseload is enrichable today; 50% of the ones anyone bothered
    // to enter an ID for.
    expect(r.matchRateOfAll).toBe(33.3);
    expect(r.matchRateOfThoseWithId).toBe(50);
  });

  it('counts a co-served child ONCE, not once per caseload', () => {
    // Two providers, one child (SPE-347). Counting caseload rows would inflate
    // both the numerator and the total by however much co-serving happens —
    // silently, and differently at every district.
    const r = analyzeMatchRate(
      [
        student({ childId: 'shared', studentId: 's1', districtStudentId: '100001' }),
        student({ childId: 'shared', studentId: 's2', districtStudentId: '100001' }),
      ],
      sis,
    );
    expect(r.speddyStudents).toBe(2);
    expect(r.speddyChildren).toBe(1);
    expect(r.matched).toBe(1);
    expect(r.matchRateOfAll).toBe(100);
  });

  it('flags the same district ID landing on two different children', () => {
    const r = analyzeMatchRate(
      [
        student({ childId: 'a', districtStudentId: '100001' }),
        student({ childId: 'b', districtStudentId: '100001' }),
      ],
      sis,
    );
    expect(r.duplicates).toEqual([{ districtStudentId: '100001', childIds: ['a', 'b'] }]);
  });

  it('counts OUR backfill gap separately from the district missing data', () => {
    // A district ID that reached the caseload row but never the child record
    // (SPE-347's backfill). Production has rows in this state. Reporting them
    // as "no ID entered" would send someone to chase providers for data those
    // providers already gave us.
    const r = analyzeMatchRate(
      [
        student({ childId: 'a', districtStudentId: null, legacyDistrictStudentId: '100001' }),
        student({ childId: 'b', districtStudentId: null }),
      ],
      sis,
    );
    expect(r.backfillGap).toBe(1);
    expect(r.withoutId).toBe(2); // both are unmatchable today...
    // ...but only one of them is unmatchable because of something WE did.
  });

  it('does not divide by zero on an empty caseload', () => {
    const r = analyzeMatchRate([], sis);
    expect(r.matchRateOfAll).toBe(0);
    expect(r.matchRateOfThoseWithId).toBe(0);
  });
});

describe('analyzeTeacherLinkage — the multi-teacher question', () => {
  const schools: SchoolRow[] = [
    { id: 'ELEM', name: 'Willow Elementary', school_type: 'Elementary' },
    { id: 'HIGH', name: 'Cedar High', school_type: 'High School' },
  ];
  const sis = [sisStudent('100001'), sisStudent('100002')];

  it('restricts itself to matched students at secondary schools', () => {
    const r = analyzeTeacherLinkage(
      [
        student({ childId: 'a', districtStudentId: '100001', schoolId: 'HIGH', gradeLevel: '9' }),
        student({ childId: 'b', districtStudentId: '100002', schoolId: 'ELEM', gradeLevel: '2' }),
      ],
      sis,
      [],
      schools,
      new Map(),
    );
    expect(r.secondaryMatched).toBe(1);
  });

  it('falls back to grade when the school has no type recorded', () => {
    // A district whose schools table is sparse would otherwise get an empty
    // report and read it as "no secondary students".
    const r = analyzeTeacherLinkage(
      [student({ childId: 'a', districtStudentId: '100001', schoolId: 'UNKNOWN', gradeLevel: '9' })],
      sis,
      [],
      [],
      new Map(),
    );
    expect(r.secondaryMatched).toBe(1);
  });

  it('builds the teachers-per-student distribution', () => {
    const r = analyzeTeacherLinkage(
      [
        student({ childId: 'a', districtStudentId: '100001', schoolId: 'HIGH', gradeLevel: '9' }),
        student({ childId: 'b', districtStudentId: '100002', schoolId: 'HIGH', gradeLevel: '10' }),
      ],
      sis,
      [
        { districtStudentId: '100001', teacherKey: 'T1' },
        { districtStudentId: '100001', teacherKey: 'T2' },
        { districtStudentId: '100001', teacherKey: 'T2' }, // duplicate edge
        { districtStudentId: '100002', teacherKey: 'T9' },
      ],
      schools,
      new Map(),
    );
    // Duplicate edges collapse — 100001 has TWO distinct teachers, not three.
    expect(r.teachersPerStudent).toEqual({ 2: 1, 1: 1 });
    expect(r.oneTeacherModelCoverage).toBe(50);
    expect(r.multiTeacherIds).toEqual(['100001']);
  });

  it('confirms Speddy\'s teacher only when the SIS actually lists them', () => {
    const r = analyzeTeacherLinkage(
      [student({ childId: 'a', districtStudentId: '100001', schoolId: 'HIGH', teacherId: 'sp-1' })],
      sis,
      [{ districtStudentId: '100001', teacherKey: 'T1' }],
      schools,
      new Map([['sp-1', 'T1']]),
    );
    expect(r.speddyTeacherConfirmed).toBe(1);
    expect(r.speddyTeacherNotInSisSet).toBe(0);
  });

  // The reassuring-direction trap.
  it('counts an UNRESOLVABLE teacher as not-confirmed, never as confirmed', () => {
    // Speddy has a teacher, the SIS lists a teacher, but we cannot map one to
    // the other. That is "we could not check" — and reporting it as a match
    // would inflate exactly the number someone will use to decide that today's
    // single-teacher model is fine.
    const r = analyzeTeacherLinkage(
      [student({ childId: 'a', districtStudentId: '100001', schoolId: 'HIGH', teacherId: 'sp-1' })],
      sis,
      [{ districtStudentId: '100001', teacherKey: 'T1' }],
      schools,
      new Map(), // no mapping available
    );
    expect(r.speddyTeacherConfirmed).toBe(0);
    // And kept OUT of the disagreement bucket: `teachers` carries no SIS key,
    // so resolution is by email and fails often. Counting our own data gap as
    // "the district disagrees" would misdirect the fix entirely.
    expect(r.speddyTeacherUnresolvable).toBe(1);
    expect(r.speddyTeacherNotInSisSet).toBe(0);
  });

  it('separates a genuine disagreement from an unresolvable teacher', () => {
    const r = analyzeTeacherLinkage(
      [student({ childId: 'a', districtStudentId: '100001', schoolId: 'HIGH', teacherId: 'sp-1' })],
      sis,
      [{ districtStudentId: '100001', teacherKey: 'T1' }],
      schools,
      new Map([['sp-1', 'T-SOMEONE-ELSE']]), // resolved, but not this student's
    );
    expect(r.speddyTeacherNotInSisSet).toBe(1);
    expect(r.speddyTeacherUnresolvable).toBe(0);
  });

  it('separates "Speddy has no teacher" from "the SIS disagrees"', () => {
    const r = analyzeTeacherLinkage(
      [student({ childId: 'a', districtStudentId: '100001', schoolId: 'HIGH', teacherId: null })],
      sis,
      [{ districtStudentId: '100001', teacherKey: 'T1' }],
      schools,
      new Map(),
    );
    expect(r.speddyTeacherAbsent).toBe(1);
    expect(r.speddyTeacherNotInSisSet).toBe(0);
  });

  it('excludes students the SIS gave no teachers for from the coverage figure', () => {
    // Otherwise a district that shares no schedule data at all reports 0%
    // coverage, which reads as "the one-teacher model is wrong" rather than
    // "we have no evidence either way".
    const r = analyzeTeacherLinkage(
      [
        student({ childId: 'a', districtStudentId: '100001', schoolId: 'HIGH' }),
        student({ childId: 'b', districtStudentId: '100002', schoolId: 'HIGH' }),
      ],
      sis,
      [{ districtStudentId: '100001', teacherKey: 'T1' }],
      schools,
      new Map(),
    );
    expect(r.noSisTeachers).toBe(1);
    expect(r.oneTeacherModelCoverage).toBe(100); // 1 of the 1 we have data for
  });
});

describe('analyzeSpedFlags', () => {
  it('splits both directions of disagreement', () => {
    const r = analyzeSpedFlags(
      [
        student({ childId: 'a', districtStudentId: '100001' }),
        student({ childId: 'b', districtStudentId: '100002' }),
      ],
      ['100002', '100003'],
    );
    expect(r.inBoth).toBe(1);
    expect(r.speddyOnly).toBe(1);
    expect(r.sisOnly).toBe(1);
    expect(r.sisOnlyIds).toEqual(['100003']);
    expect(r.speddyOnlyIds).toEqual(['100001']);
  });
});

describe('enrollmentsToTeacherLinks — the join OneRoster does not give us', () => {
  const map = new Map([['stu-1', '100001'], ['stu-2', '100002']]);

  it('joins student and teacher through the class they share', () => {
    const links = enrollmentsToTeacherLinks(
      [
        { role: 'student', user: { sourcedId: 'stu-1' }, class: { sourcedId: 'c1' } },
        { role: 'teacher', user: { sourcedId: 'tea-1' }, class: { sourcedId: 'c1' } },
      ],
      map,
    );
    expect(links).toEqual([{ districtStudentId: '100001', teacherKey: 'tea-1' }]);
  });

  it('does NOT link a student and teacher who share no class', () => {
    const links = enrollmentsToTeacherLinks(
      [
        { role: 'student', user: { sourcedId: 'stu-1' }, class: { sourcedId: 'c1' } },
        { role: 'teacher', user: { sourcedId: 'tea-1' }, class: { sourcedId: 'c2' } },
      ],
      map,
    );
    expect(links).toEqual([]);
  });

  it('collapses a student and teacher who share SEVERAL classes into one edge', () => {
    // A district with period-by-period enrollments would otherwise report six
    // teachers where there is one — straight into the distribution SPE-334/342
    // are waiting on.
    const links = enrollmentsToTeacherLinks(
      [
        { role: 'student', user: { sourcedId: 'stu-1' }, class: { sourcedId: 'c1' } },
        { role: 'teacher', user: { sourcedId: 'tea-1' }, class: { sourcedId: 'c1' } },
        { role: 'student', user: { sourcedId: 'stu-1' }, class: { sourcedId: 'c2' } },
        { role: 'teacher', user: { sourcedId: 'tea-1' }, class: { sourcedId: 'c2' } },
      ],
      map,
    );
    expect(links).toHaveLength(1);
  });

  it('counts two DIFFERENT teachers of the same student as two edges', () => {
    const links = enrollmentsToTeacherLinks(
      [
        { role: 'student', user: { sourcedId: 'stu-1' }, class: { sourcedId: 'c1' } },
        { role: 'teacher', user: { sourcedId: 'tea-1' }, class: { sourcedId: 'c1' } },
        { role: 'student', user: { sourcedId: 'stu-1' }, class: { sourcedId: 'c2' } },
        { role: 'teacher', user: { sourcedId: 'tea-2' }, class: { sourcedId: 'c2' } },
      ],
      map,
    );
    expect(links).toHaveLength(2);
    expect(new Set(links.map((l) => l.teacherKey))).toEqual(new Set(['tea-1', 'tea-2']));
  });

  it('ignores roles that are neither student nor teacher', () => {
    // An administrator enrolled in a class counted as a teacher would inflate
    // every student's teacher count at that school.
    const links = enrollmentsToTeacherLinks(
      [
        { role: 'student', user: { sourcedId: 'stu-1' }, class: { sourcedId: 'c1' } },
        { role: 'administrator', user: { sourcedId: 'adm-1' }, class: { sourcedId: 'c1' } },
      ],
      map,
    );
    expect(links).toEqual([]);
  });

  it('drops students it cannot map to a district ID rather than guessing', () => {
    const links = enrollmentsToTeacherLinks(
      [
        { role: 'student', user: { sourcedId: 'unknown-student' }, class: { sourcedId: 'c1' } },
        { role: 'teacher', user: { sourcedId: 'tea-1' }, class: { sourcedId: 'c1' } },
      ],
      map,
    );
    expect(links).toEqual([]);
  });

  it('skips malformed enrollments without throwing', () => {
    const links = enrollmentsToTeacherLinks(
      [
        { role: 'student', user: { sourcedId: 'stu-1' } },
        { role: 'teacher', class: { sourcedId: 'c1' } },
        {},
      ],
      map,
    );
    expect(links).toEqual([]);
  });
});
