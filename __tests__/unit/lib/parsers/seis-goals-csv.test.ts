/**
 * Golden-fixture tests for the SEIS Student Goals Report CSV path (SPE-239),
 * i.e. parseCSVReport with the fixed-column SEIS layout.
 *
 * Pins: BOM handling (SPE-241, already landed), the full parsed result over a
 * 59-column fictional fixture, duplicate-student goal merging, the 5-of-6
 * detection boundary at the file level (column-shifted -> generic fallback),
 * and per-role goal filtering including word-boundary routing
 * ("Handwriting" -> OT not resource, "Social/Emotional" -> counseling not OT),
 * blank-metadata rows surfaced for review, and typo losses
 * ("Receptive Languge" -> not speech). See SPE-247.
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

    it('routes the "Handwriting" goal to OT, not resource (word-boundary + OT keyword)', async () => {
      // Pre-fix: `writing` matched inside "Handwriting", so a resource import
      // swallowed Finn's OT handwriting goal and OT never saw it. Now it routes
      // to OT only. See SPE-247.
      const resource = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'resource' });
      expect(resource.students.some((s) => s.lastName === 'Foster')).toBe(false);

      const ot = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'ot' });
      expect(ot.students.some((s) => s.lastName === 'Foster')).toBe(true);
    });

    it('drops the "Receptive Languge" typo row for speech', async () => {
      const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'speech' });
      expect(result.students.some((s) => s.lastName === 'Hunt')).toBe(false);
    });

    it('surfaces the blank-metadata goal row for review instead of importing or dropping it silently', async () => {
      const result = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'resource' });
      // Still not imported under a guessed role (blank metadata = no signal)...
      expect(result.students.some((s) => s.lastName === 'Gomez')).toBe(false);
      // ...but surfaced as a review warning rather than vanishing entirely.
      expect(result.warnings.some((w) => /review/i.test(w.message))).toBe(true);
    });

    it('no longer matches the Social/Emotional student to OT (word-boundary kills "ot" in "emotional")', async () => {
      // Pre-fix the 2-letter OT keyword matched inside "emOTional", pulling Diaz
      // (a counseling student) into OT imports. Word boundaries stop that; Diaz
      // still routes to counseling.
      const ot = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'ot' });
      expect(ot.students.some((s) => s.lastName === 'Diaz')).toBe(false);

      const counseling = await parseCSVReport(SEIS_GOALS_CSV_BOM(), { providerRole: 'counseling' });
      expect(counseling.students.some((s) => s.lastName === 'Diaz')).toBe(true);
    });
  });
});
