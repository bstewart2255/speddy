/**
 * Client-side file-type detection for the unified "Import Students" flow
 * (SPE-231). Mirrors the server's routing rules so the drop zone can label each
 * dropped file and route it to the correct `/api/import-students` form key
 * without the user naming it.
 *
 * Detection is intentionally lightweight (extension + CSV header signature) so
 * it runs instantly in the browser; the server remains the source of truth for
 * parsing and validation.
 */

export type DetectedImportType =
  | 'seis-report' // SEIS Student/Goals report (xlsx/xls/csv) -> creates students + goals
  | 'deliveries' // SEIS Deliveries CSV -> schedule requirements
  | 'class-list' // Aeries Special Ed class list (txt) -> teacher assignment
  | 'roster-template' // Initials/Grade/Teacher roster CSV
  | 'unknown';

/** The `/api/import-students` multipart form key a type submits under. */
export type ImportFormKey = 'studentsFile' | 'deliveriesFile' | 'classListFile';

export interface ImportTypeMeta {
  /** Form key for server submission, or null if this type isn't server-backed here. */
  formKey: ImportFormKey | null;
  /** Short label for the file chip. */
  label: string;
  /** Additive contribution label (what this file fills in). */
  contribution: string;
}

export const IMPORT_TYPE_META: Record<DetectedImportType, ImportTypeMeta> = {
  'seis-report': { formKey: 'studentsFile', label: 'Student & goals report', contribution: 'students & goals' },
  deliveries: { formKey: 'deliveriesFile', label: 'Deliveries', contribution: 'schedules' },
  'class-list': { formKey: 'classListFile', label: 'Class list', contribution: 'teachers' },
  // Roster template flows through the separate template import for now (SPE-225
  // will route it through this pipeline). No server key here yet.
  'roster-template': { formKey: null, label: 'Roster template', contribution: 'student list' },
  unknown: { formKey: null, label: 'Unrecognized file', contribution: '' },
};

export const ACCEPTED_EXTENSIONS = ['xlsx', 'xls', 'csv', 'txt'] as const;
export const ACCEPT_ATTR = '.xlsx,.xls,.csv,.txt';
export const MAX_FILE_SIZE_MB = 10;

/** Lowercased file extension without the dot (empty string if none). */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Split a CSV header line into normalized cell names: strip a leading UTF-8 BOM,
 * split on commas, drop surrounding quotes, collapse internal whitespace, and
 * lowercase. Deliberately simple — the header signatures we match on
 * ("Sessions / Frequency", "Initials") contain no embedded commas.
 */
export function normalizeHeaderCells(headerLine: string): string[] {
  return headerLine
    .replace(/^﻿/, '')
    .split(',')
    .map((cell) =>
      cell
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
    );
}

/**
 * Classify a file from its name and (for CSVs) its header line. Pure and
 * synchronous so it can be unit-tested against the golden fixtures.
 *
 * Rules mirror the server:
 * - `.txt` -> Aeries class list
 * - `.xlsx` / `.xls` -> SEIS report
 * - `.csv` with a "Sessions / Frequency" column -> Deliveries
 * - `.csv` with Initials + Grade + Teacher columns -> roster template
 * - any other `.csv` -> SEIS Student/Goals report
 * - anything else -> unknown
 */
export function classifyImportFile(fileName: string, csvHeaderLine?: string): DetectedImportType {
  const ext = fileExtension(fileName);

  if (ext === 'txt') return 'class-list';
  if (ext === 'xlsx' || ext === 'xls') return 'seis-report';

  if (ext === 'csv') {
    const headers = normalizeHeaderCells(csvHeaderLine ?? '');
    const has = (name: string) => headers.includes(name);

    if (has('sessions / frequency')) return 'deliveries';
    if (has('initials') && has('grade') && has('teacher')) return 'roster-template';
    return 'seis-report';
  }

  return 'unknown';
}

/**
 * Read a blob as text. Uses the standard `Blob.text()` in browsers and falls
 * back to `FileReader` in environments (e.g. jsdom) that don't implement it.
 */
function readBlobText(blob: Blob): Promise<string> {
  if (typeof (blob as { text?: () => Promise<string> }).text === 'function') {
    return blob.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(blob);
  });
}

/**
 * Detect a File's import type, reading only the first chunk for CSV headers.
 */
export async function detectImportFile(file: File): Promise<DetectedImportType> {
  if (fileExtension(file.name) !== 'csv') {
    return classifyImportFile(file.name);
  }
  // Read just enough to capture the header row, not the whole (up to 10MB) file.
  const headerChunk = await readBlobText(file.slice(0, 8192));
  const firstLine = headerChunk.split(/\r?\n/, 1)[0] ?? '';
  return classifyImportFile(file.name, firstLine);
}
