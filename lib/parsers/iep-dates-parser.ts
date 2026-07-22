/**
 * SEIS "IEP Dates" Report Parser (SPE-303)
 *
 * Parses the SEIS "IEP Dates" report — one CSV row per student carrying the two
 * compliance dates providers track all year: Date of Next Annual Plan Review
 * (the upcoming IEP review) and Date of Next Reevaluation (the triennial). Like
 * Deliveries and the Aeries Class List, this is an ENRICHMENT file: it never
 * creates students, it only fills in dates for students matched by normalized
 * full name.
 *
 * Column lookup is header-based (not fixed positions) so a re-ordered export
 * still parses. Both dates run through the shared `parseDate` helper, which
 * emits ISO `YYYY-MM-DD`; an unparseable-but-present date is a per-row warning.
 */

import { parse } from 'csv-parse/sync';
import { createNormalizedKey } from './name-utils';
import { parseDate } from '@/lib/utils/iep-date-utils';

export interface IepDatesRecord {
  /** createNormalizedKey(firstName, lastName) — the cross-file match key. */
  normalizedName: string;
  firstName: string;
  lastName: string;
  /** Carried for display/debugging; matching is name-only (like Deliveries). */
  gradeLevel: string;
  /** Feeds the school scoping in the pipeline (applySchoolFilter). */
  schoolOfAttendance: string;
  /** ISO YYYY-MM-DD, present only when the "Date of Next Annual Plan Review" cell parsed. */
  upcomingIepDate?: string;
  /** ISO YYYY-MM-DD, present only when the "Date of Next Reevaluation" cell parsed. */
  upcomingTriennialDate?: string;
}

export interface IepDatesParseResult {
  // All parsed rows in file order — deliberately NOT deduped by name here.
  // Name-collision handling is deferred to the pipeline, which dedupes only
  // AFTER scoping to the selected school, so a same-name student at another
  // school can't drop the current-school student's dates (SPE-303 review).
  records: IepDatesRecord[];
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  metadata: {
    totalRows: number;
    uniqueStudents: number;
  };
}

/**
 * Parse one date cell to a real calendar date in ISO form, or undefined.
 *
 * The shared `parseDate` handles the MM/DD/YYYY → ISO conversion but does NOT
 * range-check its output (it string-formats, so "13/45/2026" becomes the
 * impossible "2026-13-45"). Since these dates flow into a Postgres `date` column
 * — whose cast would reject an out-of-range value and error the student's whole
 * write — validate the calendar date here so a bad value surfaces as a review
 * warning instead.
 */
function parseIepDate(raw: string): string | undefined {
  const iso = parseDate(raw);
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(year, month - 1, day));
  const valid =
    dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
  return valid ? iso : undefined;
}

// Windows-1252 differs from latin1 (ISO-8859-1) only in 0x80–0x9F, where it maps
// most bytes to printable punctuation/letters rather than C1 control chars
// (notably 0x92 → "’" U+2019). We decode manually — latin1 (always available on
// Buffer) plus this remap — instead of TextDecoder('windows-1252'), which is NOT
// reliably available in every runtime: small-ICU Node builds throw on it, and the
// jsdom test environment's TextDecoder decodes it incorrectly. Undefined
// Windows-1252 slots (0x81, 0x8D, 0x8F, 0x90, 0x9D) fall through unchanged.
const WINDOWS_1252_C1: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
};

function decodeWindows1252(buffer: Buffer): string {
  // latin1 maps each byte to U+00XX, so the C1 range (0x80-0x9F) is the only
  // place we diverge from Windows-1252. Walk the bytes and remap that range.
  const chars: string[] = [];
  for (const byte of buffer) {
    chars.push(
      byte >= 0x80 && byte <= 0x9f
        ? WINDOWS_1252_C1[byte] ?? String.fromCharCode(byte)
        : String.fromCharCode(byte),
    );
  }
  return chars.join('');
}

/** Normalize an already-split header cell: strip quotes, collapse whitespace, lowercase. */
function normalizeHeader(cell: string): string {
  return cell
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Header signatures (normalized). Names carry the cross-file match key; school
// feeds school scoping; the two date columns are the payload.
const COL = {
  firstName: 'first name',
  lastName: 'last name',
  gradeLevel: 'grade level',
  school: 'school of attendance',
  iepDate: 'date of next annual plan review',
  triennial: 'date of next reevaluation',
} as const;

/**
 * Parse a SEIS "IEP Dates" CSV buffer into a normalized-name → dates map.
 * A HARD parse failure (e.g. an unterminated quote running to EOF) propagates to
 * the caller, matching the deliveries parser — the caller surfaces it as an error
 * (callers render only `warnings`, so swallowing it would enrich nothing silently).
 */
export async function parseIepDatesCSV(buffer: Buffer): Promise<IepDatesParseResult> {
  const records: IepDatesRecord[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];

  const parseOptions = {
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
  };

  // Choose the encoding from the raw bytes: valid UTF-8 stays UTF-8; otherwise the
  // file is a Windows-1252 export (what SEIS/Windows tools ship), decoded via
  // decodeWindows1252 so bytes in 0x80–0x9F resolve to the intended punctuation —
  // most importantly 0x92 → "’" (U+2019). Plain latin1 would map 0x92 to a C1
  // control char, corrupting names like "O’Connor" into a different normalized
  // match key that would silently miss the student (0xF1 → ñ agrees in both
  // encodings, so it doesn't exercise this difference).
  const isUtf8 = (() => {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      return true;
    } catch {
      return false;
    }
  })();

  let allRecords: string[][];
  try {
    allRecords = isUtf8
      ? parse(buffer, { encoding: 'utf-8', ...parseOptions })
      : parse(decodeWindows1252(buffer), parseOptions);
  } catch {
    // Last-resort fallback for any other hard parse/decoding error.
    allRecords = parse(decodeWindows1252(buffer), parseOptions);
  }

  // Drop whitespace-only lines (which parse to a single blank field) so row
  // numbers stay aligned, matching the deliveries parser.
  const rows = allRecords.filter((r) => !(r.length === 1 && !r[0].trim()));

  if (rows.length === 0) {
    errors.push({ row: 0, message: 'IEP Dates file is empty' });
    return { records, errors, warnings, metadata: { totalRows: 0, uniqueStudents: 0 } };
  }

  // Build a header → column-index lookup from the first row.
  const header = rows[0].map(normalizeHeader);
  const indexOf = (name: string) => header.indexOf(name);
  const firstNameIdx = indexOf(COL.firstName);
  const lastNameIdx = indexOf(COL.lastName);
  const gradeIdx = indexOf(COL.gradeLevel);
  const schoolIdx = indexOf(COL.school);
  const iepDateIdx = indexOf(COL.iepDate);
  const triennialIdx = indexOf(COL.triennial);

  if (firstNameIdx === -1 || lastNameIdx === -1) {
    errors.push({
      row: 0,
      message: 'Could not detect First Name / Last Name columns in the IEP Dates file',
    });
    return { records, errors, warnings, metadata: { totalRows: 0, uniqueStudents: 0 } };
  }
  if (iepDateIdx === -1 && triennialIdx === -1) {
    errors.push({
      row: 0,
      message:
        'Could not detect a "Date of Next Annual Plan Review" or "Date of Next Reevaluation" column',
    });
    return { records, errors, warnings, metadata: { totalRows: 0, uniqueStudents: 0 } };
  }

  const cell = (fields: string[], idx: number) => (idx >= 0 ? (fields[idx] ?? '').trim() : '');

  let totalRows = 0;

  for (let i = 1; i < rows.length; i++) {
    const fields = rows[i];
    const rowNum = i + 1;
    totalRows++;

    try {
      const firstName = cell(fields, firstNameIdx);
      const lastName = cell(fields, lastNameIdx);

      const normalizedName = createNormalizedKey(firstName, lastName);
      // createNormalizedKey returns "_" (just the separator) when both names are
      // blank — treat that as "no name" and skip, so a blank row can't collide.
      if (!firstName && !lastName) {
        warnings.push({ row: rowNum, message: 'Row has no student name — skipped' });
        continue;
      }

      // Parse each date only when its cell is non-empty; warn on a present-but-
      // unparseable value so it isn't silently dropped.
      const iepDateRaw = cell(fields, iepDateIdx);
      const triennialRaw = cell(fields, triennialIdx);

      let upcomingIepDate: string | undefined;
      if (iepDateRaw) {
        upcomingIepDate = parseIepDate(iepDateRaw);
        if (!upcomingIepDate) {
          warnings.push({ row: rowNum, message: `Invalid IEP review date: ${iepDateRaw}` });
        }
      }

      let upcomingTriennialDate: string | undefined;
      if (triennialRaw) {
        upcomingTriennialDate = parseIepDate(triennialRaw);
        if (!upcomingTriennialDate) {
          warnings.push({ row: rowNum, message: `Invalid triennial date: ${triennialRaw}` });
        }
      }

      // Keep every named row (no name-dedup here). Two rows with the same
      // normalized name can be different students at different schools; deduping
      // now, before the pipeline scopes to the selected school, could drop the
      // current-school student in favor of an other-school one. The pipeline
      // dedupes AFTER school scoping instead (SPE-303 review).
      records.push({
        normalizedName,
        firstName,
        lastName,
        gradeLevel: cell(fields, gradeIdx),
        schoolOfAttendance: cell(fields, schoolIdx),
        upcomingIepDate,
        upcomingTriennialDate,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push({ row: rowNum, message: `Error parsing row: ${message}` });
    }
  }

  return {
    records,
    errors,
    warnings,
    metadata: {
      totalRows,
      uniqueStudents: new Set(records.map((r) => r.normalizedName)).size,
    },
  };
}
