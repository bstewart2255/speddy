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

  // Pre-K variants (Pre-Kindergarten, Pre-K, "pre k", PK) must be checked BEFORE
  // the K/KINDER match below, which they would otherwise satisfy ("Pre-Kindergarten"
  // contains "KINDER"). The app has no separate Pre-K student grade — TK is the
  // earliest (the SEIS "18" code likewise stands in for TK/Pre-K) — so they
  // normalize to TK.
  if (/^P\.?K\.?$|PRE[-\s]?K/i.test(normalized)) {
    return 'TK';
  }

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

/** The grade values the app understands. Everything keyed by grade — bell
 *  schedules, school hours, the Add Student dropdown — uses exactly these. */
export const CANONICAL_GRADES: readonly string[] = [
  'TK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
];

const CANONICAL_GRADE_SET = new Set(CANONICAL_GRADES);

/**
 * Whether `normalizeGradeLevel` actually recognised a value, as opposed to
 * handing back the input untouched.
 *
 * SPE-467: SEIS exports grade as a numeric code and we only map the two we
 * learned empirically (`18` → TK, `0` → K) plus `1`–`12`. Every other code
 * falls through the normalizer verbatim and lands in `students.grade_level`,
 * where nothing validates it — there is no CHECK constraint on that column,
 * and the import preserves grade on purpose so confirm cannot clobber a good
 * value. Three students reached production that way carrying grades of `'17'`
 * and `'13'`.
 *
 * Callers use this to tell the user, rather than to reject: a grade we cannot
 * read is still better imported than dropped, and the provider can fix it.
 */
export function isCanonicalGrade(grade: string | null | undefined): boolean {
  return CANONICAL_GRADE_SET.has(String(grade ?? '').trim().toUpperCase());
}

/** Review-screen note for a grade the parser could not interpret (SPE-467). */
export function unrecognizedGradeWarning(initials: string, rawGrade: string): string {
  return (
    `Could not read the grade "${String(rawGrade).trim()}" for ${initials} — it was imported as-is. ` +
    `Speddy matches bell schedules and school hours to students by grade, so neither will apply to ` +
    `this student until the grade is corrected on their record.`
  );
}

/**
 * Review-screen notes for students whose grade the parser could not interpret.
 *
 * Derived from the students rather than emitted while parsing, deliberately.
 * The note says the grade "was imported as-is", so it must only ever describe a
 * student who really is being imported — and the parser cannot know that. Rows
 * are dropped after it runs, by school scoping in the import pipeline, and were
 * a filter ever added downstream this would still hold. Call it with whatever
 * set of students is actually about to be shown.
 *
 * The raw value is recoverable from the student: `normalizeGradeLevel` returns
 * its input untouched precisely when it fails, so `gradeLevel` still carries
 * what the file said.
 */
export function unreadableGradeNotes(
  students: ReadonlyArray<{ initials: string; gradeLevel: string; rawRow: number }>,
): Array<{ row: number; message: string }> {
  return students
    .filter((s) => !isCanonicalGrade(s.gradeLevel))
    .map((s) => ({ row: s.rawRow, message: unrecognizedGradeWarning(s.initials, s.gradeLevel) }));
}