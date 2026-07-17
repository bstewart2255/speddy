/**
 * Student Matcher Utility
 * Matches parsed students from Excel to existing students in the database
 */

import { ParsedStudent } from '../parsers/seis-parser';
import { normalizeGradeLevel } from './grade-parser';

export interface DatabaseStudent {
  id: string;
  initials: string;
  grade_level: string;
  first_name?: string;
  last_name?: string;
  // For UPSERT comparison
  iep_goals?: string[];
  sessions_per_week?: number;
  minutes_per_session?: number;
  teacher_id?: string;
}

export interface StudentMatch {
  excelStudent: ParsedStudent;
  matchedStudent: DatabaseStudent | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
  allPossibleMatches?: DatabaseStudent[];
}

export interface MatchResult {
  matches: StudentMatch[];
  summary: {
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    noMatch: number;
  };
}

/**
 * Match parsed students to database students
 */
export function matchStudents(
  parsedStudents: ParsedStudent[],
  databaseStudents: DatabaseStudent[]
): MatchResult {
  const matches: StudentMatch[] = [];

  for (const excelStudent of parsedStudents) {
    const match = findBestMatch(excelStudent, databaseStudents);
    matches.push(match);
  }

  // Calculate summary
  const summary = {
    highConfidence: matches.filter(m => m.confidence === 'high').length,
    mediumConfidence: matches.filter(m => m.confidence === 'medium').length,
    lowConfidence: matches.filter(m => m.confidence === 'low').length,
    noMatch: matches.filter(m => m.confidence === 'none').length
  };

  return { matches, summary };
}

/**
 * Find the best matching student from database.
 *
 * Identity is **full name + grade** (SPE-266). Initials are never sufficient to
 * establish a match on their own: they were a privacy-era proxy for identity
 * (when the product avoided storing names), but a lone initials collision could
 * match — and on confirm overwrite — a *different* student who merely shares
 * initials (e.g. a same-initials student at another school). Now that names are
 * stored, a candidate counts as "the same student" only when both the full name
 * and the grade agree. A DB student with no stored name can't be name-matched,
 * so it's treated as a non-match (→ the incoming student is a new insert).
 */
function findBestMatch(
  excelStudent: ParsedStudent,
  databaseStudents: DatabaseStudent[]
): StudentMatch {
  const possibleMatches: Array<{ student: DatabaseStudent; score: number; reasons: string[] }> = [];

  // A full name is required on BOTH sides. Without a first AND last name on the
  // incoming record we can't match by name — and compareNames' fuzzy path would
  // false-match an empty component against any value (`x.startsWith('')` is
  // true), matching the wrong student. So an unnamed incoming record is a new
  // student, never a match.
  if (!excelStudent.firstName?.trim() || !excelStudent.lastName?.trim()) {
    return {
      excelStudent,
      matchedStudent: null,
      confidence: 'none',
      reason: 'Incoming record has no full name — cannot match by name',
    };
  }

  for (const dbStudent of databaseStudents) {
    // A stored name is required to match — no name, no match.
    if (!dbStudent.first_name || !dbStudent.last_name) {
      continue;
    }

    // Grade must agree.
    const gradeMatch = compareGrades(excelStudent.gradeLevel, dbStudent.grade_level);
    if (!gradeMatch.matches) {
      continue;
    }

    // Full name must agree (exact or close, per compareNames).
    const nameMatch = compareNames(
      excelStudent.firstName,
      excelStudent.lastName,
      dbStudent.first_name,
      dbStudent.last_name
    );
    if (!nameMatch.matches) {
      continue;
    }

    // Exact-name matches outrank close-name matches when several qualify.
    const exactName = nameMatch.reason === 'Full name matches';
    possibleMatches.push({
      student: dbStudent,
      score: exactName ? 100 : 80,
      reasons: [nameMatch.reason, gradeMatch.reason],
    });
  }

  // Sort by score (highest first)
  possibleMatches.sort((a, b) => b.score - a.score);

  // No name+grade match → treat as a new student.
  if (possibleMatches.length === 0) {
    return {
      excelStudent,
      matchedStudent: null,
      confidence: 'none',
      reason: `No existing student matches "${excelStudent.firstName} ${excelStudent.lastName}" in grade "${excelStudent.gradeLevel}"`
    };
  }

  const bestMatch = possibleMatches[0];
  const confidence: 'high' | 'medium' = bestMatch.score >= 100 ? 'high' : 'medium';
  const reason =
    possibleMatches.length > 1
      ? `${bestMatch.reasons.join('; ')} (${possibleMatches.length} candidates)`
      : bestMatch.reasons.join('; ');

  return {
    excelStudent,
    matchedStudent: bestMatch.student,
    confidence,
    reason,
    allPossibleMatches: possibleMatches.map(m => m.student)
  };
}

/**
 * Compare grade levels
 */
function compareGrades(
  excelGrade: string,
  dbGrade: string
): { matches: boolean; reason: string } {
  const excel = normalizeGrade(excelGrade);
  const db = normalizeGrade(dbGrade);

  if (excel === db) {
    return { matches: true, reason: `Grade matches: ${excelGrade}` };
  }

  return { matches: false, reason: `Grade mismatch: Excel has "${excelGrade}", database has "${dbGrade}"` };
}

/**
 * Compare full names
 */
function compareNames(
  excelFirst: string,
  excelLast: string,
  dbFirst: string,
  dbLast: string
): { matches: boolean; reason: string } {
  const excelFirstNorm = normalizeName(excelFirst);
  const excelLastNorm = normalizeName(excelLast);
  const dbFirstNorm = normalizeName(dbFirst);
  const dbLastNorm = normalizeName(dbLast);

  // Exact match
  if (excelFirstNorm === dbFirstNorm && excelLastNorm === dbLastNorm) {
    return { matches: true, reason: 'Full name matches' };
  }

  // First name matches, last name similar
  if (excelFirstNorm === dbFirstNorm && isSimilarString(excelLastNorm, dbLastNorm)) {
    return { matches: true, reason: 'Name closely matches' };
  }

  // Last name matches, first name similar
  if (excelLastNorm === dbLastNorm && isSimilarString(excelFirstNorm, dbFirstNorm)) {
    return { matches: true, reason: 'Name closely matches' };
  }

  return { matches: false, reason: 'Names do not match' };
}

/**
 * Normalize grade for comparison.
 *
 * Delegates to the canonical grade normalizer (SPE-240) so this matcher agrees
 * with the import parsers. Critically, legacy `grade_level` values written by
 * the pre-SPE-240 SEIS parser ('18' for TK, '0' for K) now reconcile with the
 * 'TK' / 'K' the parsers emit, so re-imports of those students still match their
 * existing rows instead of being demoted to a new insert.
 */
function normalizeGrade(grade: string): string {
  return normalizeGradeLevel(grade);
}

/**
 * Normalize name for comparison
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z]/g, '');
}

/**
 * Check if two strings are similar (simple Levenshtein-like check)
 */
function isSimilarString(str1: string, str2: string): boolean {
  // If one string starts with the other
  if (str1.startsWith(str2) || str2.startsWith(str1)) {
    return true;
  }

  // If they're within 2 characters of each other in length and share most characters
  if (Math.abs(str1.length - str2.length) <= 2) {
    let matches = 0;
    for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
      if (str1[i] === str2[i]) {
        matches++;
      }
    }
    const similarity = matches / Math.max(str1.length, str2.length);
    return similarity >= 0.8;
  }

  return false;
}
