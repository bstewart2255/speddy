/**
 * Golden-fixture unit tests for the parser normalization helpers (SPE-239).
 *
 * These pin CURRENT behavior — including known bugs — so the SPE-240 parser
 * hardening work surfaces as explicit snapshot/assertion diffs rather than
 * silent changes. Where a documented bug exists (e.g. spelled-out grades), the
 * assertion codifies the buggy output on purpose; the accompanying comment
 * notes the intended post-SPE-240 value.
 *
 * All inputs are fictional.
 */

import {
  normalizeGradeLevel as normalizeGradeLevelCsv,
  detectSEISStudentGoalsFormat,
  excelSerialToDate as excelSerialToDateCsv,
} from '@/lib/parsers/csv-parser';
import {
  normalizeGradeLevel as normalizeGradeLevelSeis,
  excelSerialToDate as excelSerialToDateSeis,
} from '@/lib/parsers/seis-parser';
import {
  normalizeStudentName,
  createNormalizedKey,
  parseStudentName,
} from '@/lib/parsers/name-utils';
import { normalizeSchoolName as normalizeSchoolNameHelper } from '@/lib/school-helpers';
// SPE-230 extracted the route's private copy into a shared pipeline module;
// import it directly (replacing the former mirror) and keep the divergence
// assertions below.
import { normalizeSchoolName as normalizeSchoolNameRoute } from '@/lib/import/normalize-school-name';
import { SEIS_HEADERS } from './fixtures/builders';

describe('normalizeGradeLevel — CSV copy (lib/parsers/csv-parser.ts)', () => {
  it('applies the SEIS-specific special cases (grade 18 -> TK, grade 0 -> K)', () => {
    expect(normalizeGradeLevelCsv('18')).toBe('TK');
    expect(normalizeGradeLevelCsv('0')).toBe('K');
  });

  it('normalizes zero-padded and suffixed numeric grades', () => {
    expect(normalizeGradeLevelCsv('03')).toBe('3');
    expect(normalizeGradeLevelCsv('02')).toBe('2');
    expect(normalizeGradeLevelCsv('3rd')).toBe('3');
    expect(normalizeGradeLevelCsv('Grade 5')).toBe('5');
    expect(normalizeGradeLevelCsv('K')).toBe('K');
    expect(normalizeGradeLevelCsv('TK')).toBe('TK');
    expect(normalizeGradeLevelCsv('12')).toBe('12');
  });

  it('returns out-of-range numeric grades unchanged', () => {
    // 13 is neither 1-12, nor a SEIS special case -> passed through as-is.
    expect(normalizeGradeLevelCsv('13')).toBe('13');
  });

  it('normalizes spelled-out grades (SPE-240: dropped the ordinal strip that clobbered them)', () => {
    // The `/TH|ST|ND|RD/` removal used to run before the number-word map, so
    // "First" -> "Fir" and "Kindergarten" -> "Kiergarten" never matched. Fixed.
    expect(normalizeGradeLevelCsv('First')).toBe('1');
    expect(normalizeGradeLevelCsv('Kindergarten')).toBe('K');
  });

  it('normalizes Pre-K variants to TK (checked before the K match; no separate Pre-K student grade)', () => {
    for (const g of ['Pre-K', 'Pre-Kindergarten', 'PK', 'pre k', 'PreK']) {
      expect(normalizeGradeLevelCsv(g)).toBe('TK');
    }
    // Plain kindergarten must still resolve to K, not be swept up by the Pre-K branch.
    expect(normalizeGradeLevelCsv('K')).toBe('K');
    expect(normalizeGradeLevelCsv('Kindergarten')).toBe('K');
    expect(normalizeGradeLevelCsv('Kinder')).toBe('K');
  });

  it('snapshots the full CSV-copy grade matrix', () => {
    const inputs = [
      'K', 'TK', 'Kindergarten', 'Kinder', 'First', 'Second', 'Third',
      'Fourth', 'Fifth', '3rd', '03', '02', '0', '18', '1', '5', '12',
      '13', 'Grade 4', 'grade 10', '', '  ',
    ];
    expect(Object.fromEntries(inputs.map((i) => [JSON.stringify(i), normalizeGradeLevelCsv(i)])))
      .toMatchSnapshot();
  });
});

describe('normalizeGradeLevel — XLSX copy (lib/parsers/seis-parser.ts)', () => {
  it('now applies the SEIS-specific 18 -> TK / 0 -> K special cases too (SPE-240 convergence)', () => {
    // SPE-240 merged the CSV/XLSX copies onto the shared normalizer, so the XLSX
    // path applies the same SEIS special cases the CSV path always did.
    expect(normalizeGradeLevelSeis('18')).toBe('TK');
    expect(normalizeGradeLevelSeis('0')).toBe('K');
    expect(normalizeGradeLevelSeis('18')).toBe(normalizeGradeLevelCsv('18'));
  });

  it('agrees with the CSV copy on ordinary numeric and K/TK grades', () => {
    for (const g of ['03', '2', '12', 'K', 'TK', '3rd']) {
      expect(normalizeGradeLevelSeis(g)).toBe(normalizeGradeLevelCsv(g));
    }
  });

  it('snapshots the full XLSX-copy grade matrix', () => {
    const inputs = [
      'K', 'TK', 'Kindergarten', 'First', '3rd', '03', '0', '18', '1', '12', '13', '',
    ];
    expect(Object.fromEntries(inputs.map((i) => [JSON.stringify(i), normalizeGradeLevelSeis(i)])))
      .toMatchSnapshot();
  });
});

describe('normalizeStudentName / parseStudentName / createNormalizedKey', () => {
  it('preserves hyphens but strips spaces inside last names', () => {
    expect(normalizeStudentName('Ng-Patel, Nadia')).toBe('ng-patel_nadia');
    expect(normalizeStudentName('"Van Horn, Vera"')).toBe('vanhorn_vera');
  });

  it('createNormalizedKey matches normalizeStudentName for equivalent inputs', () => {
    expect(createNormalizedKey('Nadia', 'Ng-Patel')).toBe('ng-patel_nadia');
    expect(createNormalizedKey('Vera', 'Van Horn')).toBe('vanhorn_vera');
  });

  it('snapshots the name-normalization matrix', () => {
    const inputs = [
      'Alvarez, Ana',
      '"Van Horn, Vera"',
      'Ng-Patel, Nadia',
      'Ana Alvarez',
      'Cher',
      '  Extra ,  Spaces  ',
      '',
    ];
    expect(
      inputs.map((i) => ({
        input: i,
        normalized: normalizeStudentName(i),
        parsed: parseStudentName(i),
      })),
    ).toMatchSnapshot();
  });
});

describe('normalizeSchoolName — two divergent implementations', () => {
  it('lib/school-helpers strips punctuation and stopwords but keeps "school"', () => {
    expect(normalizeSchoolNameHelper('Mt Diablo Elementary School')).toBe('mt diablo elementary school');
    expect(normalizeSchoolNameHelper('St. Mary School')).toBe('st mary school');
  });

  it('the route copy expands abbreviations and drops a trailing "school"', () => {
    expect(normalizeSchoolNameRoute('Mt Diablo Elementary School')).toBe('mount diablo elementary');
    expect(normalizeSchoolNameRoute('St Mary School')).toBe('saint mary');
  });

  it('the two implementations diverge on the same input (documented, intentional)', () => {
    const input = 'Mt Diablo Elementary School';
    expect(normalizeSchoolNameHelper(input)).not.toBe(normalizeSchoolNameRoute(input));
  });

  it('snapshots both implementations across a shared input set', () => {
    const inputs = [
      'Mt Diablo Elementary School',
      'St Mary School',
      'Out of District- MOU',
      'Washington Elementary',
      'Washington Middle',
      'Bancroft Elementary School',
    ];
    expect(
      inputs.map((i) => ({
        input: i,
        helper: normalizeSchoolNameHelper(i),
        route: normalizeSchoolNameRoute(i),
      })),
    ).toMatchSnapshot();
  });
});

describe('excelSerialToDate — both copies identical', () => {
  const serials = [0, 1, 2, 45658, 45824.5, 100000, -5];

  it('produces the same output from both copies', () => {
    for (const s of serials) {
      expect(excelSerialToDateSeis(s)).toBe(excelSerialToDateCsv(s));
    }
  });

  it('rejects serials below 1 and those resolving before 1900 or after 2100', () => {
    // serial < 1 is rejected by the guard; 1 resolves to Dec 31 1899 (year <
    // 1900); 100000 resolves past year 2100.
    expect(excelSerialToDateCsv(0)).toBeUndefined();
    expect(excelSerialToDateCsv(1)).toBeUndefined();
    expect(excelSerialToDateCsv(100000)).toBeUndefined();
  });

  it('snapshots the serial-to-date matrix', () => {
    expect(Object.fromEntries(serials.map((s) => [s, excelSerialToDateCsv(s)]))).toMatchSnapshot();
  });
});

describe('detectSEISStudentGoalsFormat — 5-of-6 threshold', () => {
  it('detects a full SEIS header row', () => {
    expect(detectSEISStudentGoalsFormat([SEIS_HEADERS])).toBe(true);
  });

  it('still detects with exactly 5 of 6 key columns present', () => {
    const fiveOfSix = [...SEIS_HEADERS];
    fiveOfSix[14] = 'Notes'; // break the Goal @ 14 match
    expect(detectSEISStudentGoalsFormat([fiveOfSix])).toBe(true);
  });

  it('falls back (returns false) at 4 of 6 key columns', () => {
    const fourOfSix = [...SEIS_HEADERS];
    fourOfSix[14] = 'Notes'; // break Goal @ 14
    fourOfSix[12] = 'Sequence'; // break Annual Goal # @ 12
    expect(detectSEISStudentGoalsFormat([fourOfSix])).toBe(false);
  });

  it('returns false for empty and generic header rows', () => {
    expect(detectSEISStudentGoalsFormat([])).toBe(false);
    expect(detectSEISStudentGoalsFormat([['First Name', 'Last Name', 'Grade', 'Goal']])).toBe(false);
  });
});
