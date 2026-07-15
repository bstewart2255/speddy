/**
 * Golden-fixture tests for the generic (non-SEIS) CSV path of parseCSVReport
 * (SPE-239): a messy-grade-values fixture and a Windows-1252-encoded fixture.
 *
 * Pins current behavior — including bugs SPE-240 changed:
 *  - Spelled-out grades ("First", "Kindergarten"), digit grades, and the SEIS
 *    18/0 special cases all normalize now (SPE-240 removed the destructive
 *    ordinal strip and merged the CSV/XLSX normalizer copies).
 *  - Windows-1252 accented names now round-trip: parseCSVReport probes the raw
 *    bytes for valid UTF-8 and decodes as latin1 when they aren't (SPE-240
 *    added the encoding fallback), while a valid-UTF-8 file that merely
 *    contains a U+FFFD character is left as UTF-8 (no false-positive re-decode).
 *
 * The roster template is now auto-detected (SPE-225) — covered by
 * speddy-template-csv.test.ts.
 */

import { parseCSVReport } from '@/lib/parsers/csv-parser';
import { readFixture, WINDOWS_1252_CSV, UTF8_WITH_REPLACEMENT_CHAR_CSV } from './fixtures/builders';

describe('parseCSVReport — index-0 name column (SPE-252)', () => {
  it('imports a generic CSV whose First Name column is at index 0', async () => {
    // `columnMapping.firstName` is a column *index*. The old `!columnMapping.x`
    // check treated a detected index of 0 as "not found" (0 is falsy) and
    // rejected the file. Now compared with `=== undefined`, so a First Name /
    // Last Name / Grade column in the leftmost position works (SPE-252).
    const csv = Buffer.from(
      [
        'First Name,Last Name,Grade,Goal',
        'Ada,Ames,3,"The student will read 60 words per minute with 90% accuracy."',
      ].join('\r\n'),
      'utf-8',
    );
    const result = await parseCSVReport(csv, {});
    expect(result.errors).toHaveLength(0);
    expect(result.students).toHaveLength(1);
    expect(result.students[0]).toMatchObject({
      firstName: 'Ada',
      lastName: 'Ames',
      gradeLevel: '3',
      initials: 'AA',
    });
    expect(result.students[0].goals[0]).toMatch(/read 60 words/);
  });

  it('lets a real Grade column override an index-0 "grade" substring false positive', async () => {
    // "Gradebook ID" matches the loose gradePatterns and sits at index 0; the
    // real Grade column appears later. The first-detection guard keeps its
    // falsy-override form on purpose, so the real Grade must win — not the
    // gradebook id (SPE-252 review guard).
    const csv = Buffer.from(
      [
        'Gradebook ID,First Name,Last Name,Grade,Goal',
        'GB-1,Ada,Ames,3,"The student will read 60 words per minute with 90% accuracy."',
      ].join('\r\n'),
      'utf-8',
    );
    const result = await parseCSVReport(csv, {});
    expect(result.students).toHaveLength(1);
    expect(result.students[0].gradeLevel).toBe('3');
  });
});

describe('parseCSVReport — messy grade values (generic format)', () => {
  it('normalizes digit grades, the SEIS 18/0 cases, and spelled-out words (SPE-240)', async () => {
    const result = await parseCSVReport(readFixture('messy-values.csv'), {});
    const byLast = Object.fromEntries(result.students.map((s) => [s.lastName, s.gradeLevel]));

    expect(byLast['Cole']).toBe('3'); // "3rd"
    expect(byLast['Dorsey']).toBe('3'); // "03"
    expect(byLast['Ellis']).toBe('TK'); // "18" (SEIS special case)
    expect(byLast['Ford']).toBe('K'); // "0" (SEIS special case)
    // SPE-240: spelled-out grades now normalize (destructive ordinal strip removed).
    expect(byLast['Adams']).toBe('1'); // "First"
    expect(byLast['Brooks']).toBe('K'); // "Kindergarten"
  });

  it('matches the golden snapshot', async () => {
    const result = await parseCSVReport(readFixture('messy-values.csv'), {});
    expect(result).toMatchSnapshot();
  });
});

describe('parseCSVReport — Windows-1252 encoding', () => {
  it('re-decodes accented names as latin1 instead of leaving U+FFFD mojibake (SPE-240)', async () => {
    const result = await parseCSVReport(WINDOWS_1252_CSV(), {});
    expect(result.metadata.formatDetected).toBe('generic');
    expect(result.students).toHaveLength(3);

    // Names round-trip to their intended form instead of collapsing to
    // "Mu�oz" / "Pe�a" / "Ib��ez".
    const byInitials = Object.fromEntries(
      result.students.map((s) => [s.initials, `${s.firstName} ${s.lastName}`]),
    );
    expect(byInitials['SM']).toBe('Sofía Muñoz');
    expect(byInitials['JP']).toBe('José Peña');
    expect(byInitials['RI']).toBe('Renée Ibáñez');
    // No cell anywhere still carries the replacement character.
    expect(JSON.stringify(result)).not.toContain('�');

    expect(result).toMatchSnapshot();
  });

  it('keeps valid UTF-8 as UTF-8 even when a cell legitimately contains U+FFFD (no false-positive retry)', async () => {
    // The bytes are valid UTF-8, so the latin1 retry must NOT fire — otherwise
    // the correctly-encoded name would be garbled to "SofÃ­a MuÃ±oz".
    const result = await parseCSVReport(UTF8_WITH_REPLACEMENT_CHAR_CSV(), {});
    expect(result.students).toHaveLength(1);
    const student = result.students[0];
    expect(`${student.firstName} ${student.lastName}`).toBe('Sofía Muñoz');
    // The pre-existing replacement char in the goal text is preserved, not "fixed".
    expect(student.goals[0]).toContain('�');
  });
});

describe('parseCSVReport — target-student grade reconciliation (SPE-240)', () => {
  // targetStudent.gradeLevel comes from students.grade_level. For rows written
  // by the pre-SPE-240 parser that value can be a legacy string ('First', '18')
  // that must still resolve to the CSV row, which now normalizes canonically.
  it('matches a legacy "First" target grade against the row that normalizes to "1"', async () => {
    const result = await parseCSVReport(readFixture('messy-values.csv'), {
      targetStudent: { initials: 'AA', gradeLevel: 'First', schoolName: '' },
    });
    expect(result.metadata.targetStudentFound).toBe(true);
    expect(result.students).toHaveLength(1);
    expect(result.students[0].lastName).toBe('Adams');
    expect(result.students[0].gradeLevel).toBe('1');
  });

  it('matches a legacy "18" target grade against the row that normalizes to "TK"', async () => {
    const result = await parseCSVReport(readFixture('messy-values.csv'), {
      targetStudent: { initials: 'EE', gradeLevel: '18', schoolName: '' },
    });
    expect(result.metadata.targetStudentFound).toBe(true);
    expect(result.students).toHaveLength(1);
    expect(result.students[0].gradeLevel).toBe('TK');
  });
});
