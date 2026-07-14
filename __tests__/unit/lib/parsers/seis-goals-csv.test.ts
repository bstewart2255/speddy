/**
 * Golden-fixture tests for the SEIS Student Goals Report CSV path (SPE-239),
 * i.e. parseCSVReport with the fixed-column SEIS layout.
 *
 * Pins: BOM handling (SPE-241, already landed), the full parsed result over a
 * 59-column fictional fixture, duplicate-student goal merging, the 5-of-6
 * detection boundary at the file level (column-shifted -> generic fallback),
 * and per-role goal filtering with word-boundary keyword matching (SPE-247):
 * "Handwriting" routes to OT (not resource via "writing"), "Social/Emotional"
 * no longer leaks to OT via "emOTional", and a blank-metadata row surfaces for
 * review instead of vanishing. A "Receptive Languge" typo row (unrecognized but
 * non-blank) is still filtered — surfacing that is deferred to the review
 * screen (SPE-227).
 */

import { parseCSVReport } from '@/lib/parsers/csv-parser';
import {
  SEIS_GOALS_CSV,
  SEIS_GOALS_CSV_BOM,
  SEIS_GOALS_SHIFTED_CSV,
} from './fixtures/builders';

describe('parseCSVReport — SEIS Student Goals Report (CSV)', () => {
  it('parses the full fixture (no role filter) into the golden snapshot', async () => {
    const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), {});
    expect(result.metadata.formatDetected).toBe('seis-student-goals');
    expect(result.errors).toHaveLength(0);
    expect(result).toMatchSnapshot();
  });

  it('produces identical students with and without the UTF-8 BOM', async () => {
    const withBom = await parseCSVReport(SEIS_GOALS_CSV_BOM(), {});
    const withoutBom = await parseCSVReport(SEIS_GOALS_CSV(), {});
    expect(withBom.students).toEqual(withoutBom.students);
  });

  it('merges a duplicate student\'s second goal into the first record', async () => {
    const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), {});
    const ana = result.students.filter((s) => s.initials === 'AA' && s.lastName === 'Alvarez');
    expect(ana).toHaveLength(1);
    expect(ana[0].goals).toHaveLength(2); // reading goal + merged written-narrative goal
  });

  it('falls back to the generic parser when columns are shifted (5-of-6 miss)', async () => {
    const result = await parseCSVReport(SEIS_GOALS_SHIFTED_CSV(), {});
    expect(result.metadata.formatDetected).toBe('generic');
    expect(result).toMatchSnapshot();
  });

  describe('per-role goal filtering', () => {
    // Real-file reference counts (kept/total goals): resource 119/184, speech
    // 58, OT 12, counseling 9. This fictional fixture is far smaller; the
    // snapshot locks its own current counts.
    const roles = ['resource', 'speech', 'ot', 'counseling', 'psychologist'];

    it('snapshots kept-student and filtered-goal counts per role', async () => {
      const counts: Record<string, { students: number; goalsFiltered: number | undefined }> = {};
      for (const role of roles) {
        const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: role });
        counts[role] = {
          students: result.students.length,
          goalsFiltered: result.metadata.goalsFiltered,
        };
      }
      expect(counts).toMatchSnapshot();
    });

    it('routes the "Handwriting" student to OT (SPE-247)', async () => {
      // Foster's Area of Need is "Handwriting". With word-boundary matching it no
      // longer cross-contaminates the resource "writing" keyword; "handwriting"
      // is now an OT keyword, and Person Responsible is an OT too.
      const ot = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'ot' });
      expect(ot.students.some((s) => s.lastName === 'Foster')).toBe(true);
    });

    it('still keeps the Foster row for resource via its "Academic #3" goal, not the area', async () => {
      // The Handwriting area no longer matches resource, but the Annual Goal #
      // "Academic #3" legitimately does — so Foster still imports for resource.
      const resource = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'resource' });
      expect(resource.students.some((s) => s.lastName === 'Foster')).toBe(true);
    });

    it('still filters the "Receptive Languge" typo row for speech (deferred to SPE-227)', async () => {
      // Unrecognized-but-nonblank metadata is not surfaced yet; only truly blank
      // rows are. This pins that the typo row stays filtered for now.
      const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'speech' });
      expect(result.students.some((s) => s.lastName === 'Hunt')).toBe(false);
    });

    it('surfaces the blank Area-of-Need / Annual-Goal# row for review instead of dropping it (SPE-247)', async () => {
      const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'resource' });
      expect(result.students.some((s) => s.lastName === 'Gomez')).toBe(true);
    });

    it('no longer matches the Social/Emotional student to OT (word boundary fixes "emOTional")', async () => {
      // Diaz is a counseling student; the old 2-letter "ot" substring wrongly
      // pulled "emOTional" into OT. Word boundaries fix it.
      const ot = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'ot' });
      expect(ot.students.some((s) => s.lastName === 'Diaz')).toBe(false);
      const counseling = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'counseling' });
      expect(counseling.students.some((s) => s.lastName === 'Diaz')).toBe(true);
    });
  });
});
