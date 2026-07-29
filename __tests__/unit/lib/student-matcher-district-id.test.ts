/**
 * SPE-339: the district's Student ID takes precedence over the name/grade
 * heuristics, and an id that lands on a different child is reported rather than
 * merged.
 *
 * These are the cases where getting it wrong silently overwrites a real
 * student's record, so each one asserts WHICH student was matched, not merely
 * that something matched.
 */
import { matchStudents, type DatabaseStudent } from '@/lib/utils/student-matcher';
import type { ParsedStudent } from '@/lib/parsers/seis-parser';

function parsed(overrides: Partial<ParsedStudent> = {}): ParsedStudent {
  return {
    firstName: 'Ana',
    lastName: 'Alvarez',
    initials: 'AA',
    gradeLevel: '1',
    goals: [],
    rawRow: 2,
    ...overrides,
  };
}

function dbStudent(overrides: Partial<DatabaseStudent> = {}): DatabaseStudent {
  return {
    id: 'db-1',
    initials: 'AA',
    grade_level: '1',
    first_name: 'Ana',
    last_name: 'Alvarez',
    ...overrides,
  };
}

const only = (p: ParsedStudent, db: DatabaseStudent[]) => matchStudents([p], db).matches[0];

describe('district Student ID matching', () => {
  it('matches on the id even when the grade has changed since last import', () => {
    // Ana moved up a grade. Name+grade matching alone would call her a new
    // student and duplicate the record; the id keeps her identity.
    const match = only(
      parsed({ districtStudentId: '100001', gradeLevel: '2' }),
      [dbStudent({ id: 'ana', grade_level: '1', district_student_id: '100001' })],
    );

    expect(match.matchedStudent?.id).toBe('ana');
    expect(match.confidence).toBe('high');
    expect(match.idConflict).toBeUndefined();
  });

  it('matches on the id even when the name was recorded differently', () => {
    const match = only(
      parsed({ firstName: 'Ana', lastName: 'Alvarez-Reyes', districtStudentId: '100001' }),
      [dbStudent({ id: 'ana', first_name: 'Ana', last_name: 'Alvarez', district_student_id: '100001' })],
    );

    expect(match.matchedStudent?.id).toBe('ana');
  });

  it('prefers the id over a same-name, same-grade student carrying a different id', () => {
    // Two children share a name and grade. Only the id separates them, so this
    // is exactly the case name matching gets wrong.
    const match = only(
      parsed({ districtStudentId: '100002' }),
      [
        dbStudent({ id: 'ana-one', district_student_id: '100001' }),
        dbStudent({ id: 'ana-two', district_student_id: '100002' }),
      ],
    );

    expect(match.matchedStudent?.id).toBe('ana-two');
  });

  it('matches an unnamed roster row on its id alone', () => {
    // Roster-template rows carry no names, so before SPE-339 they could only be
    // matched by the initials+grade guess.
    const match = only(
      parsed({ firstName: '', lastName: '', districtStudentId: '100001' }),
      [dbStudent({ id: 'ana', district_student_id: '100001' })],
    );

    expect(match.matchedStudent?.id).toBe('ana');
  });

  describe('conflicts', () => {
    it('refuses to merge when the id belongs to a plainly different child', () => {
      const match = only(
        parsed({ firstName: 'Ben', lastName: 'Bishop', initials: 'BB', districtStudentId: '100001' }),
        [dbStudent({ id: 'ana', district_student_id: '100001' })],
      );

      // Reported, and NOT matched onto Ana.
      expect(match.idConflict).toEqual({
        districtStudentId: '100001',
        existingLabel: 'Ana Alvarez',
      });
      expect(match.matchedStudent).toBeNull();
    });

    it('still matches the right student by name while reporting the conflict', () => {
      // Ben's row carries Ana's id (a mistyped export). Ben must still land on
      // Ben's record — the bad id is what gets dropped, not the whole row.
      const match = only(
        parsed({ firstName: 'Ben', lastName: 'Bishop', initials: 'BB', districtStudentId: '100001' }),
        [
          dbStudent({ id: 'ana', district_student_id: '100001' }),
          dbStudent({ id: 'ben', initials: 'BB', first_name: 'Ben', last_name: 'Bishop' }),
        ],
      );

      expect(match.matchedStudent?.id).toBe('ben');
      expect(match.idConflict?.districtStudentId).toBe('100001');
    });

    it('reports rather than guesses when one id somehow spans several students', () => {
      const match = only(
        parsed({ districtStudentId: '100001' }),
        [
          dbStudent({ id: 'a', first_name: 'Zed', last_name: 'Zimmer', district_student_id: '100001' }),
          dbStudent({ id: 'b', first_name: 'Yan', last_name: 'Young', district_student_id: '100001' }),
        ],
      );

      expect(match.idConflict?.existingLabel).toBe('2 existing students');
      expect(match.matchedStudent).toBeNull();
    });
  });

  describe('normalization', () => {
    it('ignores surrounding whitespace and letter case', () => {
      const match = only(
        parsed({ districtStudentId: '  a100001 ' }),
        [dbStudent({ id: 'ana', district_student_id: 'A100001' })],
      );

      expect(match.matchedStudent?.id).toBe('ana');
    });

    it('keeps leading zeros significant — they distinguish real ids', () => {
      const match = only(
        parsed({ firstName: 'Zed', lastName: 'Zimmer', initials: 'ZZ', districtStudentId: '0012345' }),
        [dbStudent({ id: 'other', first_name: 'Yan', last_name: 'Young', initials: 'YY', district_student_id: '12345' })],
      );

      expect(match.matchedStudent).toBeNull();
      expect(match.idConflict).toBeUndefined();
    });

    it('treats a blank id as no id and falls back to name matching', () => {
      const match = only(
        parsed({ districtStudentId: '   ' }),
        [dbStudent({ id: 'ana', district_student_id: null })],
      );

      expect(match.matchedStudent?.id).toBe('ana');
      expect(match.reason).not.toMatch(/Student ID/);
    });
  });

  it('leaves existing name-based matching untouched when no ids are present', () => {
    const match = only(parsed(), [dbStudent({ id: 'ana' })]);

    expect(match.matchedStudent?.id).toBe('ana');
    expect(match.confidence).toBe('high');
    expect(match.idConflict).toBeUndefined();
  });
});
