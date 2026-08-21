/**
 * SPE-467: SEIS exports grade as a numeric code and the normalizer maps only
 * the codes we have learned empirically — `18` → TK, `0` → K, and since
 * SPE-580 `17` → Preschool and `13` → Transition — plus `1`–`12`. Every other
 * code falls through `normalizeGradeLevel` verbatim and becomes the student's
 * grade. Nothing downstream catches it: there is no CHECK constraint on
 * `students.grade_level`, and the import preserves grade on purpose so the
 * confirm step cannot clobber a good value.
 *
 * Three students reached production that way, carrying grades of '17' and '13'
 * — the observation that later identified those two codes (SPE-580). An
 * unreadable grade matches no bell schedule (those are keyed TK/K/1-5), so
 * the auto-scheduler protects nothing for such a student — and grade is part
 * of student identity, so a later re-import with a corrected grade would
 * duplicate the child rather than update them.
 *
 * The fix is to say so at review time rather than to reject: a grade we cannot
 * read is still better imported than dropped. Preschool and Transition are
 * recognized-but-unscheduled (RECOGNIZED_UNSCHEDULED_GRADES): read perfectly
 * well, deliberately outside the scheduling vocabulary, and never warned
 * about — the note's "could not read" claim would be false for them.
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
  RECOGNIZED_UNSCHEDULED_GRADES,
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

  it('rejects raw SEIS codes and the recognized-but-unscheduled grades alike', () => {
    // Canonical means "the scheduling layer knows it" — raw codes don't
    // qualify, and neither do Preschool/Transition (SPE-580), which are read
    // correctly but deliberately kept out of bell schedules and dropdowns.
    expect(isCanonicalGrade('17')).toBe(false);
    expect(isCanonicalGrade('13')).toBe(false);
    for (const g of RECOGNIZED_UNSCHEDULED_GRADES) {
      expect(isCanonicalGrade(g)).toBe(false);
    }
  });

  it('rejects empty and missing values rather than treating them as a grade', () => {
    expect(isCanonicalGrade('')).toBe(false);
    expect(isCanonicalGrade(null)).toBe(false);
    expect(isCanonicalGrade(undefined)).toBe(false);
  });

  it('agrees with what normalizeGradeLevel can actually interpret', () => {
    // The codes the normalizer maps to scheduling grades come back canonical...
    expect(isCanonicalGrade(normalizeGradeLevel('18'))).toBe(true); // SEIS TK
    expect(isCanonicalGrade(normalizeGradeLevel('0'))).toBe(true);  // SEIS K
    expect(isCanonicalGrade(normalizeGradeLevel('3RD'))).toBe(true);
    expect(isCanonicalGrade(normalizeGradeLevel('First'))).toBe(true);
    // ...the SPE-580 codes normalize to their unscheduled labels...
    expect(normalizeGradeLevel('17')).toBe('Preschool');
    expect(normalizeGradeLevel('13')).toBe('Transition');
    // ...and a code the normalizer does not know stays non-canonical.
    expect(isCanonicalGrade(normalizeGradeLevel('99'))).toBe(false);
  });
});

describe('unreadableGradeNotes', () => {
  const student = (over: Partial<{ initials: string; gradeLevel: string; rawRow: number }> = {}) => ({
    initials: 'LR', gradeLevel: '99', rawRow: 2, ...over,
  });

  it('names the student and quotes the grade the file actually contained', () => {
    const [note] = unreadableGradeNotes([student()]);
    expect(note.message).toContain('"99"');
    expect(note.message).toContain('LR');
    expect(note.row).toBe(2);
  });

  it('says nothing about grades it understands, including the mapped SEIS codes', () => {
    const fine = [
      'TK', 'K', '1', '12',
      normalizeGradeLevel('18'), normalizeGradeLevel('0'),
      // Recognized-but-unscheduled (SPE-580): read correctly, never warned.
      normalizeGradeLevel('17'), normalizeGradeLevel('13'),
      'Preschool', 'Transition',
    ];
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
    const result = await parseCSVReport(buildSeisGoalsCsvFrom([row({ [GRADE]: '99' })]), {});

    expect(result.students).toHaveLength(1);
    expect(result.students[0].gradeLevel).toBe('99');
    expect(unreadableGradeNotes(result.students)).toHaveLength(1);
  });

  it('CSV: one note per student, not one per goal row', async () => {
    const result = await parseCSVReport(
      buildSeisGoalsCsvFrom([
        row({ [GRADE]: '99', [GOAL_NO]: 'Academic #1: 2026 - 2027' }),
        row({ [GRADE]: '99', [GOAL_NO]: 'Academic #2: 2026 - 2027' }),
        row({ [GRADE]: '99', [GOAL_NO]: 'Academic #3: 2026 - 2027' }),
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

  it('CSV: the preschool code becomes Preschool and earns NO note (SPE-580)', async () => {
    const result = await parseCSVReport(buildSeisGoalsCsvFrom([row({ [GRADE]: '17' })]), {});

    expect(result.students).toHaveLength(1);
    expect(result.students[0].gradeLevel).toBe('Preschool');
    expect(unreadableGradeNotes(result.students)).toEqual([]);
  });

  it('XLSX: the transition code becomes Transition and earns NO note (SPE-580)', async () => {
    const buffer = await buildSeisXlsxFrom([row({ [GRADE]: '13' })]);
    const result = await parseSEISReport(buffer, { providerRole: 'resource' });

    expect(result.students).toHaveLength(1);
    expect(result.students[0].gradeLevel).toBe('Transition');
    expect(unreadableGradeNotes(result.students)).toEqual([]);
  });

  it('XLSX: still normalizes the codes it does understand', async () => {
    const buffer = await buildSeisXlsxFrom([row({ [GRADE]: '0' })]);
    const result = await parseSEISReport(buffer, { providerRole: 'resource' });

    expect(result.students).toHaveLength(1);
    expect(result.students[0].gradeLevel).toBe('K');
    expect(unreadableGradeNotes(result.students)).toEqual([]);
  });
});
