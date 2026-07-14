/**
 * Regression test for SPE-241: SEIS Student Goals Report CSVs begin with a
 * UTF-8 BOM and a quoted first header cell. Without bom: true, csv-parse
 * throws INVALID_OPENING_QUOTE and the entire file is rejected with a 400.
 *
 * Fixture data is fictional but mirrors the real export's shape: quoted
 * cells, SEIS fixed column positions (Last Name @ 2, First Name @ 3,
 * Grade @ 5, School @ 6, IEP Date @ 9, Area of Need @ 11, Annual Goal # @ 12,
 * Goal @ 14, Person Responsible @ 17).
 */

import { parseCSVReport } from '@/lib/parsers/csv-parser';

const HEADERS = [
  'SEIS ID',
  'District ID',
  'Last Name',
  'First Name',
  'Birthdate',
  'Grade',
  'School of Attendance',
  'District of Service',
  'Case Manager',
  'IEP Date',
  'Eligibility Status',
  'Area Of Need',
  'Annual Goal #',
  'Baseline',
  'Goal',
  'Purpose(s) of Goal',
  'Standard',
  'Person Responsible',
];

function row(values: Record<number, string>): string {
  const cells = HEADERS.map((_, i) => values[i] ?? '');
  return cells.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
}

const CSV_BODY = [
  HEADERS.map(h => `"${h}"`).join(','),
  row({
    0: '1234567',
    2: 'Testerson',
    3: 'Tammy',
    5: '03',
    6: 'Example Elementary School',
    9: '05/01/2026',
    11: 'Reading',
    12: 'Academic #1: 2026 - 2027',
    14: 'By 5/1/2027, given a grade-level passage, the student will read 90 words per minute with 95% accuracy in 3 of 4 trials.',
    17: 'Resource Specialist',
  }),
  row({
    0: '7654321',
    2: 'Samplesmith',
    3: 'Sana',
    5: '18', // SEIS uses 18 for TK
    6: 'Example Elementary School',
    9: '10/15/2025',
    11: 'Math',
    12: 'Academic #2: 2025 - 2026',
    14: 'By 10/15/2026, given manipulatives, the student will solve single-digit addition problems with 80% accuracy across 3 sessions.',
    17: 'Resource Specialist and General Education Teacher',
  }),
].join('\r\n');

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const bommed = Buffer.concat([BOM, Buffer.from(CSV_BODY, 'utf-8')]);
const bomless = Buffer.from(CSV_BODY, 'utf-8');

describe('parseCSVReport — UTF-8 BOM handling (SPE-241)', () => {
  it('parses a BOM-prefixed SEIS goals CSV instead of rejecting it', async () => {
    const result = await parseCSVReport(bommed, { providerRole: 'resource' });

    expect(result.metadata.formatDetected).toBe('seis-student-goals');
    expect(result.errors).toHaveLength(0);
    expect(result.students).toHaveLength(2);

    const initials = result.students.map(s => s.initials).sort();
    expect(initials).toEqual(['SS', 'TT']);
  });

  it('produces identical results with and without the BOM', async () => {
    const withBom = await parseCSVReport(bommed, { providerRole: 'resource' });
    const withoutBom = await parseCSVReport(bomless, { providerRole: 'resource' });

    expect(withBom.students).toEqual(withoutBom.students);
    expect(withBom.metadata.formatDetected).toBe(withoutBom.metadata.formatDetected);
  });

  it('still normalizes SEIS grade values from a BOM-prefixed file', async () => {
    const result = await parseCSVReport(bommed, { providerRole: 'resource' });
    const grades = Object.fromEntries(result.students.map(s => [s.initials, s.gradeLevel]));

    expect(grades['TT']).toBe('3'); // '03' -> '3'
    expect(grades['SS']).toBe('TK'); // '18' -> 'TK'
  });
});
