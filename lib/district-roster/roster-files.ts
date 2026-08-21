/**
 * The SEIS exports a district admin uploads, turned into planner input.
 *
 * Every file is read with the SAME parser the per-provider upload uses (or, for
 * the three SPE-575 reports, a header-driven parser with the same refusal
 * posture), so a district-wide export and a per-provider export of the same
 * report can never be understood differently — that divergence is exactly what
 * SPE-558 was.
 *
 * The two original reports stay CSV only, deliberately: SEIS exports both as
 * CSV, and the CSV parser is the one that can tell a Student Goals report from
 * an unrelated spreadsheet. The three SPE-575 reports come OUT of SEIS as
 * .xlsx, so those accept .xlsx (or a CSV re-save); each one's parser refuses a
 * file whose distinctive headers are missing rather than guessing.
 */

import { parseCSVReport } from '@/lib/parsers/csv-parser';
import { parseIepDatesCSV } from '@/lib/parsers/iep-dates-parser';
import {
  parseAccommodationsReport,
  parseServicesReport,
  parseTestingAccommodationsReport,
  type AccommodationsReportStudent,
  type ServicesReportStudent,
  type TestingReportStudent,
} from '@/lib/parsers/district-reports';
import { normalizeGradeLevel } from '@/lib/utils/grade-parser';
import type { RosterDatesRecord, RosterFileStudent } from './plan';

export interface RosterFilesResult {
  goalsStudents: RosterFileStudent[];
  datesRecords: RosterDatesRecord[];
  servicesStudents: ServicesReportStudent[];
  accommodationsStudents: AccommodationsReportStudent[];
  testingStudents: TestingReportStudent[];
  /** Set when a file cannot be used at all. Nothing is planned or written. */
  error: string | null;
  /** Non-fatal notes worth showing the admin above the preview. */
  warnings: string[];
  /** Row/student counts per file, for the review screen and the logs. */
  read: { goals: number; dates: number; services: number; accommodations: number; testing: number };
}

const isCsv = (file: File): boolean =>
  ['text/csv', 'text/plain', 'application/csv'].includes(file.type) ||
  (typeof file.name === 'string' && file.name.toLowerCase().endsWith('.csv'));

const isXlsx = (file: File): boolean =>
  file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
  (typeof file.name === 'string' && file.name.toLowerCase().endsWith('.xlsx'));

/** Cap on how many per-row parser notes ride along to the review screen. */
const WARNING_LIMIT = 20;

function collectWarnings(
  label: string,
  rows: Array<{ row: number; message: string }>,
  into: string[],
): void {
  const shown = rows.slice(0, WARNING_LIMIT);
  for (const w of shown) into.push(`${label}: ${w.message}`);
  if (rows.length > shown.length) {
    into.push(`${label}: ${rows.length - shown.length} more note(s) not listed.`);
  }
}

export interface DistrictRosterUploads {
  goalsFile: File | null;
  datesFile: File | null;
  servicesFile: File | null;
  accommodationsFile: File | null;
  testingFile: File | null;
}

export async function readDistrictRosterFiles(
  files: DistrictRosterUploads,
): Promise<RosterFilesResult> {
  const warnings: string[] = [];
  const read = { goals: 0, dates: 0, services: 0, accommodations: 0, testing: 0 };
  const empty = (error: string): RosterFilesResult => ({
    goalsStudents: [],
    datesRecords: [],
    servicesStudents: [],
    accommodationsStudents: [],
    testingStudents: [],
    error,
    warnings,
    read,
  });

  const anyFile =
    files.goalsFile ||
    files.datesFile ||
    files.servicesFile ||
    files.accommodationsFile ||
    files.testingFile;
  if (!anyFile) {
    return empty('Upload at least one of your SEIS reports.');
  }
  for (const file of [files.goalsFile, files.datesFile]) {
    if (file && !isCsv(file)) {
      return empty(
        `"${file.name}" is not a CSV. Export the Student Goals and IEP Dates reports from SEIS as CSV and upload those files.`,
      );
    }
  }
  for (const file of [files.servicesFile, files.accommodationsFile, files.testingFile]) {
    if (file && !isCsv(file) && !isXlsx(file)) {
      return empty(
        `"${file.name}" is not an Excel or CSV file. Download the report from SEIS and upload it as exported.`,
      );
    }
  }

  const goalsStudents: RosterFileStudent[] = [];
  if (files.goalsFile) {
    const buffer = Buffer.from(await files.goalsFile.arrayBuffer());
    // No providerRole: the district roster keeps every student in the file.
    // Role-based goal routing belongs to the provider's claim, not here.
    const parsed = await parseCSVReport(buffer);

    if (parsed.metadata.formatDetected !== 'seis-student-goals') {
      return empty(
        `"${files.goalsFile.name}" does not look like the SEIS Student Goals report. ` +
          'Upload that report so Speddy can read each student\'s district ID, grade and school.',
      );
    }
    if (parsed.students.length === 0) {
      return empty(
        `"${files.goalsFile.name}" is a Student Goals report but contained no students.`,
      );
    }

    read.goals = parsed.students.length;
    collectWarnings('Student Goals', parsed.errors, warnings);
    collectWarnings('Student Goals', parsed.warnings, warnings);
    for (const student of parsed.students) {
      goalsStudents.push({
        firstName: student.firstName,
        lastName: student.lastName,
        initials: student.initials,
        gradeLevel: student.gradeLevel,
        districtStudentId: student.districtStudentId,
        schoolOfAttendance: student.schoolOfAttendance,
        dateOfBirth: student.dateOfBirth,
        caseManager: student.caseManager,
        iepDate: student.iepDate,
        goalDetails: student.goalDetails,
      });
    }
  }

  const datesRecords: RosterDatesRecord[] = [];
  if (files.datesFile) {
    const buffer = Buffer.from(await files.datesFile.arrayBuffer());
    const parsed = await parseIepDatesCSV(buffer);

    // A wrong-shape file yields zero rows plus a structural error. Say which
    // file, rather than letting it read as "your district has no students".
    if (parsed.records.length === 0) {
      const why = parsed.errors.map((e) => e.message).join('; ');
      return empty(
        `"${files.datesFile.name}" could not be read as the SEIS IEP Dates report` +
          (why ? `: ${why}.` : '.'),
      );
    }

    read.dates = parsed.records.length;
    collectWarnings('IEP Dates', parsed.errors, warnings);
    collectWarnings('IEP Dates', parsed.warnings, warnings);
    for (const record of parsed.records) {
      datesRecords.push({
        firstName: record.firstName,
        lastName: record.lastName,
        // Normalized here because this parser hands back the cell verbatim,
        // while the Goals parser normalizes internally. Without it a
        // dates-only student would be written as "Kindergarten" or "Grade 3"
        // where the rest of Speddy stores 'K' and '3' — and would overwrite an
        // existing child's already-normalized grade with the raw text.
        gradeLevel: normalizeGradeLevel(record.gradeLevel),
        schoolOfAttendance: record.schoolOfAttendance,
        upcomingIepDate: record.upcomingIepDate,
        upcomingTriennialDate: record.upcomingTriennialDate,
      });
    }
  }

  // The three SPE-575 reports share one refusal posture: a format the parser
  // does not positively recognize fails the whole upload, so a wrong file in a
  // slot can never be quietly skipped while the rest publishes.
  let servicesStudents: ServicesReportStudent[] = [];
  if (files.servicesFile) {
    const parsed = await parseServicesReport(Buffer.from(await files.servicesFile.arrayBuffer()));
    if (!parsed.metadata.formatDetected) {
      return empty(`"${files.servicesFile.name}": ${parsed.errors[0]?.message ?? 'unreadable file.'}`);
    }
    servicesStudents = parsed.students;
    read.services = parsed.students.length;
    collectWarnings('Services', parsed.errors, warnings);
    collectWarnings('Services', parsed.warnings, warnings);
  }

  let accommodationsStudents: AccommodationsReportStudent[] = [];
  if (files.accommodationsFile) {
    const parsed = await parseAccommodationsReport(
      Buffer.from(await files.accommodationsFile.arrayBuffer()),
    );
    if (!parsed.metadata.formatDetected) {
      return empty(
        `"${files.accommodationsFile.name}": ${parsed.errors[0]?.message ?? 'unreadable file.'}`,
      );
    }
    accommodationsStudents = parsed.students;
    read.accommodations = parsed.students.length;
    collectWarnings('Accommodations', parsed.errors, warnings);
    collectWarnings('Accommodations', parsed.warnings, warnings);
  }

  let testingStudents: TestingReportStudent[] = [];
  if (files.testingFile) {
    const parsed = await parseTestingAccommodationsReport(
      Buffer.from(await files.testingFile.arrayBuffer()),
    );
    if (!parsed.metadata.formatDetected) {
      return empty(`"${files.testingFile.name}": ${parsed.errors[0]?.message ?? 'unreadable file.'}`);
    }
    testingStudents = parsed.students;
    read.testing = parsed.students.length;
    collectWarnings('Testing accommodations', parsed.errors, warnings);
    collectWarnings('Testing accommodations', parsed.warnings, warnings);
  }

  return {
    goalsStudents,
    datesRecords,
    servicesStudents,
    accommodationsStudents,
    testingStudents,
    error: null,
    warnings,
    read,
  };
}
