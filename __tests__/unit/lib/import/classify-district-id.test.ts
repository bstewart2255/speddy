/**
 * SPE-339 follow-ups from the Codex review on PR #787.
 *
 * Three ways a captured Student ID could be parsed and then silently dropped
 * before it ever reached the database.
 */
import { buildStudentPreviews, buildUpdatePreviews, buildRosterPreviews } from '@/lib/import/classify';
import type { ParsedStudent as SeisParsedStudent } from '@/lib/parsers/seis-parser';
import type { ParsedStudent as CsvParsedStudent } from '@/lib/parsers/csv-parser';
import type { ClassListStudent, TeacherInfo } from '@/lib/parsers/class-list-parser';
import type { DatabaseStudent } from '@/lib/utils/student-matcher';

const teacher: TeacherInfo = {
  rawName: 'Barrera E', lastName: 'Barrera', firstInitial: 'E', teacherNumber: '101',
};

const seis = (o: Partial<SeisParsedStudent> = {}): SeisParsedStudent => ({
  firstName: 'Ana', lastName: 'Alvarez', initials: 'AA', gradeLevel: '1',
  goals: ['Existing goal'], rawRow: 2, ...o,
});

const db = (o: Partial<DatabaseStudent> = {}): DatabaseStudent => ({
  id: 'ana', initials: 'AA', grade_level: '1',
  first_name: 'Ana', last_name: 'Alvarez', iep_goals: ['Existing goal'], ...o,
});

const classList = (o: Partial<ClassListStudent> = {}): ClassListStudent => ({
  normalizedName: 'alvarez_ana', name: 'Alvarez, Ana', teacher, districtStudentId: null, ...o,
});

describe('district Student ID reaches the write', () => {
  it('backfills an id onto a student who is otherwise unchanged', () => {
    // Everything matches what is stored, so before this fix the row was a
    // 'skip' — and skip rows are dropped from the confirm payload, so a
    // re-import to pick up ids did nothing at all.
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [seis({ districtStudentId: '100001' })],
      databaseStudents: [db()],
      deliveriesData: null, classListData: null, dbTeachers: [],
    });

    expect(studentPreviews[0].action).toBe('update');
    expect(studentPreviews[0].districtStudentId).toBe('100001');
  });

  it('stays a skip when the stored id already matches', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [seis({ districtStudentId: '100001' })],
      databaseStudents: [db({ district_student_id: '100001' })],
      deliveriesData: null, classListData: null, dbTeachers: [],
    });

    expect(studentPreviews[0].action).toBe('skip');
  });

  it('takes the id from the class list when the goals file has none', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [seis()],
      databaseStudents: [db()],
      deliveriesData: null,
      classListData: new Map([['alvarez_ana', classList({ districtStudentId: '100001' })]]),
      dbTeachers: [],
    });

    expect(studentPreviews[0].districtStudentId).toBe('100001');
    expect(studentPreviews[0].action).toBe('update');
  });

  it('lets the goals file win over the class list', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [seis({ districtStudentId: 'FROM-GOALS' })],
      databaseStudents: [db()],
      deliveriesData: null,
      classListData: new Map([['alvarez_ana', classList({ districtStudentId: 'FROM-CLASSLIST' })]]),
      dbTeachers: [],
    });

    expect(studentPreviews[0].districtStudentId).toBe('FROM-GOALS');
  });

  it('reports rather than steals an id the class list points at another child', () => {
    const { studentPreviews } = buildStudentPreviews({
      parsedStudents: [seis()],
      databaseStudents: [db(), db({ id: 'ben', initials: 'BB', first_name: 'Ben', last_name: 'Bishop', district_student_id: '100001' })],
      deliveriesData: null,
      classListData: new Map([['alvarez_ana', classList({ districtStudentId: '100001' })]]),
      dbTeachers: [],
    });

    expect(studentPreviews[0].districtStudentId).toBeUndefined();
    expect(studentPreviews[0].districtStudentIdConflict).toEqual({
      districtStudentId: '100001',
      existingLabel: 'Ben Bishop',
    });
  });

  it('carries the id through the class-list-only update path', () => {
    const studentsByName = new Map([
      ['alvarez_ana', {
        id: 'ana', initials: 'AA', grade_level: '1', school_site: null, school_id: null,
        district_student_id: null,
        student_details: { first_name: 'Ana', last_name: 'Alvarez' },
      }],
    ]);

    const { studentUpdates } = buildUpdatePreviews({
      studentsByName: studentsByName as never,
      deliveriesData: null,
      classListData: new Map([['alvarez_ana', classList({ districtStudentId: '100001' })]]),
      dbTeachers: [],
    });

    expect(studentUpdates[0].districtStudentId).toBe('100001');
    expect(studentUpdates[0].action).toBe('update');
  });

  it('withholds an id already held by the same provider at another school', () => {
    // Uniqueness is (provider, district) — not school — so an id held at
    // another school still collides. Matching on it would edit the wrong
    // school's record; ignoring it would blow up on the unique index at confirm.
    const roster = (o: Partial<CsvParsedStudent> = {}): CsvParsedStudent => ({
      firstName: '', lastName: '', initials: 'AA', gradeLevel: '1',
      goals: [], rawRow: 2, teacherName: 'Barrera', ...o,
    });

    const previews = buildRosterPreviews({
      students: [roster({ districtStudentId: '100001' })],
      dbStudents: [{
        id: 'other-school', initials: 'ZZ', grade_level: '4', school_id: 'SCH-OTHER',
        sessions_per_week: null, minutes_per_session: null, teacher_id: null,
        district_student_id: '100001',
      }],
      currentSchoolId: 'SCH-HERE',
      dbTeachers: [],
    });

    expect(previews[0].districtStudentId).toBeUndefined();
    expect(previews[0].districtStudentIdConflict?.existingLabel).toMatch(/another school/);
    // Still an insert for THIS school — the row itself is fine, only the id is held back.
    expect(previews[0].action).toBe('insert');
  });

  it('promotes an otherwise-unchanged roster row to an update for the id alone', () => {
    const roster = (o: Partial<CsvParsedStudent> = {}): CsvParsedStudent => ({
      firstName: '', lastName: '', initials: 'AA', gradeLevel: '1',
      goals: [], rawRow: 2, teacherName: 'Barrera', ...o,
    });

    const previews = buildRosterPreviews({
      students: [roster({ districtStudentId: '100001' })],
      dbStudents: [{
        id: 'ana', initials: 'AA', grade_level: '1', school_id: null,
        sessions_per_week: null, minutes_per_session: null, teacher_id: null,
        district_student_id: null,
      }],
      currentSchoolId: null,
      dbTeachers: [],
    });

    expect(previews[0].action).toBe('update');
    expect(previews[0].districtStudentId).toBe('100001');
  });
});
