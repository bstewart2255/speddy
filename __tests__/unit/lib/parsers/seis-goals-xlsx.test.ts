/**
 * Golden-fixture tests for the SEIS Student Goals Report XLSX path (SPE-239),
 * i.e. parseSEISReport via ExcelJS.
 *
 * SPE-240 hardened this path; these now pin the FIXED behavior:
 *  1. Row-skip: data starts on the row after the detected header (was a fixed
 *     `rowNumber <= 5` skip), so a header on row 1 no longer drops rows 2-5,
 *     and the fix generalizes to a header lower in the scan window.
 *  2. Goal-column trap: goal detection runs on the confirmed header row only
 *     and prefers the exact "Goal" column, so the >10-char "Annual Goal #"
 *     code and "Objective N Met" columns no longer leak in as goals — exactly
 *     one goal per row.
 *
 * Still pinned as a known limitation: header detection only scans the first 5
 * rows, so ~5 metadata rows above the header push it out of range and detection
 * fails outright — a loud "could not detect" error, not a silent loss.
 */

import { parseSEISReport } from '@/lib/parsers/seis-parser';
import {
  buildSeisXlsxHeaderRow1,
  buildSeisXlsxTitleThenHeader,
  buildSeisXlsxMetadataRows,
} from './fixtures/builders';

describe('parseSEISReport — header on row 1 (row-skip fixed)', () => {
  it('imports every data row (rows 2-8), not just those past row 5', async () => {
    // psychologist has no service code, so nothing is filtered by role — every
    // fixture row must appear once the row-skip bug is fixed.
    const buffer = await buildSeisXlsxHeaderRow1();
    const result = await parseSEISReport(buffer, { providerRole: 'psychologist' });

    const lastNames = result.students.map((s) => s.lastName).sort();
    // Fixture data rows in order: Alvarez, Bishop, Cho, Diaz, Evans, Foster,
    // Gomez (rows 2-8). Previously rows 2-5 were dropped; now all import.
    expect(lastNames).toEqual(['Alvarez', 'Bishop', 'Cho', 'Diaz', 'Evans', 'Foster', 'Gomez']);
    expect(result.students).toHaveLength(7);
  });

  it('extracts exactly one goal per row (goal-column trap fixed)', async () => {
    const buffer = await buildSeisXlsxHeaderRow1();
    const result = await parseSEISReport(buffer, { providerRole: 'psychologist' });

    // Every student carries only their real Goal-column text — no "Annual
    // Goal #" codes, objectives, or progress comments leaking in as goals.
    for (const student of result.students) {
      expect(student.goals).toHaveLength(1);
      expect(student.goals[0]).toMatch(/^By /);
    }
  });

  it('matches the golden snapshot (all rows, one goal per row)', async () => {
    const buffer = await buildSeisXlsxHeaderRow1();
    const result = await parseSEISReport(buffer, { providerRole: 'psychologist' });
    expect(result).toMatchSnapshot();
  });
});

describe('parseSEISReport — title rows then header on row 3', () => {
  it('detects the header on row 3 and imports the data rows after it', async () => {
    // The row-skip fix is header-relative, not a fixed offset: with two title
    // rows above the header, data must still start on the row after row 3.
    const buffer = await buildSeisXlsxTitleThenHeader();
    const result = await parseSEISReport(buffer, { providerRole: 'psychologist' });

    const lastNames = result.students.map((s) => s.lastName).sort();
    expect(lastNames).toEqual(['Alvarez', 'Bishop', 'Cho']);
    expect(result.errors).toHaveLength(0);
  });

  it('matches the golden snapshot', async () => {
    const buffer = await buildSeisXlsxTitleThenHeader();
    const result = await parseSEISReport(buffer, { providerRole: 'psychologist' });
    expect(result).toMatchSnapshot();
  });
});

describe('parseSEISReport — ~5 metadata rows above the header', () => {
  it('fails column detection because the header is outside the 5-row scan window', async () => {
    // Distinct from the row-skip fix: the header itself is never found, so the
    // sheet fails loudly with a "could not detect" error rather than importing.
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

describe('parseSEISReport — blank-metadata goal warning (SPE-248)', () => {
  it('surfaces a blank-metadata goal row for a keyworded role (it would otherwise be filtered out)', async () => {
    // 'resource' has a service code, so keyword filtering applies. The Gomez row
    // has blank Area of Need / Annual Goal # / Person Responsible, so it has no
    // routing signal and its goal is dropped — but surfaced as a review warning
    // instead of vanishing silently (matches the CSV path).
    const buffer = await buildSeisXlsxHeaderRow1();
    const result = await parseSEISReport(buffer, { providerRole: 'resource' });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toMatch(
      /^Goal for student GG \(grade .+?\) has no Area of Need, Annual Goal #, or Person Responsible/
    );
    // The unroutable goal itself is filtered from this role's import.
    expect(result.students.some((s) => s.lastName === 'Gomez')).toBe(false);
  });

  it('emits no such warning for a role with no service code (psychologist imports everything)', async () => {
    const buffer = await buildSeisXlsxHeaderRow1();
    const result = await parseSEISReport(buffer, { providerRole: 'psychologist' });
    expect(result.warnings).toEqual([]);
  });
});
