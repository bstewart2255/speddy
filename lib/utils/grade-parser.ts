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
  
  // Check for kindergarten - match exactly "k" or "kindergarten", with optional "grade " prefix
  // Disallow continuations like "k-4" or "k2"
  if (/^(?:grade\s+)?(?:k|kindergarten)(?:\s|$)/.test(gradeStr)) {
    return 0;
  }
  
  // Optional: Check for pre-k / tk (transitional kindergarten)
  // Uncomment if needed:
  // if (/\b(?:pre[-\s]?k|pk|tk)\b/.test(gradeStr)) {
  //   return 0;
  // }
  
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