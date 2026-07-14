/**
 * Parses a grade level string to a numeric grade value
 * @param gradeLevel - The grade level string to parse (e.g., "K", "Kindergarten", "3rd grade", "Grade 5")
 * @param defaultGrade - The default grade to return if parsing fails (default: 3)
 * @returns The numeric grade level (0 for Kindergarten, 1-12 for grades)
 */
export function parseGradeLevel(gradeLevel: string | null | undefined, defaultGrade: number = 3): number {
  if (!gradeLevel) {
    return defaultGrade;
  }

  const gradeStr = String(gradeLevel).trim().toLowerCase();
  
  // Check for transitional kindergarten (TK)
  if (/\b(?:tk|transitional\s*k(?:indergarten)?)\b/.test(gradeStr)) {
    return -1; // TK comes before K (grade 0)
  }

  // Check for kindergarten - match exactly "k" or "kindergarten", with optional "grade " prefix
  // Disallow continuations like "k-4" or "k2"
  if (/^(?:grade\s+)?(?:k|kindergarten)(?:\s|$)/.test(gradeStr)) {
    return 0;
  }

  // Check for pre-k (different from TK)
  if (/\b(?:pre[-\s]?k|pk)\b/.test(gradeStr)) {
    return -2; // PreK comes before TK
  }
  
  // Extract numeric grade
  const gradeMatch = gradeStr.match(/\d+/);
  if (gradeMatch) {
    const grade = parseInt(gradeMatch[0], 10);
    // Validate grade is in reasonable range
    if (grade >= 0 && grade <= 12) {
      return grade;
    }
  }

  return defaultGrade;
}

/**
 * Normalize a free-text grade value to the app's canonical string form
 * (`'TK'`, `'K'`, or `'1'`..`'12'`); returns the trimmed input unchanged when it
 * can't be interpreted.
 *
 * This is the single source of truth for grade-string normalization across the
 * SEIS (XLSX) and CSV import parsers (SPE-240). Both parsers previously carried
 * their own diverging copies:
 *   - both stripped ordinal suffixes (`/TH|ST|ND|RD/`) *before* the spelled-out
 *     number map, which clobbered the words themselves — `FIRST` → `FIR`,
 *     `KINDERGARTEN` → `KIERGARTEN` — so spelled-out grades fell through
 *     unnormalized. The numeric extractor below already ignores ordinal
 *     suffixes (`3RD` → `3`), so that strip is simply removed.
 *   - only the CSV copy applied the SEIS-specific `18` → TK and `0` → K rules;
 *     the SEIS export uses `18` for TK, so both formats now apply them.
 */
export function normalizeGradeLevel(grade: string): string {
  const gradeStr = String(grade ?? '').trim().toUpperCase();

  // Strip a leading/embedded "Grade" label only. Do NOT strip ordinal letters
  // here — see the doc comment; the numeric match below handles "3RD" etc.
  const normalized = gradeStr.replace(/GRADE/i, '').trim();

  if (/^T\.?K\.?$|TRANSITIONAL\s*K|TK/i.test(normalized)) {
    return 'TK';
  }

  if (/^K\.?$|KINDER|KINDERGARTEN/i.test(normalized)) {
    return 'K';
  }

  // Spelled-out ordinals
  const numberWords: { [key: string]: string } = {
    FIRST: '1', SECOND: '2', THIRD: '3', FOURTH: '4',
    FIFTH: '5', SIXTH: '6', SEVENTH: '7', EIGHTH: '8',
    NINTH: '9', TENTH: '10', ELEVENTH: '11', TWELFTH: '12',
  };
  for (const [word, num] of Object.entries(numberWords)) {
    if (normalized.includes(word)) {
      return num;
    }
  }

  // Numeric grade (leading zeros and ordinal suffixes handled by the match)
  const match = normalized.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    if (num === 18) return 'TK'; // SEIS uses 18 for TK / Pre-K
    if (num >= 1 && num <= 12) return String(num);
    if (num === 0) return 'K'; // SEIS uses 0 for Kindergarten
  }

  // Return trimmed original if we couldn't normalize
  return String(grade ?? '').trim();
}