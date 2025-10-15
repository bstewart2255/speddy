// Ability Detector - Determines student ability level from IEP goals or grade
// Uses simple keyword matching and heuristics (no AI calls)

export interface AbilityProfile {
  abilityLevel: string;  // 'K' | '1' | '2' | '3' | '4' | '5'
  focusAreas: string[];  // Max 3 focus areas
  source: 'iep-detection' | 'grade-minus-one' | 'grade-only' | 'grade-with-iep-refinement';
}

export interface Student {
  id: string;
  grade: number | string;
  iepGoals?: string[];
}

// Common skill benchmarks mapped to grade levels
const ELA_BENCHMARKS: Record<string, string | null> = {
  // Phonics patterns
  'cvc': '1',
  'cvce': '2',
  'letter sound': 'K',
  'blend': '1',
  'digraph': '2',
  'multi-syllabic': '3',
  'multisyllabic': '3',
  'prefix': '3',
  'suffix': '3',
  'root word': '4',

  // Fluency (words per minute)
  'wpm': null, // Handle separately with number extraction
  '30 wpm': '1',
  '40 wpm': '1',
  '50 wpm': '2',
  '60 wpm': '2',
  '70 wpm': '2',
  '80 wpm': '3',
  '90 wpm': '3',
  '100 wpm': '3',

  // Comprehension
  'main idea': '2',
  'character': '2',
  'setting': '2',
  'sequence': '2',
  'inference': '3',
  'infer': '3',
  'compare and contrast': '3',
  'cause and effect': '3',
  'author': '4',
  'theme': '4',
  'point of view': '4',

  // Decoding
  'decode': '1',
  'sound out': '1',
  'phonemic awareness': 'K',
  'phonics': '1',
};

const MATH_BENCHMARKS: Record<string, string> = {
  // Number ranges
  'within 5': 'K',
  'within 10': 'K',
  'within 20': '1',
  'within 50': '2',
  'within 100': '2',
  'within 1000': '3',
  'within 10000': '4',

  // Operations
  'count': 'K',
  'add': '1',
  'subtract': '1',
  'addition': '1',
  'subtraction': '1',
  'multiply': '3',
  'multiplication': '3',
  'divide': '3',
  'division': '3',
  'times table': '3',

  // Advanced concepts
  'fraction': '3',
  'decimal': '4',
  'place value': '2',
  'regroup': '2',
  'carry': '2',
  'borrow': '2',
  'word problem': '2',
  'multi-step': '3',
};

// Focus area extraction keywords
const ELA_FOCUS_KEYWORDS: Record<string, string> = {
  'phonics': 'phonics',
  'decode': 'decoding',
  'decoding': 'decoding',
  'fluency': 'fluency',
  'comprehension': 'comprehension',
  'vocabulary': 'vocabulary',
  'writing': 'writing',
  'grammar': 'grammar',
  'main idea': 'main-idea',
  'inference': 'inference',
  'context clue': 'context-clues',
};

const MATH_FOCUS_KEYWORDS: Record<string, string> = {
  'addition': 'addition',
  'subtraction': 'subtraction',
  'multiplication': 'multiplication',
  'division': 'division',
  'fraction': 'fractions',
  'word problem': 'word-problems',
  'place value': 'place-value',
  'measurement': 'measurement',
  'geometry': 'geometry',
  'data': 'data',
};

/**
 * Main entry point: Determine content level from students and/or grade
 */
export function determineContentLevel(
  students: Student[] | undefined,
  selectedGrade: string | undefined,
  subject: 'ela' | 'math'
): AbilityProfile {
  // Scenario 1: Grade only (no students)
  if (!students || students.length === 0) {
    if (!selectedGrade) {
      throw new Error('Must provide either students or grade level');
    }
    return {
      abilityLevel: selectedGrade,
      focusAreas: [],
      source: 'grade-only'
    };
  }

  // Scenario 2: Students only (no grade)
  if (!selectedGrade) {
    return autoDetectFromStudents(students, subject);
  }

  // Scenario 3: Both students AND grade
  return refineWithIEPGoals(students, selectedGrade, subject);
}

/**
 * Auto-detect ability level from student IEP goals
 */
function autoDetectFromStudents(students: Student[], subject: 'ela' | 'math'): AbilityProfile {
  // Collect all IEP goals
  const allGoals = students.flatMap(s => s.iepGoals || []);

  if (allGoals.length > 0) {
    // Try to detect from IEP goals
    const detected = detectFromIEPGoals(allGoals, subject);
    if (detected.level) {
      return {
        abilityLevel: detected.level,
        focusAreas: detected.skills,
        source: 'iep-detection'
      };
    }
  }

  // Fallback: Use student grade - 1 (resource specialist heuristic)
  const avgGrade = Math.round(
    students.reduce((sum, s) => sum + parseGrade(s.grade), 0) / students.length
  );

  return {
    abilityLevel: subtractOneGrade(avgGrade.toString()),
    focusAreas: [],
    source: 'grade-minus-one'
  };
}

/**
 * Refine selected grade with IEP goal insights
 */
function refineWithIEPGoals(
  students: Student[],
  selectedGrade: string,
  subject: 'ela' | 'math'
): AbilityProfile {
  const allGoals = students.flatMap(s => s.iepGoals || []);

  if (allGoals.length === 0) {
    // No IEP goals, just use selected grade
    return {
      abilityLevel: selectedGrade,
      focusAreas: [],
      source: 'grade-only'
    };
  }

  // Extract focus areas from IEP (but keep selected grade as anchor)
  const focusAreas = extractFocusAreas(allGoals, subject);

  return {
    abilityLevel: selectedGrade,
    focusAreas: focusAreas,
    source: 'grade-with-iep-refinement'
  };
}

/**
 * Detect ability level and skills from IEP goal text
 */
function detectFromIEPGoals(
  iepGoals: string[],
  subject: 'ela' | 'math'
): { level: string | null; skills: string[] } {
  const combinedText = iepGoals.join(' ').toLowerCase();
  const benchmarks = subject === 'ela' ? ELA_BENCHMARKS : MATH_BENCHMARKS;

  // Try to match benchmarks
  const matches: { grade: string; confidence: number }[] = [];

  for (const [keyword, grade] of Object.entries(benchmarks)) {
    if (grade && combinedText.includes(keyword.toLowerCase())) {
      // Simple confidence: keyword length (longer = more specific)
      matches.push({ grade, confidence: keyword.length });
    }
  }

  // Sort by confidence and pick highest
  matches.sort((a, b) => b.confidence - a.confidence);
  const detectedLevel = matches.length > 0 ? matches[0].grade : null;

  // Extract skills
  const skills = extractFocusAreas(iepGoals, subject);

  return { level: detectedLevel, skills };
}

/**
 * Extract top 3 focus areas from IEP goals
 */
function extractFocusAreas(iepGoals: string[], subject: 'ela' | 'math'): string[] {
  const combinedText = iepGoals.join(' ').toLowerCase();
  const keywords = subject === 'ela' ? ELA_FOCUS_KEYWORDS : MATH_FOCUS_KEYWORDS;

  const found: string[] = [];

  for (const [keyword, focusArea] of Object.entries(keywords)) {
    if (combinedText.includes(keyword.toLowerCase())) {
      if (!found.includes(focusArea)) {
        found.push(focusArea);
      }
    }

    // Max 3 focus areas
    if (found.length >= 3) break;
  }

  return found;
}

/**
 * Parse grade from various formats
 */
function parseGrade(grade: number | string): number {
  if (typeof grade === 'number') return grade;

  const gradeStr = grade.toString().toUpperCase();

  if (gradeStr === 'K' || gradeStr === 'KINDERGARTEN') return 0;

  const parsed = parseInt(gradeStr, 10);
  return isNaN(parsed) ? 3 : parsed; // Default to 3 if unparseable
}

/**
 * Subtract one grade level (with floor at K)
 */
function subtractOneGrade(grade: string): string {
  const parsed = parseGrade(grade);
  const lower = Math.max(0, parsed - 1);

  return lower === 0 ? 'K' : lower.toString();
}
