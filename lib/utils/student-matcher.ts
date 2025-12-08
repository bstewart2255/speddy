/**
 * Student Matcher Utility
 * Matches parsed students from Excel to existing students in the database
 */

import { ParsedStudent } from '../parsers/seis-parser';

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
 * Find the best matching student from database
 */
function findBestMatch(
  excelStudent: ParsedStudent,
  databaseStudents: DatabaseStudent[]
): StudentMatch {
  const possibleMatches: Array<{ student: DatabaseStudent; score: number; reasons: string[] }> = [];

  for (const dbStudent of databaseStudents) {
    let score = 0;
    const reasons: string[] = [];

    // Match by initials (most important) - pass first name for smart 3-char matching
    const initialsMatch = compareInitials(excelStudent.initials, dbStudent.initials, excelStudent.firstName);
    if (initialsMatch.matches) {
      score += 50;
      reasons.push(initialsMatch.reason);
    }

    // Match by grade level (very important)
    const gradeMatch = compareGrades(excelStudent.gradeLevel, dbStudent.grade_level);
    if (gradeMatch.matches) {
      score += 40;
      reasons.push(gradeMatch.reason);
    }

    // Match by full name if available (bonus points)
    let nameMatches = false;
    if (dbStudent.first_name && dbStudent.last_name) {
      const nameMatch = compareNames(
        excelStudent.firstName,
        excelStudent.lastName,
        dbStudent.first_name,
        dbStudent.last_name
      );
      if (nameMatch.matches) {
        score += 10;
        reasons.push(nameMatch.reason);
        nameMatches = true;
      }
    }

    // Only consider as a potential duplicate if:
    // 1. Initials match (at least partially), OR
    // 2. Full names match
    // Grade alone is not enough to flag as duplicate
    if (score > 0 && (initialsMatch.matches || nameMatches)) {
      possibleMatches.push({ student: dbStudent, score, reasons });
    }
  }

  // Sort by score (highest first)
  possibleMatches.sort((a, b) => b.score - a.score);

  // No matches found
  if (possibleMatches.length === 0) {
    return {
      excelStudent,
      matchedStudent: null,
      confidence: 'none',
      reason: `No students found with initials "${excelStudent.initials}" in grade "${excelStudent.gradeLevel}"`
    };
  }

  const bestMatch = possibleMatches[0];

  // Determine confidence level
  let confidence: 'high' | 'medium' | 'low';
  let reason: string;

  if (bestMatch.score >= 90) {
    // Perfect match: initials + grade + name
    confidence = 'high';
    reason = bestMatch.reasons.join('; ');
  } else if (bestMatch.score >= 80) {
    // Good match: initials + grade
    confidence = 'high';
    reason = bestMatch.reasons.join('; ');
  } else if (bestMatch.score >= 40 && possibleMatches.length === 1) {
    // Only one possibility
    confidence = 'medium';
    reason = `${bestMatch.reasons.join('; ')} (only match found)`;
  } else if (possibleMatches.length > 1) {
    // Multiple possible matches
    confidence = 'low';
    reason = `Multiple possible matches found. ${bestMatch.reasons.join('; ')} (${possibleMatches.length} total candidates)`;
  } else {
    confidence = 'low';
    reason = bestMatch.reasons.join('; ');
  }

  return {
    excelStudent,
    matchedStudent: bestMatch.student,
    confidence,
    reason,
    allPossibleMatches: possibleMatches.map(m => m.student)
  };
}

/**
 * Compare student initials
 * Supports both 2-char (JS) and 3-char (JoS) initials
 * When comparing 2-char to 3-char, uses the first name to verify the middle character
 */
function compareInitials(
  excelInitials: string,
  dbInitials: string,
  excelFirstName?: string
): { matches: boolean; reason: string } {
  const excel = normalizeInitials(excelInitials);
  const db = normalizeInitials(dbInitials);

  // Exact match
  if (excel === db) {
    return { matches: true, reason: `Initials match: ${excelInitials}` };
  }

  // Check if one is a subset of the other (e.g., "JD" matches "JDM")
  if (excel.length >= 2 && db.length >= 2) {
    if (excel.startsWith(db.substring(0, 2)) || db.startsWith(excel.substring(0, 2))) {
      return { matches: true, reason: `Initials partially match: ${excelInitials} ≈ ${dbInitials}` };
    }
  }

  // Smart 3-char matching: compare 2-char to 3-char initials using first name
  // Example: Excel has "JS" (John Smith), DB has "JoS" -> check if John's 2nd letter is 'o'
  if (excelFirstName && excelFirstName.length >= 2) {
    const excelFirstLetter = excel[0];
    const excelLastLetter = excel[excel.length - 1];
    const dbFirstLetter = db[0];
    const dbLastLetter = db[db.length - 1];
    const firstNameSecondLetter = excelFirstName[1].toUpperCase();

    // Case 1: Excel has 2-char (JS), DB has 3-char (JoS)
    if (excel.length === 2 && db.length === 3) {
      if (excelFirstLetter === dbFirstLetter &&
          excelLastLetter === dbLastLetter &&
          firstNameSecondLetter === db[1]) {
        return {
          matches: true,
          reason: `Initials match with extended format: ${excelInitials} matches ${dbInitials} (verified via first name)`
        };
      }
    }

    // Case 2: Excel has 3-char (JoS), DB has 2-char (JS)
    if (excel.length === 3 && db.length === 2) {
      if (excelFirstLetter === dbFirstLetter &&
          excelLastLetter === dbLastLetter &&
          excel[1] === firstNameSecondLetter) {
        return {
          matches: true,
          reason: `Initials match with extended format: ${excelInitials} matches ${dbInitials}`
        };
      }
    }
  }

  return { matches: false, reason: 'Initials do not match' };
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
 * Normalize initials for comparison
 */
function normalizeInitials(initials: string): string {
  return initials.toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * Normalize grade for comparison
 */
function normalizeGrade(grade: string): string {
  const normalized = grade.toUpperCase().trim();

  if (normalized === 'TK' || normalized === 'TRANSITIONAL KINDERGARTEN') return 'TK';
  if (normalized === 'K' || normalized === 'KINDERGARTEN') return 'K';

  // Extract number
  const match = normalized.match(/\d+/);
  if (match) {
    return match[0];
  }

  return normalized;
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
