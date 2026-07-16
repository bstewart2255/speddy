/**
 * Response shaping for the bulk import preview (SPE-230).
 *
 * Builds the `data` payload (students + summary + receipts + unmatched +
 * parse errors/warnings) for each mode, applying the warning/unmatched slice
 * limits. Pure — telemetry (track/log/perf) stays in the route orchestrator.
 * The returned objects are bound to the shared wire contract via the route's
 * `satisfies BulkPreviewData`.
 */
import type { BulkPreviewData, BulkFileReceipt } from '@/lib/types/student-import';
import type { ClassListStudent } from '@/lib/parsers/class-list-parser';
import type { DeliveryRecord } from '@/lib/parsers/deliveries-parser';
import type { StudentPreview, StudentUpdate, UnmatchedStudent } from '@/lib/import/preview-types';

type Note = { row: number; message: string };

/** Enrichment-file inputs shared by the main and update-only response builders. */
export interface EnrichmentFileInput {
  fileName: string;
  read: number;
  matched: number;
  warnings: Note[];
}

/** UPSERT counts derived from the main/roster preview rows. */
export interface SummaryCounts {
  inserts: number;
  updates: number;
  skips: number;
  withGoalsRemoved: number;
  withSchedule: number;
  withTeacher: number;
}

/** Count insert/update/skip + enrichment/warning flags across preview rows. */
export function summarizePreviews(previews: StudentPreview[]): SummaryCounts {
  return {
    inserts: previews.filter(s => s.action === 'insert').length,
    updates: previews.filter(s => s.action === 'update').length,
    skips: previews.filter(s => s.action === 'skip').length,
    withGoalsRemoved: previews.filter(s => s.goalsRemoved && s.goalsRemoved.length > 0).length,
    withSchedule: previews.filter(s => s.schedule).length,
    withTeacher: previews.filter(s => s.teacher).length,
  };
}

/**
 * Collect unmatched students from deliveries and class list — those parsed from
 * the enrichment files that did not match any preview student. Verbatim.
 */
export function collectUnmatched(
  deliveriesData: Map<string, DeliveryRecord> | null,
  classListData: Map<string, ClassListStudent> | null,
  matchedDeliveryNames: Set<string>,
  matchedClassListNames: Set<string>
): UnmatchedStudent[] {
  const unmatchedStudents: UnmatchedStudent[] = [];

  if (deliveriesData) {
    for (const [normalizedName, record] of deliveriesData) {
      if (!matchedDeliveryNames.has(normalizedName)) {
        unmatchedStudents.push({ name: record.name, source: 'deliveries' });
      }
    }
  }

  if (classListData) {
    for (const [normalizedName, student] of classListData) {
      if (!matchedClassListNames.has(normalizedName)) {
        unmatchedStudents.push({ name: student.name, source: 'classList' });
      }
    }
  }

  return unmatchedStudents;
}

function deliveriesReceipt(input: EnrichmentFileInput): BulkFileReceipt {
  return {
    fileKey: 'deliveriesFile',
    fileName: input.fileName,
    read: input.read,
    matched: input.matched,
    filtered: Math.max(0, input.read - input.matched),
    notes: input.warnings,
  };
}

function classListReceipt(input: EnrichmentFileInput): BulkFileReceipt {
  return {
    fileKey: 'classListFile',
    fileName: input.fileName,
    read: input.read,
    matched: input.matched,
    filtered: Math.max(0, input.read - input.matched),
    notes: input.warnings,
  };
}

/** Build the `data` payload for the main SEIS/CSV goals path. */
export function buildMainPreviewData(params: {
  studentPreviews: StudentPreview[];
  studentsFileName: string;
  parsedStudentCount: number;
  parseWarnings: Note[];
  parseErrors: Note[];
  filteredOutCount: number;
  filteredOutSchools: string[];
  deliveries: EnrichmentFileInput | null;
  classList: EnrichmentFileInput | null;
  unmatchedStudents: UnmatchedStudent[];
}): BulkPreviewData {
  const {
    studentPreviews, studentsFileName, parsedStudentCount, parseWarnings, parseErrors,
    filteredOutCount, filteredOutSchools, deliveries, classList, unmatchedStudents,
  } = params;

  const counts = summarizePreviews(studentPreviews);

  // Combine all warnings
  const allWarnings = [
    ...parseWarnings,
    ...(deliveries?.warnings || []).map(w => ({ ...w, source: 'deliveries' as const })),
    ...(classList?.warnings || []).map(w => ({ ...w, source: 'classList' as const })),
  ];

  // SPE-227: per-file receipts. The student goals file is always present; the
  // goals file may have been filtered in place (school scoping), so `read` adds
  // back `filteredOutCount` to reflect what the file actually contained.
  const files: BulkFileReceipt[] = [];
  files.push({
    fileKey: 'studentsFile',
    fileName: studentsFileName,
    read: parsedStudentCount + filteredOutCount,
    matched: studentPreviews.length,
    filtered: filteredOutCount,
    notes: parseWarnings,
  });
  if (deliveries) files.push(deliveriesReceipt(deliveries));
  if (classList) files.push(classListReceipt(classList));

  return {
    students: studentPreviews,
    summary: {
      total: studentPreviews.length,
      inserts: counts.inserts,
      updates: counts.updates,
      skips: counts.skips,
      withGoalsRemoved: counts.withGoalsRemoved,
      withSchedule: counts.withSchedule,
      withTeacher: counts.withTeacher,
      filteredOutBySchool: filteredOutCount,
      filteredOutSchools: filteredOutSchools.length > 0 ? filteredOutSchools : undefined,
    },
    unmatchedStudents: unmatchedStudents.length > 0 ? unmatchedStudents.slice(0, 20) : [],
    parseErrors: parseErrors.length > 0 ? parseErrors.slice(0, 10) : [],
    parseWarnings: allWarnings.length > 0 ? allWarnings.slice(0, 10) : [],
    files,
  };
}

/** Build the `data` payload for the deliveries/class-list update-only path. */
export function buildUpdatePreviewData(params: {
  studentUpdates: StudentUpdate[];
  unmatchedStudents: UnmatchedStudent[];
  deliveries: EnrichmentFileInput | null;
  classList: EnrichmentFileInput | null;
}): BulkPreviewData {
  const { studentUpdates, unmatchedStudents, deliveries, classList } = params;

  const allWarnings = [
    ...(deliveries?.warnings || []).map(w => ({ ...w, source: 'deliveries' as const })),
    ...(classList?.warnings || []).map(w => ({ ...w, source: 'classList' as const })),
  ];

  // SPE-227: per-file receipts. Only deliveries and/or class list apply here —
  // there is no student goals file in this mode.
  const files: BulkFileReceipt[] = [];
  if (deliveries) files.push(deliveriesReceipt(deliveries));
  if (classList) files.push(classListReceipt(classList));

  return {
    // SPE-227: mirror the top-level `mode` inside `data` so the client keeps it.
    mode: 'update',
    files,
    students: studentUpdates,
    summary: {
      total: studentUpdates.length,
      inserts: 0,
      updates: studentUpdates.length,
      skips: 0,
      withSchedule: studentUpdates.filter(s => s.schedule).length,
      withTeacher: studentUpdates.filter(s => s.teacher).length,
    },
    unmatchedStudents: unmatchedStudents.length > 0 ? unmatchedStudents.slice(0, 20) : [],
    parseErrors: [],
    parseWarnings: allWarnings.length > 0 ? allWarnings.slice(0, 10) : [],
  };
}

/** Build the `data` payload for the Speddy roster-template path. */
export function buildRosterPreviewData(params: {
  studentPreviews: StudentPreview[];
  studentsFileName: string;
  parsedStudentCount: number;
  parseWarnings: Note[];
}): BulkPreviewData {
  const { studentPreviews, studentsFileName, parsedStudentCount, parseWarnings } = params;

  const insertCount = studentPreviews.filter(s => s.action === 'insert').length;
  const updateCount = studentPreviews.filter(s => s.action === 'update').length;
  const skipCount = studentPreviews.filter(s => s.action === 'skip').length;

  // SPE-227: single-file receipt — the roster template is the only uploaded file.
  const files: BulkFileReceipt[] = [
    {
      fileKey: 'studentsFile',
      fileName: studentsFileName,
      read: parsedStudentCount,
      matched: studentPreviews.length,
      // Every parsed row becomes a preview on the roster path (matched === read),
      // so nothing is filtered out. Unparseable rows surface via `notes`; counting
      // them here would break the receipt's read = matched + filtered invariant.
      filtered: 0,
      notes: parseWarnings,
    },
  ];

  return {
    files,
    students: studentPreviews,
    summary: {
      total: studentPreviews.length,
      inserts: insertCount,
      updates: updateCount,
      skips: skipCount,
      withGoalsRemoved: 0,
      withSchedule: studentPreviews.filter(s => s.schedule).length,
      withTeacher: studentPreviews.filter(s => s.teacher?.teacherId).length,
    },
    unmatchedStudents: [],
    parseErrors: [],
    parseWarnings: parseWarnings.length > 0 ? parseWarnings.slice(0, 10) : [],
  };
}
