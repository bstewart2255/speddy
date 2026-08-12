/**
 * SPE-467: SEIS exports grade as a numeric code and the normalizer maps only
 * the two we learned empirically — `18` → TK and `0` → K — plus `1`–`12`.
 * Every other code falls through `normalizeGradeLevel` verbatim and becomes the
 * student's grade. Nothing downstream catches it: there is no CHECK constraint
 * on `students.grade_level`, and the import preserves grade on purpose so the
 * confirm step cannot clobber a good value.
 *
 * Three students reached production that way, carrying grades of '17' and '13'.
 * They match no bell schedule (those are keyed TK/K/1-5), so the auto-scheduler
 * protects nothing for them — and grade is part of student identity, so a later
 * re-import with a corrected grade would duplicate the child rather than update
 * them.
 *
 * The fix is to say so at review time rather than to reject: a grade we cannot
 * read is still better imported than dropped.
 *
 * The notes are DERIVED from the students being shown, not emitted while
 * parsing. The note claims the grade "was imported as-is", so it must only
 * describe a student that really is being imported — and the parser cannot know
 * that, because school scoping drops students after it runs. These tests pin
 * both halves: which students earn a note, and that the parsers leave the raw
 * value on the student for the note to quote.
 */

import { parseCSVReport } from '@/lib/parsers/csv-parser';
import { parseSEISReport } from '@/lib/parsers/seis-parser';
import {
  isCanonicalGrade,
  normalizeGradeLevel,
  unreadableGradeNotes,
  CANONICAL_GRADES,
} from '@/lib/utils/grade-parser';
import { buildSeisGoalsCsvFrom, buildSeisXlsxFrom } from './fixtures/builders';

// SEIS column indices, per SEIS_HEADERS in the fixture builder.
const LAST = 2, FIRST = 3, GRADE = 5, SCHOOL = 6, AREA = 11, GOAL_NO = 12, GOAL = 14, PERSON = 17;

function row(over: Record<number, string>): Record<number, string> {
  return {
    [LAST]: 'Reyes', [FIRST]: 'Luis', [GRADE]: '03', [SCHOOL]: 'Rodeo Hills Elementary',
    [AREA]: 'Reading', [GOAL_NO]: 'Academic #1: 2026 - 2027',
    [GOAL]: 'By 5/1/2027, Luis will read 90 words per minute with 95% accuracy in 3 of 4 trials.',
    [PERSON]: 'Resource Specialist',
    ...over,
  };
}

describe('isCanonicalGrade', () => {
  it('accepts every grade the app actually uses', () => {
    for (const g of CANONICAL_GRADES) expect(isCanonicalGrade(g)).toBe(true);
  });

  it('rejects the unmapped SEIS codes that reached production', () => {
    expect(isCanonicalGrade('17')).toBe(false);
    expect(isCanonicalGrade('13')).toBe(false);
  });

  it('rejects empty and missing values rather than treating them as a grade', () => {
    expect(isCanonicalGrade('')).toBe(false);
    expect(isCanonicalGrade(null)).toBe(false);
    expect(isCanonicalGrade(undefined)).toBe(false);
  });

  it('agrees with what normalizeGradeLevel can actually interpret', () => {
    // The codes the normalizer maps come back canonical...
    expect(isCanonicalGrade(normalizeGradeLevel('18'))).toBe(true); // SEIS TK
    expect(isCanonicalGrade(normalizeGradeLevel('0'))).toBe(true);  // SEIS K
    expect(isCanonicalGrade(normalizeGradeLevel('3RD'))).toBe(true);
    expect(isCanonicalGrade(normalizeGradeLevel('First'))).toBe(true);
    // ...and the ones it does not, do not.
    expect(isCanonicalGrade(normalizeGradeLevel('17'))).toBe(false);
  });
});

describe('unreadableGradeNotes', () => {
  const student = (over: Partial<{ initials: string; gradeLevel: string; rawRow: number }> = {}) => ({
    initials: 'LR', gradeLevel: '17', rawRow: 2, ...over,
  });

  it('names the student and quotes the grade the file actually contained', () => {
    const [note] = unreadableGradeNotes([student()]);
    expect(note.message).toContain('"17"');
    expect(note.message).toContain('LR');
    expect(note.row).toBe(2);
  });

  it('says nothing about grades it understands, including the mapped SEIS codes', () => {
    const fine = ['TK', 'K', '1', '12', normalizeGradeLevel('18'), normalizeGradeLevel('0')];
    expect(unreadableGradeNotes(fine.map((g, i) => student({ gradeLevel: g, rawRow: i })))).toEqual([]);
  });

  // Keying on initials would collapse these two, and the second child would
  // never be surfaced.
  it('notes both of two different children who share initials and a bad grade', () => {
    const notes = unreadableGradeNotes([
      student({ initials: 'LR', rawRow: 2 }),
      student({ initials: 'LR', rawRow: 3 }),
    ]);
    expect(notes).toHaveLength(2);
  });

  // The whole point of deriving these: hand it the students that survived, and
  // a dropped student cannot produce a note claiming it was imported.
  it('describes only the students it is given', () => {
    const all = [student({ initials: 'LR', rawRow: 2 }), student({ initials: 'NK', rawRow: 3 })];
    const survivors = all.slice(0, 1);

    expect(unreadableGradeNotes(all)).toHaveLength(2);
    expect(unreadableGradeNotes(survivors)).toHaveLength(1);
    expect(unreadableGradeNotes(survivors)[0].message).toContain('LR');
  });
});

describe('parsers leave the raw grade on the student for the note to quote', () => {
  it('CSV: preserves an unreadable grade rather than coercing it', async () => {
    const result = await parseCSVReport(buildSeisGoalsCsvFrom([row({ [GRADE]: '17' })]), {});

    expect(result.students).toHaveLength(1);
    expect(result.students[0].gradeLevel).toBe('17');
    expect(unreadableGradeNotes(result.students)).toHaveLength(1);
  });

  it('CSV: one note per student, not one per goal row', async () => {
    const result = await parseCSVReport(
      buildSeisGoalsCsvFrom([
        row({ [GRADE]: '17', [GOAL_NO]: 'Academic #1: 2026 - 2027' }),
        row({ [GRADE]: '17', [GOAL_NO]: 'Academic #2: 2026 - 2027' }),
        row({ [GRADE]: '17', [GOAL_NO]: 'Academic #3: 2026 - 2027' }),
      ]),
      {},
    );

    expect(result.students).toHaveLength(1); // goals merged onto one student
    expect(unreadableGradeNotes(result.students)).toHaveLength(1);
  });

  it('CSV: still normalizes the codes it does understand', async () => {
    const result = await parseCSVReport(buildSeisGoalsCsvFrom([row({ [GRADE]: '18' })]), {});

    expect(result.students).toHaveLength(1);
    expect(result.students[0].gradeLevel).toBe('TK');
    expect(unreadableGradeNotes(result.students)).toEqual([]);
  });

  it('XLSX: preserves an unreadable grade rather than coercing it', async () => {
    const buffer = await buildSeisXlsxFrom([row({ [GRADE]: '13' })]);
    const result = await parseSEISReport(buffer, { providerRole: 'resource' });

    expect(result.students).toHaveLength(1);
    expect(result.students[0].gradeLevel).toBe('13');

    const notes = unreadableGradeNotes(result.students);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain('"13"');
  });

  it('XLSX: still normalizes the codes it does understand', async () => {
    const buffer = await buildSeisXlsxFrom([row({ [GRADE]: '0' })]);
    const result = await parseSEISReport(buffer, { providerRole: 'resource' });

    expect(result.students).toHaveLength(1);
    expect(result.students[0].gradeLevel).toBe('K');
    expect(unreadableGradeNotes(result.students)).toEqual([]);
  });
});
