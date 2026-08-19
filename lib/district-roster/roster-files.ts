/**
 * The two SEIS exports a district admin uploads, turned into planner input.
 *
 * Both files are read with the SAME parsers the per-provider upload uses, so a
 * district-wide export and a per-provider export of the same report can never
 * be understood differently — that divergence is exactly what SPE-558 was.
 *
 * CSV only, deliberately. SEIS exports both reports as CSV, and the CSV parser
 * is the one that can tell a Student Goals report from an unrelated
 * spreadsheet. Accepting a re-saved .xlsx would mean importing a district's
 * whole roster from a file we cannot positively identify.
 */

import { parseCSVReport } from '@/lib/parsers/csv-parser';
import { parseIepDatesCSV } from '@/lib/parsers/iep-dates-parser';
import { normalizeGradeLevel } from '@/lib/utils/grade-parser';
import type { RosterDatesRecord, RosterFileStudent } from './plan';

export interface RosterFilesResult {
  goalsStudents: RosterFileStudent[];
  datesRecords: RosterDatesRecord[];
  /** Set when a file cannot be used at all. Nothing is planned or written. */
  error: string | null;
  /** Non-fatal notes worth showing the admin above the preview. */
  warnings: string[];
  /** Row/student counts per file, for the review screen and the logs. */
  read: { goals: number; dates: number };
}

const isCsv = (file: File): boolean =>
  ['text/csv', 'text/plain', 'application/csv'].includes(file.type) ||
  (typeof file.name === 'string' && file.name.toLowerCase().endsWith('.csv'));

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

export async function readDistrictRosterFiles(files: {
  goalsFile: File | null;
  datesFile: File | null;
}): Promise<RosterFilesResult> {
  const warnings: string[] = [];
  const empty = (error: string): RosterFilesResult => ({
    goalsStudents: [],
    datesRecords: [],
    error,
    warnings,
    read: { goals: 0, dates: 0 },
  });

  if (!files.goalsFile && !files.datesFile) {
    return empty('Upload your SEIS Student Goals report, your IEP Dates report, or both.');
  }
  for (const file of [files.goalsFile, files.datesFile]) {
    if (file && !isCsv(file)) {
      return empty(
        `"${file.name}" is not a CSV. Export both reports from SEIS as CSV and upload those files.`,
      );
    }
  }

  const goalsStudents: RosterFileStudent[] = [];
  let goalsRead = 0;
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

    goalsRead = parsed.students.length;
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
        caseManager: student.caseManager,
      });
    }
  }

  const datesRecords: RosterDatesRecord[] = [];
  let datesRead = 0;
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

    datesRead = parsed.records.length;
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

  return {
    goalsStudents,
    datesRecords,
    error: null,
    warnings,
    read: { goals: goalsRead, dates: datesRead },
  };
}
