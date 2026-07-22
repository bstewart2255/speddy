/**
 * Unit tests for the SEIS "IEP Dates" report parser (SPE-303).
 *
 * Pins: header-based column lookup (order-independent), MM/DD/YYYY → ISO date
 * parsing for both compliance dates, per-row warnings on an unparseable date,
 * BOM + latin1 tolerance, and the golden fixture shape. The parser deliberately
 * returns ALL named rows (no name-dedup) — collision handling is deferred to the
 * pipeline's school-scoped dedup (see scope-iep-dates.test.ts). All data is fictional.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseIepDatesCSV, IepDatesRecord } from '@/lib/parsers/iep-dates-parser';
import { createNormalizedKey } from '@/lib/parsers/name-utils';

const HEADER =
  'SEIS ID,SSID,Last Name,First Name,Student Middle Name,Preferred Name,Date of Birth,District of Service,District of SPED Accountability,School of Attendance,Grade Level,Case Manager,Disability 1,Date of Next Annual Plan Review,Date of Next Reevaluation,Date of IEP (Meeting Date on Future IEP forms),Meeting Type';

const buf = (csv: string) => Buffer.from(csv, 'utf-8');
const byName = (records: IepDatesRecord[], first: string, last: string) =>
  records.find((r) => r.normalizedName === createNormalizedKey(first, last));

describe('parseIepDatesCSV', () => {
  it('maps both compliance dates to ISO, keyed by normalized full name', async () => {
    const csv = `${HEADER}\n1,2,Doe,John,,,01/05/2016,D,D,Maple Elementary,3,CM,SLD,09/01/2026,05/12/2027,09/01/2025,20|`;
    const { records } = await parseIepDatesCSV(buf(csv));

    const rec = byName(records, 'John', 'Doe');
    expect(rec).toBeDefined();
    expect(rec!.upcomingIepDate).toBe('2026-09-01');
    expect(rec!.upcomingTriennialDate).toBe('2027-05-12');
    expect(rec!.firstName).toBe('John');
    expect(rec!.lastName).toBe('Doe');
    expect(rec!.gradeLevel).toBe('3');
    expect(rec!.schoolOfAttendance).toBe('Maple Elementary');
  });

  it('is order-independent — locates columns by header, not position', async () => {
    const csv =
      'Date of Next Reevaluation,First Name,Last Name,Date of Next Annual Plan Review\n' +
      '05/12/2027,John,Doe,09/01/2026';
    const { records } = await parseIepDatesCSV(buf(csv));
    const rec = byName(records, 'John', 'Doe');
    expect(rec!.upcomingIepDate).toBe('2026-09-01');
    expect(rec!.upcomingTriennialDate).toBe('2027-05-12');
  });

  it('leaves a blank date undefined (present-only), without a warning', async () => {
    const csv = `${HEADER}\n1,2,Garcia,Maria,,,,D,D,Maple Elementary,2,CM,SLI,11/03/2026,,11/03/2025,10|`;
    const { records, warnings } = await parseIepDatesCSV(buf(csv));
    const rec = byName(records, 'Maria', 'Garcia');
    expect(rec!.upcomingIepDate).toBe('2026-11-03');
    expect(rec!.upcomingTriennialDate).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it('warns on a present-but-unparseable date and drops just that field', async () => {
    const csv = `${HEADER}\n1,2,Brown,Bob,,,,D,D,Maple Elementary,5,CM,SLD,13/45/2026,06/20/2027,08/15/2025,20|`;
    const { records, warnings } = await parseIepDatesCSV(buf(csv));
    const rec = byName(records, 'Bob', 'Brown');
    expect(rec!.upcomingIepDate).toBeUndefined(); // 13/45/2026 is invalid
    expect(rec!.upcomingTriennialDate).toBe('2027-06-20'); // the valid one is kept
    expect(warnings.some((w) => /invalid iep review date/i.test(w.message))).toBe(true);
  });

  it('skips a row with no name and warns', async () => {
    const csv = `${HEADER}\n1,2,,,,,,D,D,Maple Elementary,3,CM,SLD,09/01/2026,05/12/2027,09/01/2025,20|`;
    const { records, warnings } = await parseIepDatesCSV(buf(csv));
    expect(records).toHaveLength(0);
    expect(warnings.some((w) => /no student name/i.test(w.message))).toBe(true);
  });

  it('keeps ALL rows on a duplicate normalized name (dedup is deferred to school scoping)', async () => {
    const csv =
      `${HEADER}\n` +
      '1,2,Doe,John,,,,D,D,Maple Elementary,3,CM,SLD,09/01/2026,05/12/2027,09/01/2025,20|\n' +
      '2,3,Doe,John,,,,D,D,Birch Elementary,3,CM,SLD,01/01/2030,01/01/2031,01/01/2029,20|';
    const { records, metadata } = await parseIepDatesCSV(buf(csv));
    // Both rows retained (they may be different students at different schools).
    expect(records).toHaveLength(2);
    // uniqueStudents counts distinct normalized names, not rows.
    expect(metadata.uniqueStudents).toBe(1);
    expect(records.map((r) => r.schoolOfAttendance).sort()).toEqual(['Birch Elementary', 'Maple Elementary']);
  });

  it('tolerates a UTF-8 BOM and quoted header cells (as SEIS exports ship)', async () => {
    const csv =
      '﻿"First Name","Last Name","Date of Next Annual Plan Review","Date of Next Reevaluation"\n' +
      '"John","Doe","09/01/2026","05/12/2027"';
    const { records } = await parseIepDatesCSV(buf(csv));
    expect(byName(records, 'John', 'Doe')!.upcomingIepDate).toBe('2026-09-01');
  });

  it('decodes a Windows-1252 name (byte 0xF1 → ñ)', async () => {
    const header = Buffer.from(
      'First Name,Last Name,Date of Next Annual Plan Review,Date of Next Reevaluation\n',
      'utf-8',
    );
    const row = Buffer.from([
      ...Buffer.from('Ana,Mu', 'latin1'),
      0xf1,
      ...Buffer.from('oz,09/01/2026,05/12/2027', 'latin1'),
    ]);
    const { records } = await parseIepDatesCSV(Buffer.concat([header, row]));
    const rec = byName(records, 'Ana', 'Muñoz');
    expect(rec).toBeDefined();
    expect(rec!.upcomingIepDate).toBe('2026-09-01');
  });

  it('decodes a Windows-1252 apostrophe (byte 0x92 → ’), not the latin1 control char', async () => {
    // 0x92 is where Windows-1252 and latin1 diverge: win-1252 → ’ (U+2019),
    // latin1 → U+0092 (a control char). "O’Connor" must keep a real apostrophe so
    // its normalized match key lines up with the stored name.
    const header = Buffer.from(
      'First Name,Last Name,Date of Next Annual Plan Review,Date of Next Reevaluation\n',
      'utf-8',
    );
    const row = Buffer.from([
      ...Buffer.from('Sean,O', 'latin1'),
      0x92,
      ...Buffer.from('Connor,09/01/2026,05/12/2027', 'latin1'),
    ]);
    const { records } = await parseIepDatesCSV(Buffer.concat([header, row]));
    const rec = byName(records, 'Sean', 'O’Connor'); // U+2019, not U+0092
    expect(rec).toBeDefined();
    expect(rec!.lastName).toBe('O’Connor');
    expect(rec!.upcomingIepDate).toBe('2026-09-01');
  });

  it('errors when neither compliance-date column is present', async () => {
    const csv = 'First Name,Last Name,Grade Level\nJohn,Doe,3';
    const { records, errors } = await parseIepDatesCSV(buf(csv));
    expect(records).toHaveLength(0);
    expect(errors.some((e) => /date of next/i.test(e.message))).toBe(true);
  });

  it('errors when the name columns are missing', async () => {
    const csv = 'Date of Next Annual Plan Review,Date of Next Reevaluation\n09/01/2026,05/12/2027';
    const { records, errors } = await parseIepDatesCSV(buf(csv));
    expect(records).toHaveLength(0);
    expect(errors.some((e) => /first name \/ last name/i.test(e.message))).toBe(true);
  });

  it('parses the golden fixture: dates, one-date-only, invalid date, other-school row', async () => {
    const csv = readFileSync(join(__dirname, 'fixtures', 'iep-dates.csv'));
    const { records, warnings, metadata } = await parseIepDatesCSV(csv);

    expect(metadata.uniqueStudents).toBe(5);
    expect(byName(records, 'John', 'Doe')!.upcomingIepDate).toBe('2026-09-01');
    expect(byName(records, 'Maria', 'Garcia')!.upcomingTriennialDate).toBeUndefined();
    // Bob Brown's IEP review date is invalid (13/45/2026) → warned + dropped.
    expect(byName(records, 'Bob', 'Brown')!.upcomingIepDate).toBeUndefined();
    expect(warnings.some((w) => /invalid iep review date/i.test(w.message))).toBe(true);
    // The other-school student is still parsed here; school scoping happens in the pipeline.
    expect(byName(records, 'Kim', 'Nguyen')!.schoolOfAttendance).toBe('Birch Elementary');
  });
});
