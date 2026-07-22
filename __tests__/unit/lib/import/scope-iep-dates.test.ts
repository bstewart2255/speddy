/**
 * Unit tests for the SPE-303 IEP Dates pipeline seams surfaced by PR review:
 *   - scopeIepDatesToSchool: school scoping runs BEFORE name-dedup, so a
 *     same-name student at another school can't shadow the current-school one;
 *     a genuine same-school collision is flagged, not silently dropped.
 *   - parseIepDatesFile: a wrong-shape / empty file propagates as a throw (which
 *     the pipeline turns into a 400 or a warning) instead of a silent empty parse.
 * All data is fictional.
 */
import { parseIepDatesFile, scopeIepDatesToSchool } from '@/lib/import/parse-files';
import type { IepDatesRecord } from '@/lib/parsers/iep-dates-parser';
import { createNormalizedKey } from '@/lib/parsers/name-utils';

const HEADER =
  'First Name,Last Name,School of Attendance,Grade Level,Date of Next Annual Plan Review,Date of Next Reevaluation';

const rec = (
  first: string,
  last: string,
  school: string,
  iep?: string,
): IepDatesRecord => ({
  normalizedName: createNormalizedKey(first, last),
  firstName: first,
  lastName: last,
  gradeLevel: '3',
  schoolOfAttendance: school,
  upcomingIepDate: iep,
  upcomingTriennialDate: undefined,
});

describe('scopeIepDatesToSchool', () => {
  it('keeps the CURRENT-school student when a same-name student exists at another school', () => {
    // Other-school row first (would have won a parser-level first-wins dedup),
    // then the current-school row. Scoping-before-dedup must keep the latter.
    const records = [
      rec('John', 'Smith', 'Birch Elementary', '2027-01-01'),
      rec('John', 'Smith', 'Willow Elementary', '2027-09-01'),
    ];
    const { records: map } = scopeIepDatesToSchool(records, 'Willow Elementary', true);
    expect(map.size).toBe(1);
    expect(map.get(createNormalizedKey('John', 'Smith'))?.upcomingIepDate).toBe('2027-09-01');
    expect(map.get(createNormalizedKey('John', 'Smith'))?.schoolOfAttendance).toBe('Willow Elementary');
  });

  it('flags a genuine same-school duplicate (first-wins) instead of dropping silently', () => {
    const records = [
      rec('Jane', 'Doe', 'Willow Elementary', '2027-01-01'),
      rec('Jane', 'Doe', 'Willow Elementary', '2027-02-02'),
    ];
    const { records: map, warnings } = scopeIepDatesToSchool(records, 'Willow Elementary', true);
    expect(map.size).toBe(1);
    expect(map.get(createNormalizedKey('Jane', 'Doe'))?.upcomingIepDate).toBe('2027-01-01'); // first-wins
    expect(warnings.some((w) => /duplicate student/i.test(w.message))).toBe(true);
  });

  it('does not school-filter for a single-school provider (keeps all, deduped by name)', () => {
    const records = [rec('Ann', 'Lee', 'Somewhere Else', '2027-03-03')];
    const { records: map } = scopeIepDatesToSchool(records, 'Willow Elementary', false);
    expect(map.size).toBe(1);
    expect(map.get(createNormalizedKey('Ann', 'Lee'))?.upcomingIepDate).toBe('2027-03-03');
  });

  it('keeps a blank-school row (assigned to the current school)', () => {
    const records = [rec('Sam', 'Ray', '', '2027-04-04')];
    const { records: map } = scopeIepDatesToSchool(records, 'Willow Elementary', true);
    expect(map.get(createNormalizedKey('Sam', 'Ray'))?.upcomingIepDate).toBe('2027-04-04');
  });
});

describe('parseIepDatesFile', () => {
  // jsdom's File doesn't implement arrayBuffer(); the Node API runtime (where this
  // actually runs) does. Stub just the method parseIepDatesFile calls.
  const file = (content: string) =>
    ({ arrayBuffer: async () => new TextEncoder().encode(content).buffer } as unknown as File);

  it('throws on a wrong-shape file (missing the compliance-date columns)', async () => {
    await expect(parseIepDatesFile(file('First Name,Last Name,Grade\nJohn,Doe,3'))).rejects.toThrow(
      /date of next/i,
    );
  });

  it('throws on a file missing the name columns', async () => {
    await expect(
      parseIepDatesFile(file('Date of Next Annual Plan Review,Date of Next Reevaluation\n09/01/2026,05/12/2027')),
    ).rejects.toThrow(/first name \/ last name/i);
  });

  it('throws on an empty file', async () => {
    await expect(parseIepDatesFile(file(''))).rejects.toThrow(/empty/i);
  });

  it('returns an array of rows for a valid file', async () => {
    const { records, read } = await parseIepDatesFile(
      file(`${HEADER}\nJohn,Doe,Willow Elementary,3,09/01/2026,05/12/2027`),
    );
    expect(Array.isArray(records)).toBe(true);
    expect(records).toHaveLength(1);
    expect(read).toBe(1);
    expect(records[0].upcomingIepDate).toBe('2026-09-01');
  });
});
