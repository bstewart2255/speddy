/**
 * Multipart + file parsing for the bulk import preview (SPE-230).
 *
 * Turns the request's multipart form into typed files and school context, and
 * each uploaded file into its typed parse result. Deduplicates the
 * deliveries/class-list parsing that the main and update-only paths previously
 * each open-coded. Parse errors are thrown so each caller keeps its own
 * hard-fail (update-only) vs soft-fail (main) handling.
 */
import { parseSEISReport, ParseResult as SEISParseResult } from '@/lib/parsers/seis-parser';
import { parseCSVReport, ParseResult as CSVParseResult } from '@/lib/parsers/csv-parser';
import { parseDeliveriesCSV, DeliveryRecord } from '@/lib/parsers/deliveries-parser';
import { parseClassListTXT, ClassListStudent } from '@/lib/parsers/class-list-parser';
import { normalizeSchoolName } from '@/lib/import/normalize-school-name';
import { MAX_FILE_SIZE_MB } from '@/lib/import/detect-import-file';

export interface ImportForm {
  studentsFile: File | null;
  deliveriesFile: File | null;
  classListFile: File | null;
  currentSchoolId: string | null;
  currentSchoolSite: string | null;
}

/** Read the multipart form into typed files + school context. */
export async function readImportForm(request: Request): Promise<ImportForm> {
  const formData = await request.formData();
  return {
    studentsFile: formData.get('studentsFile') as File | null,
    deliveriesFile: formData.get('deliveriesFile') as File | null,
    classListFile: formData.get('classListFile') as File | null,
    currentSchoolId: formData.get('currentSchoolId') as string | null,
    currentSchoolSite: formData.get('currentSchoolSite') as string | null,
  };
}

/**
 * Server-side upload-size guard (SPE-260). The UI caps uploads at
 * MAX_FILE_SIZE_MB, but a client bypassing it can POST an arbitrarily large
 * multipart body, and the route buffers each file in memory. Enforce the cap
 * server-side: reject an over-ceiling body by Content-Length *before*
 * formData() buffers it, and reject any individual file over the per-file cap
 * after the form is read.
 */
export const MAX_UPLOAD_FILE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** Ceiling for the whole multipart body: the 3 optional files at the per-file
 *  cap, plus ~1 MB for multipart framing. */
export const MAX_TOTAL_UPLOAD_BYTES = MAX_UPLOAD_FILE_BYTES * 3 + 1024 * 1024;

/** True when the request's Content-Length exceeds the total-body ceiling. */
export function exceedsTotalUploadSize(request: Request): boolean {
  const raw = request.headers?.get?.('content-length');
  const len = raw == null ? NaN : Number(raw);
  return Number.isFinite(len) && len > MAX_TOTAL_UPLOAD_BYTES;
}

/** The first present file over the per-file cap, or null if all are within it. */
export function findOversizedFile(form: ImportForm): File | null {
  for (const file of [form.studentsFile, form.deliveriesFile, form.classListFile]) {
    if (file && typeof file.size === 'number' && file.size > MAX_UPLOAD_FILE_BYTES) {
      return file;
    }
  }
  return null;
}

/** Excel vs CSV detection for the students file, by MIME type or extension. */
export function classifyStudentsFileType(file: File): { isExcel: boolean; isCSV: boolean } {
  const validExcelTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  const validCSVTypes = ['text/csv', 'text/plain', 'application/csv'];

  const isExcel = validExcelTypes.includes(file.type) || file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  const isCSV = validCSVTypes.includes(file.type) || file.name.endsWith('.csv');
  return { isExcel, isCSV };
}

/**
 * Parse the students file to its typed result. Throws the underlying parser
 * error so the caller can shape the format-specific message.
 */
export async function parseStudentsFile(
  file: File,
  opts: { isCSV: boolean; userSchools?: string[]; providerRole?: string }
): Promise<SEISParseResult | CSVParseResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (opts.isCSV) {
    return parseCSVReport(buffer, { userSchools: opts.userSchools, providerRole: opts.providerRole });
  }
  return parseSEISReport(buffer, { providerRole: opts.providerRole });
}

export interface ParsedDeliveries {
  deliveries: Map<string, DeliveryRecord>;
  read: number;
  warnings: Array<{ row: number; message: string }>;
}

/** Parse a Deliveries CSV. Throws on parse failure. */
export async function parseDeliveriesFile(
  file: File,
  opts: { providerRole?: string }
): Promise<ParsedDeliveries> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parseDeliveriesCSV(buffer, { providerRole: opts.providerRole });
  return {
    deliveries: result.deliveries,
    read: result.metadata.uniqueStudents,
    warnings: result.warnings,
  };
}

export interface ParsedClassList {
  students: Map<string, ClassListStudent>;
  read: number;
  warnings: Array<{ row: number; message: string }>;
}

/** Parse an Aeries Class List TXT. Throws on parse failure. */
export async function parseClassListFile(file: File): Promise<ParsedClassList> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parseClassListTXT(buffer);
  return {
    students: result.students,
    read: result.metadata.totalStudents,
    warnings: result.warnings,
  };
}

export interface SchoolFilterResult<T> {
  students: T[];
  filteredOutCount: number;
  filteredOutSchools: string[];
}

/**
 * Scope parsed students to the current school for a multi-school provider.
 * Students without a school-of-attendance are kept (assigned to the current
 * school). `filteredOutSchools` is derived from the ORIGINAL (pre-filter) list,
 * preserving the previous behavior. Returns the filtered list + counts; the
 * caller decides whether an all-filtered-out result is an error.
 */
export function applySchoolFilter<T extends { schoolOfAttendance?: string }>(
  students: T[],
  currentSchoolSite: string | null,
  worksAtMultipleSchools: boolean | null | undefined
): SchoolFilterResult<T> {
  if (!currentSchoolSite || !worksAtMultipleSchools) {
    return { students, filteredOutCount: 0, filteredOutSchools: [] };
  }

  const normalizedCurrentSchool = normalizeSchoolName(currentSchoolSite);
  const beforeCount = students.length;

  const filteredStudents = students.filter(student => {
    // If student has no school info, include them (they'll be assigned to current school)
    if (!student.schoolOfAttendance) return true;
    return normalizeSchoolName(student.schoolOfAttendance) === normalizedCurrentSchool;
  });

  const filteredOutCount = beforeCount - filteredStudents.length;

  let filteredOutSchools: string[] = [];
  if (filteredOutCount > 0) {
    const otherSchools = new Set<string>();
    for (const student of students) {
      if (student.schoolOfAttendance) {
        const studentSchool = normalizeSchoolName(student.schoolOfAttendance);
        if (studentSchool !== normalizedCurrentSchool) {
          otherSchools.add(student.schoolOfAttendance);
        }
      }
    }
    filteredOutSchools = Array.from(otherSchools);
  }

  return { students: filteredStudents, filteredOutCount, filteredOutSchools };
}
