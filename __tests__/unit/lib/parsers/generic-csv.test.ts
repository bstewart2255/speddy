/**
 * Golden-fixture tests for the generic (non-SEIS) CSV path of parseCSVReport
 * (SPE-239): the roster template, a messy-grade-values fixture, and a
 * Windows-1252-encoded fixture.
 *
 * Pins current behavior — including bugs SPE-225/SPE-240 will change:
 *  - The roster template currently fails generic detection (no name columns),
 *    which is exactly what SPE-225 will fix by adding template auto-detection.
 *  - Spelled-out grades ("First", "Kindergarten"), digit grades, and the SEIS
 *    18/0 special cases all normalize now (SPE-240 removed the destructive
 *    ordinal strip and merged the CSV/XLSX normalizer copies).
 *  - Windows-1252 accented names are decoded as UTF-8 first, so this pins the
 *    current mojibake behavior (SPE-240 will add encoding detection).
 */

import { parseCSVReport } from '@/lib/parsers/csv-parser';
import { readFixture, WINDOWS_1252_CSV } from './fixtures/builders';

describe('parseCSVReport — roster template CSV (SPE-225 target)', () => {
  it('currently fails detection: no First/Last Name columns to key on', async () => {
    const result = await parseCSVReport(readFixture('roster-template.csv'), {});
    expect(result.metadata.formatDetected).toBe('generic');
    expect(result.students).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result).toMatchSnapshot();
  });
});

describe('parseCSVReport — index-0 name column bug', () => {
  it('rejects a generic CSV whose First Name column is at index 0', async () => {
    // `if (!columnMapping.firstName ...)` treats a detected index of 0 as
    // "not found" (0 is falsy), so a file with First Name in the first column
    // yields zero students. SPE-240 should switch these to `=== undefined`.
    const csv = Buffer.from(
      [
        'First Name,Last Name,Grade,Goal',
        'Ada,Ames,3,"The student will read 60 words per minute with 90% accuracy."',
      ].join('\r\n'),
      'utf-8',
    );
    const result = await parseCSVReport(csv, {});
    expect(result.students).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/could not detect/i);
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
  it('parses three rows and pins the current decoding of accented names', async () => {
    const result = await parseCSVReport(WINDOWS_1252_CSV(), {});
    expect(result.metadata.formatDetected).toBe('generic');
    expect(result.students).toHaveLength(3);
    expect(result).toMatchSnapshot();
  });
});
