import {
  buildStudentLabelMap,
  restoreStudentInitials,
} from '@/lib/lessons/student-labels';
import { promptBuilder } from '@/lib/lessons/prompts';
import type { LessonRequest } from '@/lib/lessons/schema';

describe('buildStudentLabelMap', () => {
  it('labels students positionally in request order', () => {
    const map = buildStudentLabelMap([
      { id: 'a', initials: 'JB' },
      { id: 'b', initials: 'MS' },
    ]);

    expect(map.labels).toEqual(['Student 1', 'Student 2']);
    expect(map.toInitials.get('Student 1')).toBe('JB');
    expect(map.toInitials.get('Student 2')).toBe('MS');
  });

  it('falls back to the student id when initials are missing', () => {
    const map = buildStudentLabelMap([{ id: 'student-uuid' }]);

    expect(map.labels).toEqual(['Student 1']);
    expect(map.toInitials.get('Student 1')).toBe('student-uuid');
  });

  it('keeps students with identical initials distinct', () => {
    const map = buildStudentLabelMap([
      { id: 'a', initials: 'JB' },
      { id: 'b', initials: 'JB' },
    ]);

    expect(map.labels).toEqual(['Student 1', 'Student 2']);
    expect(map.toInitials.size).toBe(2);
  });

  it('handles an empty roster', () => {
    const map = buildStudentLabelMap([]);

    expect(map.labels).toEqual([]);
    expect(map.toInitials.size).toBe(0);
  });
});

describe('restoreStudentInitials', () => {
  const map = buildStudentLabelMap([
    { id: 'a', initials: 'JB' },
    { id: 'b', initials: 'MS' },
  ]);

  const responseWithLabels = () => ({
    lesson: {
      teacherLessonPlan: {
        studentInitials: ['Student 1', 'Student 2'],
        studentProblems: [
          { studentInitials: 'Student 1', problems: [] },
          { studentInitials: 'Student 2', problems: [] },
        ],
      },
    },
  });

  it('restores the teacher lesson plan roster', () => {
    const response = responseWithLabels();
    restoreStudentInitials(response, map);

    expect(response.lesson.teacherLessonPlan.studentInitials).toEqual(['JB', 'MS']);
  });

  it('restores per-student problem sets', () => {
    const response = responseWithLabels();
    restoreStudentInitials(response, map);

    expect(
      response.lesson.teacherLessonPlan.studentProblems.map(p => p.studentInitials)
    ).toEqual(['JB', 'MS']);
  });

  it('preserves a label the map does not know', () => {
    const response = {
      lesson: {
        teacherLessonPlan: {
          studentInitials: ['Student 1', 'Student 9'],
        },
      },
    };
    restoreStudentInitials(response, map);

    expect(response.lesson.teacherLessonPlan.studentInitials).toEqual(['JB', 'Student 9']);
  });

  it('leaves worksheet content that mentions a label untouched', () => {
    const response = {
      lesson: {
        teacherLessonPlan: { studentInitials: ['Student 1'] },
      },
      worksheet: {
        sections: [
          { items: [{ type: 'short-answer', content: 'Student 1 has 5 apples. How many are left?' }] },
        ],
      },
    };
    restoreStudentInitials(response, map);

    expect(response.worksheet.sections[0].items[0].content).toBe(
      'Student 1 has 5 apples. How many are left?'
    );
  });

  it('tolerates responses missing the fields it rewrites', () => {
    expect(() => restoreStudentInitials({}, map)).not.toThrow();
    expect(() => restoreStudentInitials(null, map)).not.toThrow();
    expect(() => restoreStudentInitials({ lesson: {} }, map)).not.toThrow();
    expect(() =>
      restoreStudentInitials({ lesson: { teacherLessonPlan: { studentProblems: [null] } } }, map)
    ).not.toThrow();
  });
});

describe('lesson prompts are de-identified (SPE-61)', () => {
  // Realistic ids on purpose: a single-letter id would appear incidentally in
  // ordinary prompt prose and make the "no identifiers" assertion meaningless.
  const request: LessonRequest = {
    students: [
      {
        id: '3f7a1c92-1d4e-4a8b-9c02-5e6f7a8b9c0d',
        initials: 'JB',
        grade: 3,
        iepGoals: ['Decode CVC words'],
      },
      { id: 'b1c2d3e4-5f60-4718-8293-a4b5c6d7e8f9', initials: 'MS', grade: 4 },
    ],
    teacherRole: 'resource',
    subject: 'Reading',
    subjectType: 'ela',
    duration: 30,
  };

  it('sends positional labels instead of real initials', () => {
    const prompt = promptBuilder.buildUserPrompt(request);

    expect(prompt).toContain('Student 1');
    expect(prompt).toContain('Student 2');
  });

  // The regression guard behind the NDPA disclosure: no student identifier may
  // appear anywhere in the text handed to an AI provider.
  it('contains no student initials or ids anywhere in the prompt', () => {
    const prompt = promptBuilder.buildUserPrompt(request);

    for (const student of request.students) {
      expect(prompt).not.toContain(student.initials as string);
      expect(prompt).not.toContain(student.id);
    }
  });
});
