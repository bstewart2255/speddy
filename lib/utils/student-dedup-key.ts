import { normalizeGradeLevel } from './grade-parser';

/**
 * Normalize initials for a duplicate-detection key: uppercase, letters only.
 * Mirrors the confirm route's `initialsNormalized` derivation so keys built
 * from stored DB rows and from an incoming import compare equal.
 */
export function normalizeInitialsForKey(initials: string | null | undefined): string {
  return String(initials ?? '').toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * Build the `INITIALS-GRADE` duplicate-detection key used by the import confirm
 * route. Both components are normalized so a key built from a stored DB row and
 * one built from an incoming import compare equal even when a legacy record
 * carries a raw SEIS grade — `students.grade_level` was `'18'` (TK) / `'0'` (K)
 * for students imported before SPE-240 normalized those to `'TK'` / `'K'`.
 *
 * Without this, a stored `'JS-18'` and an incoming `'JS-TK'` are treated as
 * different students, so a re-import can create a duplicate (the DB unique index
 * `ux_students_provider_grade_initials`, keyed on the raw `grade_level`, can't
 * catch `'TK'` vs `'18'` either).
 */
export function buildStudentDedupKey(
  initials: string | null | undefined,
  gradeLevel: string | null | undefined,
): string {
  return `${normalizeInitialsForKey(initials)}-${normalizeGradeLevel(String(gradeLevel ?? ''))}`;
}
