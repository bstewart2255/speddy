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
import { parseIepDatesCSV, IepDatesRecord } from '@/lib/parsers/iep-dates-parser';
import { normalizeSchoolName } from '@/lib/import/normalize-school-name';
import { MAX_FILE_SIZE_MB } from '@/lib/import/detect-import-file';

export interface ImportForm {
  studentsFile: File | null;
  deliveriesFile: File | null;
  classListFile: File | null;
  iepDatesFile: File | null;
  currentSchoolId: string | null;
  currentSchoolSite: string | null;
}

/** Read the multipart form into typed files + school context. */
export async function readImportForm(request: Request): Promise<ImportForm> {
  const formData = await readBoundedFormData(request);
  return {
    studentsFile: formData.get('studentsFile') as File | null,
    deliveriesFile: formData.get('deliveriesFile') as File | null,
    classListFile: formData.get('classListFile') as File | null,
    iepDatesFile: formData.get('iepDatesFile') as File | null,
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

/** Ceiling for the whole multipart body: the 4 optional files at the per-file
 *  cap, plus ~1 MB for multipart framing. */
export const MAX_TOTAL_UPLOAD_BYTES = MAX_UPLOAD_FILE_BYTES * 4 + 1024 * 1024;

/**
 * True when the request's Content-Length *declares* a body over the ceiling.
 *
 * This is only a cheap fast path — it rejects an honest oversized upload
 * without reading a byte. It is deliberately NOT the enforcement point: a
 * client that omits Content-Length, uses chunked transfer-encoding, or simply
 * understates the length sails straight through it. The real cap is applied by
 * readImportForm(), which counts the bytes it actually reads (SPE-443).
 */
export function exceedsTotalUploadSize(request: Request): boolean {
  const raw = request.headers?.get?.('content-length');
  const len = raw == null ? NaN : Number(raw);
  return Number.isFinite(len) && len > MAX_TOTAL_UPLOAD_BYTES;
}

/** Thrown by readImportForm when the body read passes MAX_TOTAL_UPLOAD_BYTES. */
export class UploadTooLargeError extends Error {
  constructor(message = 'Upload exceeds the total size ceiling') {
    super(message);
    this.name = 'UploadTooLargeError';
  }
}

/**
 * Buffer the request body, aborting the moment it passes the total ceiling
 * (SPE-443).
 *
 * The Content-Length check above can only act on what the client claims. This
 * counts what the client actually sends, so an unbounded body cannot be
 * buffered into memory by formData() no matter what the headers say. At most
 * one chunk beyond the ceiling is ever held before the read is abandoned.
 *
 * Returns null when the request exposes no readable body — there is then
 * nothing to buffer and so nothing to cap, and the caller reads the form
 * directly.
 */
async function readBodyWithinLimit(request: Request): Promise<Uint8Array | null> {
  const body = request.body;
  if (!body || typeof body.getReader !== 'function') return null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_TOTAL_UPLOAD_BYTES) throw new UploadTooLargeError();
      chunks.push(value);
    }
  } finally {
    // Release the stream so an abandoned read doesn't hold the connection.
    await reader.cancel().catch(() => {});
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

/** Parse the multipart form from a body read under the size ceiling. */
async function readBoundedFormData(request: Request): Promise<FormData> {
  const body = await readBodyWithinLimit(request);
  if (body === null) return request.formData();

  // Re-wrap the bytes actually read, so formData() parses those rather than the
  // now-consumed original stream. Only content-type carries over: it holds the
  // multipart boundary, whereas the original content-length may disagree with
  // what was really sent — which is the whole point of SPE-443.
  const contentType = request.headers?.get?.('content-type') ?? null;
  const bounded = new Request(request.url, {
    method: 'POST',
    ...(contentType ? { headers: { 'content-type': contentType } } : {}),
    body,
  });
  return bounded.formData();
}

/** The first present file over the per-file cap, or null if all are within it. */
export function findOversizedFile(form: ImportForm): File | null {
  for (const file of [form.studentsFile, form.deliveriesFile, form.classListFile, form.iepDatesFile]) {
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
  opts: { isCSV: boolean; providerRole?: string }
): Promise<SEISParseResult | CSVParseResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (opts.isCSV) {
    // No `userSchools` school filter here on purpose: scoping students to the
    // provider's current school is done once, downstream, by applySchoolFilter.
    // See the note in runStudentsPreview (SPE-264).
    return parseCSVReport(buffer, { providerRole: opts.providerRole });
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
  opts: { providerRole?: string; weeklyBucket?: boolean }
): Promise<ParsedDeliveries> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parseDeliveriesCSV(buffer, {
    providerRole: opts.providerRole,
    weeklyBucket: opts.weeklyBucket,
  });
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

export interface ParsedIepDates {
  /** All parsed rows in file order (deduped later, after school scoping). */
  records: IepDatesRecord[];
  read: number;
  warnings: Array<{ row: number; message: string }>;
}

/**
 * Parse a SEIS IEP Dates CSV (SPE-303). Throws on a wholly-invalid file — a
 * wrong-shape or empty file yields zero rows plus a structural error, and the
 * parser records (rather than throws) those, so the wrapper propagates them here
 * instead of reporting a silent successful-but-empty parse. The caller surfaces
 * the throw as a 400 (update-only mode) or a warning (main path), the same way a
 * hard parse failure is handled. Any residual per-row errors ride along as
 * warnings so they aren't dropped either.
 */
export async function parseIepDatesFile(file: File): Promise<ParsedIepDates> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parseIepDatesCSV(buffer);
  if (result.records.length === 0 && result.errors.length > 0) {
    throw new Error(result.errors.map((e) => e.message).join('; '));
  }
  return {
    records: result.records,
    read: result.metadata.uniqueStudents,
    warnings: [...result.warnings, ...result.errors],
  };
}

/**
 * Scope IEP Dates rows to the selected school, then dedupe by normalized name
 * (SPE-303). Order matters: school scoping runs FIRST (via applySchoolFilter,
 * the same helper the goals file uses — rows with a blank School of Attendance
 * are kept), so a same-name student at another school can't shadow the
 * current-school student. Only after filtering do we collapse to one row per
 * name (first-wins), flagging a genuine same-school name collision as a warning
 * rather than silently dropping the loser. Returns the name-keyed map the
 * enrichment lookup uses plus any collision warnings.
 */
export function scopeIepDatesToSchool(
  records: IepDatesRecord[],
  currentSchoolSite: string | null,
  worksAtMultipleSchools: boolean | null | undefined,
): { records: Map<string, IepDatesRecord>; warnings: Array<{ row: number; message: string }> } {
  const { students } = applySchoolFilter(records, currentSchoolSite, worksAtMultipleSchools);
  const map = new Map<string, IepDatesRecord>();
  const warnings: Array<{ row: number; message: string }> = [];
  for (const record of students) {
    if (map.has(record.normalizedName)) {
      warnings.push({
        row: 0,
        message: `Duplicate student "${`${record.firstName} ${record.lastName}`.trim()}" at this school — kept the first row's dates`,
      });
      continue;
    }
    map.set(record.normalizedName, record);
  }
  return { records: map, warnings };
}

export interface SchoolFilterResult<T> {
  students: T[];
  /** The students excluded by school — used to reclassify enrichment rows (e.g.
   *  Deliveries) for other-school students as "filtered out" rather than
   *  "needs review" (SPE-268). Empty when no filtering was applied. */
  filteredOutStudents: T[];
  filteredOutCount: number;
  filteredOutSchools: string[];
}

/**
 * Scope parsed students to the current school for a multi-school provider.
 * Students without a school-of-attendance are kept (assigned to the current
 * school). Returns the kept list, the excluded (filtered-out) list, and derived
 * counts/schools; the caller decides whether an all-filtered-out result is an
 * error.
 */
export function applySchoolFilter<T extends { schoolOfAttendance?: string }>(
  students: T[],
  currentSchoolSite: string | null,
  worksAtMultipleSchools: boolean | null | undefined
): SchoolFilterResult<T> {
  if (!currentSchoolSite || !worksAtMultipleSchools) {
    return { students, filteredOutStudents: [], filteredOutCount: 0, filteredOutSchools: [] };
  }

  const normalizedCurrentSchool = normalizeSchoolName(currentSchoolSite);

  const filteredStudents: T[] = [];
  const filteredOutStudents: T[] = [];
  for (const student of students) {
    // A student with no school info is kept (assigned to the current school).
    const keep =
      !student.schoolOfAttendance ||
      normalizeSchoolName(student.schoolOfAttendance) === normalizedCurrentSchool;
    (keep ? filteredStudents : filteredOutStudents).push(student);
  }

  // Distinct other-school labels (raw casing) come from exactly the excluded
  // students — every filtered-out student has a non-current schoolOfAttendance.
  const filteredOutSchools = Array.from(
    new Set(filteredOutStudents.map(s => s.schoolOfAttendance).filter((s): s is string => !!s))
  );

  return {
    students: filteredStudents,
    filteredOutStudents,
    filteredOutCount: filteredOutStudents.length,
    filteredOutSchools,
  };
}
