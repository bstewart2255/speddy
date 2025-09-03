// lib/utils/grade-level.ts

/**
 * Standardizes grade level format across the system
 * Converts various grade formats to a consistent format
 * 
 * @param grade - The grade level in any format (e.g., "4th Grade", "Grade 4", "4", "fourth")
 * @returns The standardized grade level (e.g., "4") or null if invalid
 */
export function standardizeGradeLevel(grade: string | null | undefined): string | null {
  if (!grade) return null;
  
  const gradeStr = grade.toString().toLowerCase().trim();
  
  // Handle pre-K first (must come before kindergarten check)
  if (gradeStr.includes('pre') && (gradeStr.includes('k') || gradeStr.includes('kind'))) {
    return 'PreK';
  }
  
  // Handle kindergarten
  if (gradeStr.includes('kind') || gradeStr === 'k') {
    return 'K';
  }
  
  // Extract numeric grade
  const numericMatch = gradeStr.match(/\d+/);
  if (numericMatch) {
    const gradeNum = parseInt(numericMatch[0]);
    if (gradeNum >= 1 && gradeNum <= 12) {
      return gradeNum.toString();
    }
  }
  
  // Handle written numbers
  const writtenNumbers: Record<string, string> = {
    'first': '1',
    'second': '2',
    'third': '3',
    'fourth': '4',
    'fifth': '5',
    'sixth': '6',
    'seventh': '7',
    'eighth': '8',
    'ninth': '9',
    'tenth': '10',
    'eleventh': '11',
    'twelfth': '12'
  };
  
  for (const [written, numeric] of Object.entries(writtenNumbers)) {
    if (gradeStr.includes(written)) {
      return numeric;
    }
  }
  
  return null;
}

/**
 * Formats a standardized grade level for display
 * 
 * @param standardizedGrade - The standardized grade (e.g., "4", "K")
 * @returns The formatted grade for display (e.g., "4th Grade", "Kindergarten")
 */
export function formatGradeLevel(standardizedGrade: string | null | undefined): string {
  if (!standardizedGrade) return 'Unknown Grade';
  
  if (standardizedGrade === 'K') {
    return 'Kindergarten';
  }
  
  if (standardizedGrade === 'PreK') {
    return 'Pre-Kindergarten';
  }
  
  const gradeNum = parseInt(standardizedGrade);
  if (!isNaN(gradeNum)) {
    const suffix = getOrdinalSuffix(gradeNum);
    return `${gradeNum}${suffix} Grade`;
  }
  
  return standardizedGrade;
}

/**
 * Gets the ordinal suffix for a number
 */
function getOrdinalSuffix(num: number): string {
  const lastDigit = num % 10;
  const lastTwoDigits = num % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return 'th';
  }
  
  switch (lastDigit) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/**
 * Compares two grade levels
 * 
 * @returns negative if grade1 < grade2, positive if grade1 > grade2, 0 if equal
 */
export function compareGradeLevels(grade1: string, grade2: string): number {
  const std1 = standardizeGradeLevel(grade1);
  const std2 = standardizeGradeLevel(grade2);
  
  if (!std1 || !std2) return 0;
  
  // Handle special grades
  const gradeOrder: Record<string, number> = {
    'PreK': -1,
    'K': 0
  };
  
  const order1 = gradeOrder[std1] ?? parseInt(std1);
  const order2 = gradeOrder[std2] ?? parseInt(std2);
  
  // Check for NaN in case of non-numeric standardized grades
  if (isNaN(order1) || isNaN(order2)) return 0;
  
  return order1 - order2;
}