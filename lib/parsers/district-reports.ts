/**
 * Parsers for the three district-wide SEIS exports beyond the two the roster
 * import already reads (SPE-575): the Services report (service minutes), the
 * Accommodations report (classroom accommodations), and the Student Download
 * (state-testing accommodations).
 *
 * All three are HEADER-DRIVEN, never positional — SPE-558 is the story of a
 * positional SEIS parser silently mis-reading the district-wide column shape.
 * Each parser refuses a file whose distinctive headers are missing, so a wrong
 * file in the wrong slot errors instead of importing garbage.
 *
 * SSID columns are deliberately never read: Speddy does not store state student
 * IDs (SPE-447 decision, 2026-08-19). Every file carries name + school + grade,
 * which is the identity the roster planner already matches on.
 *
 * These reports come out of SEIS as .xlsx; a .csv re-save is accepted too. Both
 * paths funnel into one string-grid extractor so they cannot diverge.
 */

import * as ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { toWeeklyMinutes, type ServicePeriod } from '@/lib/services/weekly-minutes';
import { getServiceTypeName } from './service-type-mapping';
import { normalizeGradeLevel } from '../utils/grade-parser';
import { parseDate } from '../utils/iep-date-utils';

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** The identity columns every district report carries for a student. */
export interface DistrictReportIdentity {
  firstName: string;
  lastName: string;
  gradeLevel: string;
  schoolOfAttendance?: string;
  /** ISO YYYY-MM-DD. */
  dateOfBirth?: string;
  caseManager?: string;
  /** Only the Accommodations report carries it. */
  districtStudentId?: string;
}

/** One IEP service line, with the file's own numbers and the weekly conversion. */
export interface DistrictServiceLine {
  /** SEIS/CALPADS service code, e.g. '415'. */
  code: string;
  /** The code's label from the file, e.g. 'Language and Speech'. */
  name: string;
  /** Total minutes for the stated frequency period, as the file states them. */
  minutes: number;
  frequency: ServicePeriod;
  /** `minutes` converted through the shared 36-week rules. */
  weeklyMinutes: number;
}

export interface ServicesReportStudent extends DistrictReportIdentity {
  services: DistrictServiceLine[];
}

export interface AccommodationsReportStudent extends DistrictReportIdentity {
  accommodations: string[];
  /** Rows whose text sits in the report's assessment-accommodations column. */
  testingAccommodations: string[];
}

export interface TestingReportStudent extends DistrictReportIdentity {
  testingAccommodations: string[];
}

export interface DistrictReportResult<T> {
  students: T[];
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  metadata: {
    /** Data rows read (excluding the header). */
    totalRows: number;
    formatDetected: boolean;
  };
}

// ---------------------------------------------------------------------------
// File → string grid
// ---------------------------------------------------------------------------

function excelCellText(cell: ExcelJS.Cell): string {
  const value = cell?.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '' : value.toISOString().split('T')[0];
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object' && 'richText' in value) {
    return (value as { richText: Array<{ text: string }> }).richText.map((t) => t.text).join('');
  }
  if (typeof value === 'object' && 'result' in value) {
    const result = (value as { result?: unknown }).result;
    if (result instanceof Date) {
      return isNaN(result.getTime()) ? '' : result.toISOString().split('T')[0];
    }
    return result === null || result === undefined ? '' : String(result);
  }
  return String(value);
}

/**
 * Read an uploaded report into rows of trimmed strings. `.xlsx` is what SEIS
 * exports; a CSV re-save is read through the same csv-parse options the other
 * SEIS parsers use (BOM, relaxed columns).
 */
export async function readReportGrid(buffer: Buffer): Promise<string[][]> {
  const isXlsx =
    buffer.length > 3 &&
    buffer[0] === 0x50 && // 'P'
    buffer[1] === 0x4b && // 'K'
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  if (isXlsx) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];
    const rows: string[][] = [];
    // eachRow skips fully-empty rows but keeps row numbers; use a plain loop so
    // the grid's indexes stay dense and row numbers in messages stay honest.
    for (let r = 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= worksheet.columnCount; c++) {
        cells.push(excelCellText(row.getCell(c)).trim());
      }
      rows.push(cells);
    }
    return rows;
  }

  const records: string[][] = parse(buffer, {
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
  });
  return records;
}

// ---------------------------------------------------------------------------
// Header resolution
// ---------------------------------------------------------------------------

/** Lower-cased, whitespace-collapsed FIRST LINE of a header cell. */
const headerKey = (header: string): string =>
  header.split('\n')[0].toLowerCase().replace(/\s+/g, ' ').trim();

function findColumn(headers: string[], match: (key: string) => boolean): number | undefined {
  for (let i = 0; i < headers.length; i++) {
    if (match(headerKey(headers[i]))) return i;
  }
  return undefined;
}

const cellAt = (row: string[], index: number | undefined): string =>
  index === undefined ? '' : (row[index] ?? '').trim();

const isoDate = (raw: string): string | undefined => (raw ? parseDate(raw) : undefined);

/** Case-insensitive de-dup that keeps first spelling and drops blanks. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

/** Warnings capped like the sibling parsers — a district file repeats mistakes. */
const PER_ROW_WARNING_LIMIT = 20;

// ---------------------------------------------------------------------------
// 1. Services report — service minutes per student
// ---------------------------------------------------------------------------

/**
 * SEIS "Special Education Services" report (CALPADS shape): one row per
 * student-service with `Service Duration` (TOTAL minutes for the frequency
 * period — this district writes "750 yearly", never "30 × 25") and a coded
 * `Service Frequency Code`. A student's multiple lines are all kept — a split
 * service (same code, several locations) is summed by the claim math, not here.
 */
export async function parseServicesReport(
  buffer: Buffer,
): Promise<DistrictReportResult<ServicesReportStudent>> {
  const errors: DistrictReportResult<never>['errors'] = [];
  const warnings: DistrictReportResult<never>['warnings'] = [];
  const grid = await readReportGrid(buffer);

  const headers = grid[0] ?? [];
  const col = {
    firstName: findColumn(headers, (k) => k.includes('first name')),
    lastName: findColumn(headers, (k) => k.includes('last name')),
    birthDate: findColumn(headers, (k) => k.includes('birth')),
    school: findColumn(headers, (k) => k.includes('school of attendance')),
    grade: findColumn(headers, (k) => k === 'grade' || k === 'grade level' || k === 'gradelevel'),
    caseManager: findColumn(headers, (k) => k.includes('case manager')),
    serviceCode: findColumn(headers, (k) => k.includes('service code')),
    duration: findColumn(headers, (k) => k.includes('service duration')),
    frequency: findColumn(headers, (k) => k.includes('service frequency')),
  };

  const formatDetected =
    col.serviceCode !== undefined &&
    col.duration !== undefined &&
    col.frequency !== undefined &&
    col.firstName !== undefined &&
    col.lastName !== undefined;
  if (!formatDetected) {
    errors.push({
      row: 0,
      message:
        'This does not look like the SEIS Services report — expected columns like ' +
        '"Special Education Service Code", "Service Duration" and "Service Frequency Code".',
    });
    return { students: [], errors, warnings, metadata: { totalRows: 0, formatDetected } };
  }

  const byStudent = new Map<string, ServicesReportStudent>();
  let totalRows = 0;
  let unreadableRows = 0;

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (row.every((cell) => cell === '')) continue;
    totalRows++;

    const firstName = cellAt(row, col.firstName);
    const lastName = cellAt(row, col.lastName);
    if (!firstName || !lastName) continue;

    const serviceCell = cellAt(row, col.serviceCode);
    const codeMatch = serviceCell.match(/^(\d{3})\b/);
    const durationRaw = cellAt(row, col.duration);
    const minutes = Number.parseInt(durationRaw, 10);
    const frequencyCell = cellAt(row, col.frequency);
    const frequency = parseFrequencyCode(frequencyCell);

    if (!codeMatch || !Number.isFinite(minutes) || minutes <= 0 || !frequency) {
      unreadableRows++;
      if (unreadableRows <= PER_ROW_WARNING_LIMIT) {
        warnings.push({
          row: r + 1,
          message:
            `A service row for ${firstName.charAt(0)}${lastName.charAt(0)} could not be read ` +
            `(service "${serviceCell}", duration "${durationRaw}", frequency "${frequencyCell}") and was skipped.`,
        });
      }
      continue;
    }

    const code = codeMatch[1];
    const nameFromCell = serviceCell.replace(/^\d{3}\s*-\s*/, '').replace(/\s+/g, ' ').trim();
    const line: DistrictServiceLine = {
      code,
      name: nameFromCell || getServiceTypeName(code) || `Service ${code}`,
      minutes,
      frequency,
      weeklyMinutes: toWeeklyMinutes(minutes, frequency),
    };

    const school = cellAt(row, col.school);
    const key = studentKey(firstName, lastName, school);
    const existing = byStudent.get(key);
    if (existing) {
      existing.services.push(line);
      if (!existing.dateOfBirth) existing.dateOfBirth = isoDate(cellAt(row, col.birthDate));
      if (!existing.caseManager) existing.caseManager = cellAt(row, col.caseManager) || undefined;
      if (!existing.gradeLevel) existing.gradeLevel = normalizeGradeLevel(cellAt(row, col.grade));
    } else {
      byStudent.set(key, {
        firstName,
        lastName,
        gradeLevel: normalizeGradeLevel(cellAt(row, col.grade)),
        schoolOfAttendance: school || undefined,
        dateOfBirth: isoDate(cellAt(row, col.birthDate)),
        caseManager: cellAt(row, col.caseManager) || undefined,
        services: [line],
      });
    }
  }

  if (unreadableRows > PER_ROW_WARNING_LIMIT) {
    warnings.push({
      row: 0,
      message: `${unreadableRows - PER_ROW_WARNING_LIMIT} more unreadable service row(s) not listed.`,
    });
  }

  return {
    students: [...byStudent.values()],
    errors,
    warnings,
    metadata: { totalRows, formatDetected },
  };
}

/**
 * "20 - Weekly (one or more times a week)" → 'weekly'. The leading CALPADS code
 * decides; the wording is a fallback for a hand-edited cell.
 */
function parseFrequencyCode(cell: string): ServicePeriod | null {
  const code = cell.match(/^(\d{2})\b/)?.[1];
  switch (code) {
    case '10':
      return 'daily';
    case '20':
      return 'weekly';
    case '30':
      return 'monthly';
    case '40':
      return 'yearly';
  }
  const word = cell.toLowerCase();
  if (word.includes('daily')) return 'daily';
  if (word.includes('weekly')) return 'weekly';
  if (word.includes('monthly')) return 'monthly';
  if (word.includes('yearly') || word.includes('annual')) return 'yearly';
  return null;
}

const studentKey = (firstName: string, lastName: string, school: string): string =>
  [firstName.toLowerCase(), lastName.toLowerCase(), school.toLowerCase()]
    .map((v) => v.replace(/\s+/g, ' ').trim())
    .join('|');

// ---------------------------------------------------------------------------
// 2. Accommodations report — classroom accommodations per student
// ---------------------------------------------------------------------------

/**
 * SEIS IEP Accommodations report: one row per accommodation. The text lives in
 * a picklist column ("Non-Exhaustive List to Consider for Instruction…") whose
 * commonest value is literally "Other", with the real text in "Other Text box
 * 1"/"2"; assessment-accommodation rows use a separate list column and are
 * routed to the student's testing list. The Category column distinguishes
 * accommodations from modifications and other supports — modifications change
 * what is taught, not just how, so the label is kept on the entry.
 */
export async function parseAccommodationsReport(
  buffer: Buffer,
): Promise<DistrictReportResult<AccommodationsReportStudent>> {
  const errors: DistrictReportResult<never>['errors'] = [];
  const warnings: DistrictReportResult<never>['warnings'] = [];
  const grid = await readReportGrid(buffer);

  const headers = grid[0] ?? [];
  const col = {
    districtStudentId: findColumn(headers, (k) => k === 'district id'),
    lastName: findColumn(headers, (k) => k === 'last name'),
    firstName: findColumn(headers, (k) => k === 'first name'),
    dob: findColumn(headers, (k) => k === 'dob' || k.includes('birth')),
    grade: findColumn(headers, (k) => k === 'grade' || k === 'grade level'),
    school: findColumn(headers, (k) => k.includes('school of attendance')),
    caseManager: findColumn(headers, (k) => k.includes('case manager')),
    category: findColumn(headers, (k) => k === 'category'),
    instructionList: findColumn(headers, (k) => k.startsWith('non-exhaustive list')),
    otherText1: findColumn(headers, (k) => k.startsWith('other text box 1')),
    otherText2: findColumn(headers, (k) => k.startsWith('other text box 2')),
    assessmentList: findColumn(
      headers,
      (k) => k.includes('accommodations to consider for assess'),
    ),
  };

  const formatDetected =
    col.category !== undefined &&
    col.instructionList !== undefined &&
    col.otherText1 !== undefined &&
    col.firstName !== undefined &&
    col.lastName !== undefined;
  if (!formatDetected) {
    errors.push({
      row: 0,
      message:
        'This does not look like the SEIS Accommodations report — expected columns like ' +
        '"Category", "Non-Exhaustive List to Consider for Instruction" and "Other Text box 1".',
    });
    return { students: [], errors, warnings, metadata: { totalRows: 0, formatDetected } };
  }

  const byStudent = new Map<string, AccommodationsReportStudent>();
  let totalRows = 0;
  let emptyRows = 0;

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (row.every((cell) => cell === '')) continue;
    totalRows++;

    const firstName = cellAt(row, col.firstName);
    const lastName = cellAt(row, col.lastName);
    if (!firstName || !lastName) continue;

    const school = cellAt(row, col.school);
    const key = studentKey(firstName, lastName, school);
    let student = byStudent.get(key);
    if (!student) {
      student = {
        firstName,
        lastName,
        gradeLevel: normalizeGradeLevel(cellAt(row, col.grade)),
        schoolOfAttendance: school || undefined,
        dateOfBirth: isoDate(cellAt(row, col.dob)),
        caseManager: cellAt(row, col.caseManager) || undefined,
        districtStudentId: cellAt(row, col.districtStudentId) || undefined,
        accommodations: [],
        testingAccommodations: [],
      };
      byStudent.set(key, student);
    } else {
      if (!student.districtStudentId) {
        student.districtStudentId = cellAt(row, col.districtStudentId) || undefined;
      }
      if (!student.dateOfBirth) student.dateOfBirth = isoDate(cellAt(row, col.dob));
      if (!student.caseManager) student.caseManager = cellAt(row, col.caseManager) || undefined;
    }

    // Assessment rows carry their text in their own column and belong on the
    // student's testing list, not among classroom accommodations.
    const assessment = cellAt(row, col.assessmentList).replace(/\s+/g, ' ');
    if (assessment) {
      student.testingAccommodations.push(assessment);
      continue;
    }

    const text = composeAccommodationText(
      cellAt(row, col.instructionList),
      cellAt(row, col.otherText1),
      cellAt(row, col.otherText2),
      cellAt(row, col.category),
    );
    if (text.length === 0) {
      // Category chosen in SEIS, nothing written — a district-side entry gap.
      // 33 such rows in the pilot file; skipping quietly per row, counted once.
      emptyRows++;
      continue;
    }
    student.accommodations.push(...text);
  }

  if (emptyRows > 0) {
    warnings.push({
      row: 0,
      message:
        `${emptyRows} accommodation row(s) in the file have no text written in SEIS and were ` +
        'skipped — worth a cleanup pass in SEIS, but nothing is lost by importing without them.',
    });
  }

  for (const student of byStudent.values()) {
    student.accommodations = dedupe(student.accommodations);
    student.testingAccommodations = dedupe(student.testingAccommodations);
  }

  return {
    students: [...byStudent.values()],
    errors,
    warnings,
    metadata: { totalRows, formatDetected },
  };
}

/**
 * One row's accommodation text. The picklist value is the entry; "Other" (or a
 * blank picklist) means the real text is in the free-text boxes. When BOTH a
 * real picklist value and free text appear, the free text is the IEP team's
 * elaboration — keep both halves together. Box 2 is a second, separate entry.
 */
function composeAccommodationText(
  listValue: string,
  otherText1: string,
  otherText2: string,
  category: string,
): string[] {
  const clean = (v: string) => v.replace(/\s+/g, ' ').trim();
  const list = clean(listValue);
  const other1 = clean(otherText1);
  const other2 = clean(otherText2);

  const entries: string[] = [];
  if (list && !/^other$/i.test(list)) {
    entries.push(other1 ? `${list}: ${other1}` : list);
  } else if (other1) {
    entries.push(other1);
  }
  if (other2) entries.push(other2);

  // Modifications change WHAT is taught, not just how — a teacher reading a
  // flat list needs that distinction kept. "Other Supports" likewise.
  const prefix = /^modification$/i.test(category.trim())
    ? 'Modification: '
    : /^other supports$/i.test(category.trim())
      ? 'Support: '
      : '';
  return entries.map((entry) => `${prefix}${entry}`);
}

// ---------------------------------------------------------------------------
// 3. Student Download — state-testing accommodations per student
// ---------------------------------------------------------------------------

/**
 * SEIS "Student Download" for CAASPP: identity columns, then one column per
 * testing accommodation whose CELL holds a TOMS code when the student has it.
 * The readable name lives in the HEADER — the cell codes (NEA_MT, NEDS_SS…)
 * mean nothing to a person — so entries are built from cleaned header labels.
 * (The companion "TOMS download" file is this same data keyed by SSID alone;
 * it is not accepted, and not needed.)
 */
export async function parseTestingAccommodationsReport(
  buffer: Buffer,
): Promise<DistrictReportResult<TestingReportStudent>> {
  const errors: DistrictReportResult<never>['errors'] = [];
  const warnings: DistrictReportResult<never>['warnings'] = [];
  const grid = await readReportGrid(buffer);

  const headers = grid[0] ?? [];
  const col = {
    firstName: findColumn(headers, (k) => k === 'firstname' || k === 'first name'),
    lastName: findColumn(headers, (k) => k === 'lastname' || k === 'last name'),
    birthdate: findColumn(headers, (k) => k === 'birthdate' || k.includes('birth')),
    school: findColumn(headers, (k) => k === 'school'),
    grade: findColumn(headers, (k) => k === 'gradelevel' || k === 'grade level' || k === 'grade'),
    caseManager: findColumn(headers, (k) => k.includes('case manager')),
  };

  // The accommodation columns: everything marked EMBEDDED / NON-EMBEDDED.
  const accommodationColumns: Array<{ index: number; label: string }> = [];
  for (let i = 0; i < headers.length; i++) {
    if (/\((?:NON-)?EMBEDDED\)/i.test(headers[i])) {
      accommodationColumns.push({ index: i, label: testingAccommodationLabel(headers[i]) });
    }
  }

  const formatDetected =
    col.firstName !== undefined && col.lastName !== undefined && accommodationColumns.length >= 10;
  if (!formatDetected) {
    errors.push({
      row: 0,
      message:
        'This does not look like the SEIS Student Download of testing accommodations — expected ' +
        'FirstName/LastName columns followed by the accommodation columns marked (EMBEDDED) or ' +
        '(NON-EMBEDDED). Note: the TOMS upload file (SSID column only, no names) is the wrong ' +
        'file here — use the Student Download, which carries the student names.',
    });
    return { students: [], errors, warnings, metadata: { totalRows: 0, formatDetected } };
  }

  const students: TestingReportStudent[] = [];
  let totalRows = 0;

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (row.every((cell) => cell === '')) continue;
    totalRows++;

    const firstName = cellAt(row, col.firstName);
    const lastName = cellAt(row, col.lastName);
    if (!firstName || !lastName) continue;

    const labels: string[] = [];
    for (const { index, label } of accommodationColumns) {
      if ((row[index] ?? '').trim() !== '') labels.push(label);
    }

    students.push({
      firstName,
      lastName,
      gradeLevel: normalizeGradeLevel(cellAt(row, col.grade)),
      schoolOfAttendance: cellAt(row, col.school) || undefined,
      dateOfBirth: isoDate(cellAt(row, col.birthdate)),
      caseManager: cellAt(row, col.caseManager) || undefined,
      testingAccommodations: dedupe(labels),
    });
  }

  return { students, errors, warnings, metadata: { totalRows, formatDetected } };
}

/**
 * Header → display label: first line, minus the CAASPP annotations a teacher
 * doesn't need — the leading * (needs an IEP/504), "(ET)", and the
 * "(Computer – E, M, S…)" / "(Paper – …)" applicability lists — with the
 * EMBEDDED/NON-EMBEDDED marker kept, lower-cased, at the end.
 *
 * "Masking (EMBEDDED)\n(Computer – E, M, S…)" → "Masking (embedded)".
 * Exported for tests.
 */
export function testingAccommodationLabel(header: string): string {
  let label = header.replace(/\s+/g, ' ').trim();
  label = label.replace(/^\*\s*/, '');
  label = label.replace(/\(ET\)\s*/gi, '');
  // Applicability annotations, wherever they appear after the name.
  label = label.replace(/\((?:Computer|Paper|PDF)[^)]*\)/gi, ' ');
  const embedded = /\(NON-EMBEDDED\)/i.test(label)
    ? 'non-embedded'
    : /\(EMBEDDED\)/i.test(label)
      ? 'embedded'
      : null;
  label = label.replace(/\((?:NON-)?EMBEDDED\)/gi, ' ');
  label = label.replace(/\s+/g, ' ').replace(/\s+([),])/g, '$1').trim();
  // A dangling connective left by removing the annotations ("… on the" from
  // "PDF on the CAASPP & ELPAC Website") reads as a typo; drop trailing filler.
  label = label.replace(/[\s,–-]*(?:on the|in the)?\s*$/i, '');
  return embedded ? `${label} (${embedded})` : label;
}
