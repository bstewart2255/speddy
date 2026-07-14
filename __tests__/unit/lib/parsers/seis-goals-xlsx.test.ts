/**
 * Golden-fixture tests for the SEIS Student Goals Report XLSX path (SPE-239),
 * i.e. parseSEISReport via ExcelJS.
 *
 * Pins two documented data-loss bugs that SPE-240 will address:
 *  1. Row-skip: parseSEISReport skips rowNumber <= 5, so with the header on
 *     row 1 the first four data rows (rows 2-5) are silently dropped.
 *  2. Header-window: header detection only scans rows 1-5, so ~5 metadata
 *     rows above the header push it out of range and detection fails outright.
 * Also pins the goal-column trap: every "Goal"/"Objective" header is treated
 * as a goal column, so the >10-char "Annual Goal #" code leaks in as a goal.
 */

import { parseSEISReport } from '@/lib/parsers/seis-parser';
import {
  buildSeisXlsxHeaderRow1,
  buildSeisXlsxMetadataRows,
} from './fixtures/builders';

describe('parseSEISReport — header on row 1 (row-skip data loss)', () => {
  it('silently drops the first four data rows (rows 2-5)', async () => {
    // psychologist has no service code, so nothing is filtered by role — any
    // missing student is missing solely because of the row-skip bug.
    const buffer = await buildSeisXlsxHeaderRow1();
    const result = await parseSEISReport(buffer, { providerRole: 'psychologist' });

    const lastNames = result.students.map((s) => s.lastName).sort();
    // Fixture rows in order: Alvarez, Bishop, Cho, Diaz (rows 2-5, dropped),
    // then Evans, Foster, Gomez (rows 6-8, kept).
    expect(lastNames).toEqual(['Evans', 'Foster', 'Gomez']);
    expect(result.students).toHaveLength(3);
  });

  it('matches the golden snapshot (including the goal-column trap)', async () => {
    const buffer = await buildSeisXlsxHeaderRow1();
    const result = await parseSEISReport(buffer, { providerRole: 'psychologist' });
    expect(result).toMatchSnapshot();
  });
});

describe('parseSEISReport — ~5 metadata rows above the header', () => {
  it('fails column detection because the header is outside the 5-row scan window', async () => {
    const buffer = await buildSeisXlsxMetadataRows();
    const result = await parseSEISReport(buffer, { providerRole: 'psychologist' });

    expect(result.students).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/could not detect/i);
  });

  it('matches the golden snapshot', async () => {
    const buffer = await buildSeisXlsxMetadataRows();
    const result = await parseSEISReport(buffer, { providerRole: 'psychologist' });
    expect(result).toMatchSnapshot();
  });
});
