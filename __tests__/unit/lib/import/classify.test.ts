/**
 * Unit tests for the extracted import classification (SPE-230).
 *
 * Covers the pure change-detection helpers (compareGoals, hasChanges) and the
 * three preview builders (main SEIS/CSV, deliveries/class-list update-only, and
 * roster template), including the behaviors most at risk during the route
 * split:
 *   - the schedule weeklyMinutes divergence between the main path (a
 *     `|| sessionsPerWeek*minutesPerSession` fallback) and the update-only path
 *     (raw delivery weeklyMinutes, which can be 0 for monthly services),
 *   - null-grade preservation in update-only rows,
 *   - goals-removed surfacing,
 *   - the roster rule that an unmatched teacher never clears an existing link.
 *
 * All data is fictional.
 */
import {
  compareGoals,
  hasChanges,
  buildStudentPreviews,
  buildUpdatePreviews,
  buildStudentsByName,
  buildRosterPreviews,
} from '@/lib/import/classify';
import type { DatabaseStudent } from '@/lib/utils/student-matcher';
import type { ParsedStudent as SeisParsedStudent } from '@/lib/parsers/seis-parser';
import type { ParsedStudent as CsvParsedStudent } from '@/lib/parsers/csv-parser';
import type { DeliveryRecord } from '@/lib/parsers/deliveries-parser';
import type { ClassListStudent } from '@/lib/parsers/class-list-parser';
import type { IepDatesRecord } from '@/lib/parsers/iep-dates-parser';
import type { DbTeacherRow, JoinedExistingStudent } from '@/lib/import/preview-types';

// ---- factories ----
const parsed = (over: Partial<SeisParsedStudent> = {}): SeisParsedStudent => ({
  firstName: 'John', lastName: 'Doe', initials: 'JD', gradeLevel: '3', goals: [], rawRow: 1, ...over,
});

const dbStudent = (over: Partial<DatabaseStudent> = {}): DatabaseStudent => ({
  id: 's1', initials: 'JD', grade_level: '3', first_name: 'John', last_name: 'Doe', ...over,
});

const delivery = (over: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  normalizedName: 'doe_john', name: 'Doe, John', seisId: '1', service: '330',
  startDate: new Date(0), endDate: new Date(0),
  sessionsFrequency: '30 min Weekly', weeklyMinutes: 30, sessionsPerWeek: 1, minutesPerSession: 30, ...over,
});

const classListStudent = (over: Partial<ClassListStudent> = {}): ClassListStudent => ({
  normalizedName: 'doe_john', name: 'Doe, John',
  teacher: { rawName: 'Barrera E', lastName: 'Barrera', firstInitial: 'E', teacherNumber: '' },
  ...over,
});

const iepDates = (over: Partial<IepDatesRecord> = {}): IepDatesRecord => ({
  normalizedName: 'doe_john', firstName: 'John', lastName: 'Doe', gradeLevel: '3',
  schoolOfAttendance: 'Maple Elementary',
  upcomingIepDate: '2026-09-01', upcomingTriennialDate: '2027-05-12', ...over,
});

const TEACHERS: DbTeacherRow[] = [{ id: 't-barrera', first_name: 'Elena', last_name: 'Barrera' }];

describe('compareGoals', () => {
  it('reports all goals added when there are no existing goals', () => {
    expect(compareGoals(undefined, ['A', 'B'])).toEqual({ added: ['A', 'B'], removed: [], unchanged: [] });
    expect(compareGoals([], ['A'])).toEqual({ added: ['A'], removed: [], unchanged: [] });
  });

  it('reports unchanged when identical', () => {
    expect(compareGoals(['A', 'B'], ['A', 'B'])).toEqual({ added: [], removed: [], unchanged: ['A', 'B'] });
  });

  it('splits added / removed / unchanged', () => {
    expect(compareGoals(['A', 'B'], ['B', 'C'])).toEqual({ added: ['C'], removed: ['A'], unchanged: ['B'] });
  });

  it('compares case- and whitespace-insensitively but preserves original text', () => {
    const r = compareGoals(['Read Fluently'], ['  read fluently  ', 'New Goal']);
    expect(r.unchanged).toEqual(['  read fluently  ']); // incoming original text kept
    expect(r.added).toEqual(['New Goal']);
    expect(r.removed).toEqual([]);
  });
});

describe('hasChanges', () => {
  it('detects goal changes', () => {
    expect(hasChanges(dbStudent({ iep_goals: ['A'] }), ['A', 'B']).hasGoalChanges).toBe(true);
    expect(hasChanges(dbStudent({ iep_goals: ['A'] }), ['A']).hasGoalChanges).toBe(false);
  });

  it('detects schedule changes only when a new schedule is supplied', () => {
    const s = dbStudent({ sessions_per_week: 2, minutes_per_session: 30 });
    expect(hasChanges(s, [], { sessionsPerWeek: 3, minutesPerSession: 30 }).hasScheduleChanges).toBe(true);
    expect(hasChanges(s, [], { sessionsPerWeek: 2, minutesPerSession: 30 }).hasScheduleChanges).toBe(false);
    expect(hasChanges(s, []).hasScheduleChanges).toBe(false); // no new schedule
  });

  it('detects teacher changes only when a new teacherId is supplied (undefined skips)', () => {
    const s = dbStudent({ teacher_id: 't1' });
    expect(hasChanges(s, [], undefined, 't2').hasTeacherChanges).toBe(true);
    expect(hasChanges(s, [], undefined, 't1').hasTeacherChanges).toBe(false);
    expect(hasChanges(s, [], undefined, undefined).hasTeacherChanges).toBe(false); // teacher not evaluated
    expect(hasChanges(s, [], undefined, null).hasTeacherChanges).toBe(true); // null clears -> change
  });
});

describe('buildStudentPreviews (main path)', () => {
  it('marks an unmatched student as insert', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ firstName: 'Zoe', lastName: 'Zulu', initials: 'ZZ', gradeLevel: '9', goals: ['G'] })],
      databaseStudents: [],
      deliveriesData: null, classListData: null, dbTeachers: [],
    });
    expect(studentPreviews).toHaveLength(1);
    expect(studentPreviews[0].action).toBe('insert');
    expect(studentPreviews[0].matchedStudentId).toBeUndefined();
    expect(studentPreviews[0].goals).toEqual([{ text: 'G' }]);
  });

  it('marks a matched student with identical goals and no enrichment as skip', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['Read fluently'] })],
      databaseStudents: [dbStudent({ iep_goals: ['Read fluently'] })],
      deliveriesData: null, classListData: null, dbTeachers: [],
    });
    expect(studentPreviews[0].action).toBe('skip');
    expect(studentPreviews[0].matchedStudentId).toBe('s1');
  });

  it('marks a matched student with changed goals as update and surfaces goalsRemoved', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['New goal'] })],
      databaseStudents: [dbStudent({ iep_goals: ['Old goal'] })],
      deliveriesData: null, classListData: null, dbTeachers: [],
    });
    const p = studentPreviews[0];
    expect(p.action).toBe('update');
    expect(p.changes?.goals).toEqual({ added: ['New goal'], removed: ['Old goal'], unchanged: [] });
    expect(p.goalsRemoved).toEqual(['Old goal']);
  });

  it('enriches an initials-only existing student with the incoming name when opted in (SPE-284)', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: [] })],
      databaseStudents: [dbStudent({ first_name: '', last_name: '' })],
      deliveriesData: null, classListData: null, dbTeachers: [],
      enrichNoNameByInitials: true,
    });
    const p = studentPreviews[0];
    expect(p.action).toBe('update');
    expect(p.matchedStudentId).toBe('s1');
    expect(p.matchConfidence).toBe('low');
    // The incoming name flows through for the confirm write + review display.
    expect(p.firstName).toBe('John');
    expect(p.lastName).toBe('Doe');
  });

  it('does NOT enrich a no-name row when enrichment is off (fail-safe default)', () => {
    // The pipeline turns enrichment off when student_details failed to load, so a
    // merely-unloaded name can't be overwritten. Default off → treat as a new insert.
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: [] })],
      databaseStudents: [dbStudent({ first_name: '', last_name: '' })],
      deliveriesData: null, classListData: null, dbTeachers: [],
    });
    const p = studentPreviews[0];
    expect(p.action).toBe('insert');
    expect(p.matchedStudentId).toBeUndefined();
  });

  it('does not fabricate a change when the existing student already has that name', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: [] })],
      databaseStudents: [dbStudent()], // already John Doe, JD, grade 3
      deliveriesData: null, classListData: null, dbTeachers: [],
    });
    const p = studentPreviews[0];
    expect(p.action).toBe('skip');
  });

  it('enriches an insert with schedule and applies the weeklyMinutes fallback for a monthly (0) delivery', () => {
    const { studentPreviews, matchedDeliveryNames } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['G'] })],
      databaseStudents: [],
      deliveriesData: new Map([['doe_john', delivery({ weeklyMinutes: 0, sessionsPerWeek: 2, minutesPerSession: 30, sessionsFrequency: '60 min Monthly' })]]),
      classListData: null, dbTeachers: [],
    });
    expect(matchedDeliveryNames.has('doe_john')).toBe(true);
    // Main path: weeklyMinutes 0 falls back to sessionsPerWeek * minutesPerSession.
    expect(studentPreviews[0].schedule).toEqual({
      sessionsPerWeek: 2, minutesPerSession: 30, weeklyMinutes: 60, frequency: '60 min Monthly',
    });
  });

  it('resolves the class-list teacher and tracks a teacher change', () => {
    const { studentPreviews, matchedClassListNames } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['G'] })],
      databaseStudents: [dbStudent({ iep_goals: ['G'], teacher_id: undefined })],
      deliveriesData: null,
      classListData: new Map([['doe_john', classListStudent()]]),
      dbTeachers: TEACHERS,
    });
    expect(matchedClassListNames.has('doe_john')).toBe(true);
    const p = studentPreviews[0];
    expect(p.teacher).toMatchObject({ teacherId: 't-barrera', teacherName: 'Elena Barrera' });
    expect(p.action).toBe('update');
    expect(p.changes?.teacher?.new).toEqual({ teacherId: 't-barrera', teacherName: 'Elena Barrera' });
  });

  // SPE-262: an unresolved class-list teacher keeps the row actionable (so it can
  // be resolved in the review's exceptions queue) but is NOT shown as a change.
  const ghost = () => classListStudent({ teacher: { rawName: 'Ghost Q', lastName: 'Ghost', firstInitial: 'Q', teacherNumber: '' } });

  it('keeps a matched student actionable for an unresolved class-list teacher, without a fabricated teacher change', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['G'] })],
      databaseStudents: [dbStudent({ iep_goals: ['G'], teacher_id: 't-existing' })],
      deliveriesData: null,
      classListData: new Map([['doe_john', ghost()]]), // 'Ghost' won't resolve against TEACHERS
      dbTeachers: TEACHERS,
    });
    const p = studentPreviews[0];
    expect(p.action).toBe('update'); // stays selectable so the user can resolve the teacher
    expect(p.changes?.teacher).toBeUndefined(); // no misleading "teacher → none"
    expect(p.teacher).toMatchObject({ teacherId: null, teacherName: 'Ghost Q' }); // surfaced for resolution
  });

  it('omits an unresolved class-list teacher from changes even alongside a real goal change', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['New goal'] })],
      databaseStudents: [dbStudent({ iep_goals: ['Old goal'], teacher_id: 't-existing' })],
      deliveriesData: null,
      classListData: new Map([['doe_john', ghost()]]),
      dbTeachers: TEACHERS,
    });
    const p = studentPreviews[0];
    expect(p.action).toBe('update');
    expect(p.changes?.goals).toBeDefined();
    expect(p.changes?.teacher).toBeUndefined();
  });

  it('skips a matched student when the resolved teacher is unchanged and goals match', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['G'] })],
      databaseStudents: [dbStudent({ iep_goals: ['G'], teacher_id: 't-barrera' })], // already Barrera
      deliveriesData: null,
      classListData: new Map([['doe_john', classListStudent()]]), // resolves to Barrera
      dbTeachers: TEACHERS,
    });
    const p = studentPreviews[0];
    expect(p.action).toBe('skip'); // resolved teacher matches existing + goals match = no change
    expect(p.changes).toBeUndefined();
  });

  it('does not force an update for a class-list match whose teacher name is blank (nothing to review)', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['G'] })],
      databaseStudents: [dbStudent({ iep_goals: ['G'], teacher_id: 't-existing' })],
      deliveriesData: null,
      classListData: new Map([['doe_john', classListStudent({ teacher: { rawName: '', lastName: '', firstInitial: '', teacherNumber: '' } })]]),
      dbTeachers: TEACHERS,
    });
    expect(studentPreviews[0].action).toBe('skip'); // no teacher name to resolve + goals match = no change
  });

  // SPE-303: the IEP Dates report fills the two compliance dates on a matched student.
  it('marks a matched student as update when an IEP date differs from what is stored (file wins)', () => {
    const { studentPreviews, matchedIepDatesNames } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['G'] })],
      databaseStudents: [dbStudent({ iep_goals: ['G'], upcoming_iep_date: '2026-01-01', upcoming_triennial_date: '2027-05-12' })],
      deliveriesData: null, classListData: null,
      iepDatesData: new Map([['doe_john', iepDates({ upcomingIepDate: '2026-09-01', upcomingTriennialDate: '2027-05-12' })]]),
      dbTeachers: [],
    });
    expect(matchedIepDatesNames.has('doe_john')).toBe(true);
    const p = studentPreviews[0];
    expect(p.action).toBe('update');
    // Only the changed date is flagged as changed; the unchanged one carries with changed=false.
    expect(p.iepDates?.upcomingIepDate).toEqual({ value: '2026-09-01', old: '2026-01-01', changed: true });
    expect(p.iepDates?.upcomingTriennialDate).toEqual({ value: '2027-05-12', old: '2027-05-12', changed: false });
  });

  it('marks a matched student as skip when the IEP dates already match what is stored', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['G'] })],
      databaseStudents: [dbStudent({ iep_goals: ['G'], upcoming_iep_date: '2026-09-01', upcoming_triennial_date: '2027-05-12' })],
      deliveriesData: null, classListData: null,
      iepDatesData: new Map([['doe_john', iepDates()]]),
      dbTeachers: [],
    });
    const p = studentPreviews[0];
    expect(p.action).toBe('skip'); // no phantom update
    expect(p.iepDates?.upcomingIepDate?.changed).toBe(false);
  });

  it('carries IEP dates onto a NEW student (insert) matched by the file, with a null old', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['G'] })],
      databaseStudents: [], // no match → insert
      deliveriesData: null, classListData: null,
      iepDatesData: new Map([['doe_john', iepDates()]]),
      dbTeachers: [],
    });
    const p = studentPreviews[0];
    expect(p.action).toBe('insert');
    expect(p.iepDates?.upcomingIepDate).toEqual({ value: '2026-09-01', old: null, changed: true });
  });

  it('treats a present-only triennial as a change without touching the (absent) IEP review date', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [parsed({ goals: ['G'] })],
      databaseStudents: [dbStudent({ iep_goals: ['G'], upcoming_iep_date: '2026-09-01', upcoming_triennial_date: null })],
      deliveriesData: null, classListData: null,
      iepDatesData: new Map([['doe_john', iepDates({ upcomingIepDate: undefined, upcomingTriennialDate: '2027-05-12' })]]),
      dbTeachers: [],
    });
    const p = studentPreviews[0];
    expect(p.action).toBe('update');
    expect(p.iepDates?.upcomingIepDate).toBeUndefined(); // file had no review date
    expect(p.iepDates?.upcomingTriennialDate).toEqual({ value: '2027-05-12', old: null, changed: true });
  });
});

describe('buildUpdatePreviews (deliveries/class-list update-only path)', () => {
  const studentsByName = () => buildStudentsByName([
    { id: 's1', initials: 'JD', grade_level: null, school_site: null, school_id: 'sch1', student_details: { first_name: 'John', last_name: 'Doe' } } as JoinedExistingStudent,
  ]);

  it('preserves a null grade on the update row', () => {
    const { studentUpdates } = buildUpdatePreviews({
      studentsByName: studentsByName(),
      deliveriesData: new Map([['doe_john', delivery()]]),
      classListData: null, dbTeachers: [],
    });
    expect(studentUpdates).toHaveLength(1);
    expect(studentUpdates[0].studentId).toBe('s1');
    expect(studentUpdates[0].gradeLevel).toBeNull();
    expect(studentUpdates[0].action).toBe('update');
  });

  it('uses the RAW delivery weeklyMinutes (no fallback) — 0 for a monthly service', () => {
    const { studentUpdates } = buildUpdatePreviews({
      studentsByName: studentsByName(),
      deliveriesData: new Map([['doe_john', delivery({ weeklyMinutes: 0, sessionsPerWeek: 2, minutesPerSession: 30, sessionsFrequency: '60 min Monthly' })]]),
      classListData: null, dbTeachers: [],
    });
    // Divergence from the main path: raw 0 is kept, not replaced by 2*30.
    expect(studentUpdates[0].schedule).toEqual({
      sessionsPerWeek: 2, minutesPerSession: 30, weeklyMinutes: 0, frequency: '60 min Monthly',
    });
  });

  it('merges deliveries + class list onto one row (dedup by studentId) and resolves the teacher', () => {
    const { studentUpdates, matchedDeliveryNames, matchedClassListNames } = buildUpdatePreviews({
      studentsByName: studentsByName(),
      deliveriesData: new Map([['doe_john', delivery()]]),
      classListData: new Map([['doe_john', classListStudent()]]),
      dbTeachers: TEACHERS,
    });
    expect(studentUpdates).toHaveLength(1);
    expect(studentUpdates[0].schedule).toBeDefined();
    expect(studentUpdates[0].teacher).toMatchObject({ teacherId: 't-barrera', teacherName: 'Elena Barrera' });
    expect(matchedDeliveryNames.has('doe_john')).toBe(true);
    expect(matchedClassListNames.has('doe_john')).toBe(true);
  });

  it('falls back to the raw class-list name when no DB teacher resolves', () => {
    const { studentUpdates } = buildUpdatePreviews({
      studentsByName: studentsByName(),
      deliveriesData: null,
      classListData: new Map([['doe_john', classListStudent({ teacher: { rawName: 'Unknown Q', lastName: 'Unknown', firstInitial: 'Q', teacherNumber: '' } })]]),
      dbTeachers: TEACHERS,
    });
    expect(studentUpdates[0].teacher).toMatchObject({ teacherId: null, teacherName: 'Unknown Q', confidence: 'none' });
  });

  it('collects enrichment rows with no existing student as unmatched', () => {
    const { studentUpdates, unmatchedStudents } = buildUpdatePreviews({
      studentsByName: studentsByName(),
      deliveriesData: new Map([['nobody_here', delivery({ normalizedName: 'nobody_here', name: 'Here, Nobody' })]]),
      classListData: null, dbTeachers: [],
    });
    expect(studentUpdates).toHaveLength(0);
    expect(unmatchedStudents).toEqual([{ name: 'Here, Nobody', source: 'deliveries' }]);
  });

  // SPE-303: dropping ONLY the IEP Dates file refreshes dates for the caseload.
  const studentsByNameWithDates = (iep: string | null, tri: string | null) =>
    buildStudentsByName([
      {
        id: 's1', initials: 'JD', grade_level: '3', school_site: null, school_id: 'sch1',
        student_details: { first_name: 'John', last_name: 'Doe', upcoming_iep_date: iep, upcoming_triennial_date: tri },
      } as unknown as JoinedExistingStudent,
    ]);

  it('updates an existing student when an IEP date differs (file wins) and carries old → new', () => {
    const { studentUpdates, matchedIepDatesNames } = buildUpdatePreviews({
      studentsByName: studentsByNameWithDates('2026-01-01', '2027-05-12'),
      deliveriesData: null, classListData: null,
      iepDatesData: new Map([['doe_john', iepDates({ upcomingIepDate: '2026-09-01', upcomingTriennialDate: '2027-05-12' })]]),
      dbTeachers: [],
    });
    expect(matchedIepDatesNames.has('doe_john')).toBe(true);
    expect(studentUpdates).toHaveLength(1);
    expect(studentUpdates[0].action).toBe('update');
    expect(studentUpdates[0].iepDates?.upcomingIepDate).toEqual({ value: '2026-09-01', old: '2026-01-01', changed: true });
  });

  it('marks an IEP-dates-only match as skip when the dates already match (no phantom update)', () => {
    const { studentUpdates } = buildUpdatePreviews({
      studentsByName: studentsByNameWithDates('2026-09-01', '2027-05-12'),
      deliveriesData: null, classListData: null,
      iepDatesData: new Map([['doe_john', iepDates()]]),
      dbTeachers: [],
    });
    expect(studentUpdates).toHaveLength(1);
    expect(studentUpdates[0].action).toBe('skip');
  });

  it('collects an IEP-dates row with no existing student as unmatched (source iepDates)', () => {
    const { studentUpdates, unmatchedStudents } = buildUpdatePreviews({
      studentsByName: studentsByNameWithDates(null, null),
      deliveriesData: null, classListData: null,
      iepDatesData: new Map([['nobody_here', iepDates({ normalizedName: 'nobody_here', firstName: 'Nobody', lastName: 'Here' })]]),
      dbTeachers: [],
    });
    expect(studentUpdates).toHaveLength(0);
    expect(unmatchedStudents).toEqual([{ name: 'Nobody Here', source: 'iepDates' }]);
  });

  it('merges IEP dates onto a delivery update row (dedup by studentId)', () => {
    const { studentUpdates } = buildUpdatePreviews({
      studentsByName: studentsByNameWithDates(null, null),
      deliveriesData: new Map([['doe_john', delivery()]]),
      classListData: null,
      iepDatesData: new Map([['doe_john', iepDates()]]),
      dbTeachers: [],
    });
    expect(studentUpdates).toHaveLength(1);
    expect(studentUpdates[0].action).toBe('update');
    expect(studentUpdates[0].schedule).toBeDefined();
    expect(studentUpdates[0].iepDates?.upcomingIepDate?.value).toBe('2026-09-01');
  });
});

describe('buildRosterPreviews (roster template path)', () => {
  const rosterStudent = (over: Partial<CsvParsedStudent> = {}): CsvParsedStudent => ({
    firstName: '', lastName: '', initials: 'JD', gradeLevel: '3', goals: [], rawRow: 1,
    teacherName: 'Smith', sessionsPerWeek: 2, minutesPerSession: 30, ...over,
  });
  const existing = (over: Record<string, unknown> = {}) => ({
    id: 's1', initials: 'JD', grade_level: '3', school_id: 'sch1',
    sessions_per_week: 2, minutes_per_session: 30, teacher_id: 't1', ...over,
  });
  const smithTeacher: DbTeacherRow[] = [{ id: 't1', first_name: 'Sam', last_name: 'Smith' }];

  it('inserts a roster row with no existing match', () => {
    const previews = buildRosterPreviews({ students: [rosterStudent()], dbStudents: [], currentSchoolId: 'sch1', dbTeachers: smithTeacher });
    expect(previews[0].action).toBe('insert');
    expect(previews[0].matchedStudentId).toBeUndefined();
    expect(previews[0].teacher?.teacherId).toBe('t1');
    expect(previews[0].schedule).toMatchObject({ sessionsPerWeek: 2, minutesPerSession: 30, weeklyMinutes: 60 });
  });

  it('skips when schedule matches and an unmatched teacher does NOT clear the existing link', () => {
    const previews = buildRosterPreviews({
      students: [rosterStudent({ teacherName: 'Ghost' })], // Ghost not in dbTeachers
      dbStudents: [existing()],
      currentSchoolId: 'sch1',
      dbTeachers: smithTeacher,
    });
    expect(previews[0].action).toBe('skip');
    expect(previews[0].changes).toBeUndefined();
    expect(previews[0].teacher).toMatchObject({ teacherId: null, teacherName: 'Ghost' });
  });

  it('updates when the schedule differs', () => {
    const previews = buildRosterPreviews({
      students: [rosterStudent({ sessionsPerWeek: 3 })],
      dbStudents: [existing({ sessions_per_week: 2 })],
      currentSchoolId: 'sch1',
      dbTeachers: smithTeacher,
    });
    expect(previews[0].action).toBe('update');
    expect(previews[0].changes?.schedule?.new).toEqual({ sessionsPerWeek: 3, minutesPerSession: 30 });
  });

  it('does not match an existing student at a different school (scoped to currentSchoolId)', () => {
    const previews = buildRosterPreviews({
      students: [rosterStudent()],
      dbStudents: [existing({ school_id: 'other-school' })],
      currentSchoolId: 'sch1',
      dbTeachers: smithTeacher,
    });
    expect(previews[0].action).toBe('insert');
    expect(previews[0].matchedStudentId).toBeUndefined();
  });
});
