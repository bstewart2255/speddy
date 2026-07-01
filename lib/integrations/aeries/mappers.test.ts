import {
  mapTeacher,
  mapTeachers,
  mapStudent,
  isSpedProgram,
  isEvaluationProgram,
  isCurrentProgram,
  indexSpedStudents,
} from './mappers';
import type {
  RawAeriesProgram,
  RawAeriesStudent,
  RawAeriesTeacher,
} from './types';

function teacher(overrides: Partial<RawAeriesTeacher> = {}): RawAeriesTeacher {
  return {
    SchoolCode: 1,
    TeacherNumber: 605,
    DisplayName: 'Acosta',
    FirstName: 'Maria',
    LastName: 'Acosta',
    EmailAddress: 'Teacher605@example.com',
    Room: '12',
    LowGrade: 9,
    HighGrade: 12,
    InactiveStatusCode: null,
    ...overrides,
  };
}

describe('mapTeacher', () => {
  it('maps Aeries fields to the Speddy teacher shape', () => {
    expect(mapTeacher(teacher())).toEqual({
      firstName: 'Maria',
      lastName: 'Acosta',
      email: 'Teacher605@example.com',
      room: '12',
      lowGrade: 9,
      highGrade: 12,
      aeriesTeacherNumber: 605,
      schoolCode: 1,
      active: true,
    });
  });

  it('falls back to DisplayName when LastName is missing', () => {
    const mapped = mapTeacher(teacher({ LastName: undefined, DisplayName: 'Nguyen' }));
    expect(mapped.lastName).toBe('Nguyen');
  });

  it('treats whitespace-only strings as null', () => {
    const mapped = mapTeacher(teacher({ Room: '   ', EmailAddress: '' }));
    expect(mapped.room).toBeNull();
    expect(mapped.email).toBeNull();
  });

  it('marks a non-empty InactiveStatusCode as inactive', () => {
    expect(mapTeacher(teacher({ InactiveStatusCode: 'I' })).active).toBe(false);
    expect(mapTeacher(teacher({ InactiveStatusCode: '' })).active).toBe(true);
    expect(mapTeacher(teacher({ InactiveStatusCode: null })).active).toBe(true);
  });

  it('preserves non-numeric grade as null, keeps zero', () => {
    expect(mapTeacher(teacher({ LowGrade: 0 })).lowGrade).toBe(0);
    expect(mapTeacher(teacher({ LowGrade: undefined })).lowGrade).toBeNull();
  });
});

describe('mapTeachers', () => {
  it('drops inactive teachers by default and those without a name', () => {
    const result = mapTeachers([
      teacher({ TeacherNumber: 1 }),
      teacher({ TeacherNumber: 2, InactiveStatusCode: 'I' }),
      teacher({ TeacherNumber: 3, FirstName: undefined, LastName: undefined, DisplayName: undefined }),
    ]);
    expect(result.map((t) => t.aeriesTeacherNumber)).toEqual([1]);
  });

  it('includes inactive teachers when asked', () => {
    const result = mapTeachers(
      [teacher({ TeacherNumber: 1 }), teacher({ TeacherNumber: 2, InactiveStatusCode: 'I' })],
      { includeInactive: true },
    );
    expect(result).toHaveLength(2);
  });
});

describe('mapStudent', () => {
  function student(overrides: Partial<RawAeriesStudent> = {}): RawAeriesStudent {
    return {
      SchoolCode: 1,
      StudentID: 99404,
      StateStudentID: '1234567890',
      FirstName: 'Jordan',
      LastName: 'Lee',
      Grade: 4,
      InactiveStatusCode: null,
      ...overrides,
    };
  }

  it('maps fields and normalizes a numeric grade to string', () => {
    expect(mapStudent(student())).toEqual({
      firstName: 'Jordan',
      lastName: 'Lee',
      grade: '4',
      aeriesStudentId: 99404,
      stateStudentId: '1234567890',
      schoolCode: 1,
      beingEvaluated: false,
      active: true,
    });
  });

  it('carries the beingEvaluated flag through', () => {
    expect(mapStudent(student(), { beingEvaluated: true }).beingEvaluated).toBe(true);
  });
});

describe('SpEd program helpers', () => {
  const prog = (ProgramCode: string, StudentID = 1): RawAeriesProgram => ({
    StudentID,
    ProgramCode,
  });

  it('recognizes 144 and 144x as SpEd, case-insensitively', () => {
    expect(isSpedProgram(prog('144'))).toBe(true);
    expect(isSpedProgram(prog('144x'))).toBe(true);
    expect(isSpedProgram(prog('144X'))).toBe(true);
    expect(isSpedProgram(prog('101'))).toBe(false);
  });

  it('recognizes only 144x as the evaluation variant', () => {
    expect(isEvaluationProgram(prog('144x'))).toBe(true);
    expect(isEvaluationProgram(prog('144'))).toBe(false);
  });

  it('indexes SpEd students and OR-folds the evaluation flag', () => {
    const index = indexSpedStudents([
      prog('144', 1),
      prog('101', 2), // not SpEd — excluded
      prog('144x', 3),
      prog('144', 3), // same student, active record — stays beingEvaluated
    ]);
    expect(index.get(1)).toEqual({ beingEvaluated: false });
    expect(index.has(2)).toBe(false);
    expect(index.get(3)).toEqual({ beingEvaluated: true });
  });
});

describe('isCurrentProgram', () => {
  const asOf = new Date('2026-06-30T00:00:00Z');

  it('treats an open-ended program (no end dates) as current', () => {
    expect(isCurrentProgram({ StudentID: 1, ProgramCode: '144' }, asOf)).toBe(true);
  });

  it('treats a future-dated end as current', () => {
    expect(
      isCurrentProgram(
        { StudentID: 1, ProgramCode: '144', ParticipationEndDate: '2027-01-01T00:00:00' },
        asOf,
      ),
    ).toBe(true);
  });

  it('treats a past end date as ended', () => {
    expect(
      isCurrentProgram(
        { StudentID: 1, ProgramCode: '144', ParticipationEndDate: '2025-06-01T00:00:00' },
        asOf,
      ),
    ).toBe(false);
  });

  it('uses the latest of participation/eligibility end dates', () => {
    expect(
      isCurrentProgram(
        {
          StudentID: 1,
          ProgramCode: '144',
          EligibilityEndDate: '2025-01-01T00:00:00',
          ParticipationEndDate: '2027-01-01T00:00:00',
        },
        asOf,
      ),
    ).toBe(true);
  });
});

describe('indexSpedStudents — ended program filtering', () => {
  const asOf = new Date('2026-06-30T00:00:00Z');

  it('excludes students whose only SpEd record has ended', () => {
    const index = indexSpedStudents(
      [
        { StudentID: 1, ProgramCode: '144', ParticipationEndDate: '2025-06-01T00:00:00' },
        { StudentID: 2, ProgramCode: '144' }, // open-ended → current
      ],
      { asOf },
    );
    expect(index.has(1)).toBe(false);
    expect(index.has(2)).toBe(true);
  });

  it('keeps a current record even when an older one has ended', () => {
    const index = indexSpedStudents(
      [
        { StudentID: 1, ProgramCode: '144', ParticipationEndDate: '2024-06-01T00:00:00' },
        { StudentID: 1, ProgramCode: '144x' }, // current eval record
      ],
      { asOf },
    );
    expect(index.get(1)).toEqual({ beingEvaluated: true });
  });

  it('can include ended records when asked', () => {
    const index = indexSpedStudents(
      [{ StudentID: 1, ProgramCode: '144', ParticipationEndDate: '2025-06-01T00:00:00' }],
      { asOf, includeEnded: true },
    );
    expect(index.has(1)).toBe(true);
  });
});
