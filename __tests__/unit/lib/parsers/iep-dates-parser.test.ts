/**
 * Unit tests for the SEIS "IEP Dates" report parser (SPE-303).
 *
 * Pins: header-based column lookup (order-independent), MM/DD/YYYY → ISO date
 * parsing for both compliance dates, per-row warnings on an unparseable date,
 * BOM + latin1 tolerance, duplicate-name / no-name handling, and the golden
 * fixture shape. All data is fictional.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseIepDatesCSV } from '@/lib/parsers/iep-dates-parser';
import { createNormalizedKey } from '@/lib/parsers/name-utils';

const HEADER =
  'SEIS ID,SSID,Last Name,First Name,Student Middle Name,Preferred Name,Date of Birth,District of Service,District of SPED Accountability,School of Attendance,Grade Level,Case Manager,Disability 1,Date of Next Annual Plan Review,Date of Next Reevaluation,Date of IEP (Meeting Date on Future IEP forms),Meeting Type';

const buf = (csv: string) => Buffer.from(csv, 'utf-8');

describe('parseIepDatesCSV', () => {
  it('maps both compliance dates to ISO, keyed by normalized full name', async () => {
    const csv = `${HEADER}\n1,2,Doe,John,,,01/05/2016,D,D,Maple Elementary,3,CM,SLD,09/01/2026,05/12/2027,09/01/2025,20|`;
    const { records } = await parseIepDatesCSV(buf(csv));

    const rec = records.get(createNormalizedKey('John', 'Doe'));
    expect(rec).toBeDefined();
    expect(rec!.upcomingIepDate).toBe('2026-09-01');
    expect(rec!.upcomingTriennialDate).toBe('2027-05-12');
    expect(rec!.firstName).toBe('John');
    expect(rec!.lastName).toBe('Doe');
    expect(rec!.gradeLevel).toBe('3');
    expect(rec!.schoolOfAttendance).toBe('Maple Elementary');
  });

  it('is order-independent — locates columns by header, not position', async () => {
    // Reversed column order; only the two dates + names present.
    const csv =
      'Date of Next Reevaluation,First Name,Last Name,Date of Next Annual Plan Review\n' +
      '05/12/2027,John,Doe,09/01/2026';
    const { records } = await parseIepDatesCSV(buf(csv));
    const rec = records.get(createNormalizedKey('John', 'Doe'));
    expect(rec!.upcomingIepDate).toBe('2026-09-01');
    expect(rec!.upcomingTriennialDate).toBe('2027-05-12');
  });

  it('leaves a blank date undefined (present-only), without a warning', async () => {
    const csv = `${HEADER}\n1,2,Garcia,Maria,,,,D,D,Maple Elementary,2,CM,SLI,11/03/2026,,11/03/2025,10|`;
    const { records, warnings } = await parseIepDatesCSV(buf(csv));
    const rec = records.get(createNormalizedKey('Maria', 'Garcia'));
    expect(rec!.upcomingIepDate).toBe('2026-11-03');
    expect(rec!.upcomingTriennialDate).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it('warns on a present-but-unparseable date and drops just that field', async () => {
    const csv = `${HEADER}\n1,2,Brown,Bob,,,,D,D,Maple Elementary,5,CM,SLD,13/45/2026,06/20/2027,08/15/2025,20|`;
    const { records, warnings } = await parseIepDatesCSV(buf(csv));
    const rec = records.get(createNormalizedKey('Bob', 'Brown'));
    expect(rec!.upcomingIepDate).toBeUndefined(); // 13/45/2026 is invalid
    expect(rec!.upcomingTriennialDate).toBe('2027-06-20'); // the valid one is kept
    expect(warnings.some((w) => /invalid iep review date/i.test(w.message))).toBe(true);
  });

  it('skips a row with no name and warns', async () => {
    const csv = `${HEADER}\n1,2,,,,,,D,D,Maple Elementary,3,CM,SLD,09/01/2026,05/12/2027,09/01/2025,20|`;
    const { records, warnings } = await parseIepDatesCSV(buf(csv));
    expect(records.size).toBe(0);
    expect(warnings.some((w) => /no student name/i.test(w.message))).toBe(true);
  });

  it('keeps the first row on a duplicate normalized name and warns', async () => {
    const csv =
      `${HEADER}\n` +
      '1,2,Doe,John,,,,D,D,Maple Elementary,3,CM,SLD,09/01/2026,05/12/2027,09/01/2025,20|\n' +
      '2,3,Doe,John,,,,D,D,Maple Elementary,3,CM,SLD,01/01/2030,01/01/2031,01/01/2029,20|';
    const { records, warnings } = await parseIepDatesCSV(buf(csv));
    expect(records.size).toBe(1);
    expect(records.get(createNormalizedKey('John', 'Doe'))!.upcomingIepDate).toBe('2026-09-01');
    expect(warnings.some((w) => /duplicate student/i.test(w.message))).toBe(true);
  });

  it('tolerates a UTF-8 BOM and quoted header cells (as SEIS exports ship)', async () => {
    const csv =
      '﻿"First Name","Last Name","Date of Next Annual Plan Review","Date of Next Reevaluation"\n' +
      '"John","Doe","09/01/2026","05/12/2027"';
    const { records } = await parseIepDatesCSV(buf(csv));
    expect(records.get(createNormalizedKey('John', 'Doe'))!.upcomingIepDate).toBe('2026-09-01');
  });

  it('decodes a latin1 / Windows-1252 name (byte 0xF1 → ñ)', async () => {
    // "Muñoz" with the ñ as a single latin1 byte 0xF1 (not valid UTF-8).
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
    const rec = records.get(createNormalizedKey('Ana', 'Muñoz'));
    expect(rec).toBeDefined();
    expect(rec!.upcomingIepDate).toBe('2026-09-01');
  });

  it('errors when neither compliance-date column is present', async () => {
    const csv = 'First Name,Last Name,Grade Level\nJohn,Doe,3';
    const { records, errors } = await parseIepDatesCSV(buf(csv));
    expect(records.size).toBe(0);
    expect(errors.some((e) => /date of next/i.test(e.message))).toBe(true);
  });

  it('parses the golden fixture: dates, one-date-only, invalid date, other-school row', async () => {
    const csv = readFileSync(
      join(__dirname, 'fixtures', 'iep-dates.csv'),
    );
    const { records, warnings, metadata } = await parseIepDatesCSV(csv);

    // 5 students read; every name keyed.
    expect(metadata.uniqueStudents).toBe(5);
    expect(records.get(createNormalizedKey('John', 'Doe'))!.upcomingIepDate).toBe('2026-09-01');
    expect(records.get(createNormalizedKey('Maria', 'Garcia'))!.upcomingTriennialDate).toBeUndefined();
    // Bob Brown's IEP review date is invalid (13/45/2026) → warned + dropped.
    expect(records.get(createNormalizedKey('Bob', 'Brown'))!.upcomingIepDate).toBeUndefined();
    expect(warnings.some((w) => /invalid iep review date/i.test(w.message))).toBe(true);
    // The other-school student is still parsed here; school scoping happens in the pipeline.
    expect(records.get(createNormalizedKey('Kim', 'Nguyen'))!.schoolOfAttendance).toBe('Birch Elementary');
  });
});
