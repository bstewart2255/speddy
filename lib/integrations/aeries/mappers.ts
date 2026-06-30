/**
 * Aeries SIS API — field mappers (raw Aeries → Speddy-facing shapes).
 *
 * Pure functions, no I/O — easy to unit test. They normalize Aeries' PascalCase
 * records into the camelCase shapes the app consumes, and surface the identity
 * keys (`TeacherNumber`, `StudentID`) needed for dedupe and differential sync.
 *
 * Known model gaps (flagged for the SIS Integration project, SPE-122/123):
 *  - Speddy's `teachers` table has no column for grade range (LowGrade/HighGrade)
 *    or for the stable Aeries `TeacherNumber`. Those are carried on the mapped
 *    object so a later migration can persist them.
 *  - Speddy's `students` model has no Aeries identity column yet; `aeriesStudentId`
 *    is the intended join key for the Renaissance assessment match.
 */

import type {
  MappedAeriesStudent,
  MappedAeriesTeacher,
  RawAeriesProgram,
  RawAeriesStudent,
  RawAeriesTeacher,
} from './types';

/** Special Education program code. */
export const SPED_PROGRAM_CODE = '144';
/** SpEd "being evaluated for services" variant. */
export const SPED_EVALUATION_PROGRAM_CODE = '144x';

/** Trim a string field, returning null for empty/whitespace/undefined. */
function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Aeries marks inactive records with a non-empty `InactiveStatusCode`. An empty
 * string, null, or undefined means active.
 */
function isActive(inactiveStatusCode: string | null | undefined): boolean {
  return !cleanString(inactiveStatusCode);
}

/** Map an Aeries teacher record to Speddy's teacher shape (SPE-123). */
export function mapTeacher(raw: RawAeriesTeacher): MappedAeriesTeacher {
  // Aeries supplies DisplayName (often the last name) plus First/Last. Prefer
  // the explicit First/Last; the mapper does not try to split DisplayName.
  return {
    firstName: cleanString(raw.FirstName),
    lastName: cleanString(raw.LastName) ?? cleanString(raw.DisplayName),
    email: cleanString(raw.EmailAddress),
    room: cleanString(raw.Room),
    lowGrade: typeof raw.LowGrade === 'number' ? raw.LowGrade : null,
    highGrade: typeof raw.HighGrade === 'number' ? raw.HighGrade : null,
    aeriesTeacherNumber: raw.TeacherNumber,
    schoolCode: raw.SchoolCode,
    active: isActive(raw.InactiveStatusCode),
  };
}

/**
 * Map an Aeries teacher list to Speddy teachers, dropping records with no usable
 * name and (by default) inactive teachers.
 */
export function mapTeachers(
  raws: RawAeriesTeacher[],
  options: { includeInactive?: boolean } = {},
): MappedAeriesTeacher[] {
  return raws
    .map(mapTeacher)
    .filter((t) => options.includeInactive || t.active)
    .filter((t) => t.firstName || t.lastName);
}

/** Normalize an Aeries grade (number or string) to Speddy's string grade. */
function normalizeGrade(grade: number | string | undefined): string | null {
  if (grade == null) return null;
  return cleanString(String(grade));
}

/** Map an Aeries student record to Speddy's student shape (SPE-122). */
export function mapStudent(
  raw: RawAeriesStudent,
  options: { beingEvaluated?: boolean } = {},
): MappedAeriesStudent {
  return {
    firstName: cleanString(raw.FirstName),
    lastName: cleanString(raw.LastName),
    grade: normalizeGrade(raw.Grade),
    aeriesStudentId: raw.StudentID,
    stateStudentId: cleanString(raw.StateStudentID),
    schoolCode: raw.SchoolCode,
    beingEvaluated: options.beingEvaluated ?? false,
    active: isActive(raw.InactiveStatusCode),
  };
}

/** True when a program record is a SpEd record (`144` or `144x`). */
export function isSpedProgram(program: RawAeriesProgram): boolean {
  const code = cleanString(program.Code)?.toLowerCase();
  return code === SPED_PROGRAM_CODE || code === SPED_EVALUATION_PROGRAM_CODE;
}

/** True when a program record is the `144x` "being evaluated" variant. */
export function isEvaluationProgram(program: RawAeriesProgram): boolean {
  return cleanString(program.Code)?.toLowerCase() === SPED_EVALUATION_PROGRAM_CODE;
}

/**
 * Build a set of SpEd student IDs (with their evaluation flag) from a list of
 * program records — the join used to filter a school's students down to SpEd.
 */
export function indexSpedStudents(
  programs: RawAeriesProgram[],
): Map<number, { beingEvaluated: boolean }> {
  const index = new Map<number, { beingEvaluated: boolean }>();
  for (const program of programs) {
    if (!isSpedProgram(program)) continue;
    const existing = index.get(program.StudentID);
    const beingEvaluated =
      (existing?.beingEvaluated ?? false) || isEvaluationProgram(program);
    index.set(program.StudentID, { beingEvaluated });
  }
  return index;
}
