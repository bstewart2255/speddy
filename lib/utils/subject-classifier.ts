/**
 * Utility for classifying IEP goals by subject area (Math vs ELA)
 */

// Keywords to identify Math goals in IEP text
const MATH_KEYWORDS = [
  'math', 'mathematics', 'number', 'numeral', 'computation', 'calculate', 
  'algebra', 'geometry', 'fraction', 'decimal', 'percent', 'percentage',
  'add', 'addition', 'subtract', 'subtraction', 'multiply', 'multiplication', 
  'divide', 'division', 'problem solving', 'data', 'measurement', 'measure',
  'equation', 'graph', 'counting', 'quantity', 'arithmetic', 'numerical',
  'ratio', 'proportion', 'statistics', 'probability', 'pattern', 'sequence',
  'place value', 'rounding', 'estimation', 'mental math', 'fact fluency'
];

// Keywords to identify ELA (English Language Arts) goals in IEP text
const ELA_KEYWORDS = [
  'reading', 'writing', 'language', 'english', 'ela', 'literacy',
  'comprehension', 'phonics', 'phonemic', 'vocabulary', 'grammar', 
  'spelling', 'fluency', 'literature', 'text', 'sentence', 'paragraph',
  'decode', 'decoding', 'sight word', 'word recognition', 'phonological',
  'narrative', 'informational', 'argumentative', 'essay', 'story',
  'punctuation', 'capitalization', 'handwriting', 'editing', 'revising',
  'main idea', 'inference', 'summarize', 'retell', 'cite evidence',
  'context clues', 'figurative language', 'theme', 'character', 'plot',
  'speaking', 'listening', 'oral', 'communication', 'presentation'
];

/**
 * Interface for classified IEP goals
 */
export interface ClassifiedIEPGoals {
  hasMathGoals: boolean;
  hasELAGoals: boolean;
  mathGoals: string[];
  elaGoals: string[];
  unclassifiedGoals: string[];
}

/**
 * Classifies a single IEP goal by subject
 * @param goal The IEP goal text to classify
 * @returns Object with boolean flags for math and ELA presence
 */
function classifySingleGoal(goal: string): { isMath: boolean; isELA: boolean } {
  const lowerGoal = goal.toLowerCase();
  
  // Check for math keywords
  const isMath = MATH_KEYWORDS.some(keyword => {
    // Use word boundary matching for better accuracy
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(lowerGoal);
  });
  
  // Check for ELA keywords
  const isELA = ELA_KEYWORDS.some(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(lowerGoal);
  });
  
  return { isMath, isELA };
}

/**
 * Classifies IEP goals by subject area (Math vs ELA)
 * @param iepGoals Array of IEP goal strings
 * @returns ClassifiedIEPGoals object with categorized goals
 */
export function classifyIEPGoalsBySubject(iepGoals: string[] | null | undefined): ClassifiedIEPGoals {
  const result: ClassifiedIEPGoals = {
    hasMathGoals: false,
    hasELAGoals: false,
    mathGoals: [],
    elaGoals: [],
    unclassifiedGoals: []
  };
  
  // Handle null, undefined, or empty array
  if (!iepGoals || !Array.isArray(iepGoals) || iepGoals.length === 0) {
    return result;
  }
  
  // Classify each goal
  iepGoals.forEach(goal => {
    // Skip empty or invalid goals
    if (!goal || typeof goal !== 'string' || goal.trim().length === 0) {
      return;
    }
    
    const classification = classifySingleGoal(goal);
    
    // A goal can be classified as both if it contains keywords from both subjects
    // (e.g., "Use math vocabulary in written explanations")
    if (classification.isMath) {
      result.mathGoals.push(goal);
      result.hasMathGoals = true;
    }
    
    if (classification.isELA) {
      result.elaGoals.push(goal);
      result.hasELAGoals = true;
    }
    
    // If neither math nor ELA, add to unclassified
    if (!classification.isMath && !classification.isELA) {
      result.unclassifiedGoals.push(goal);
    }
  });
  
  return result;
}

/**
 * Checks if a student has IEP goals for a specific subject
 * @param iepGoals Array of IEP goal strings
 * @param subject The subject to check ('math' or 'ela'/'english')
 * @returns boolean indicating if student has goals for that subject
 */
export function hasGoalsForSubject(
  iepGoals: string[] | null | undefined, 
  subject: string
): boolean {
  const classification = classifyIEPGoalsBySubject(iepGoals);
  const lowerSubject = subject.toLowerCase();
  
  if (lowerSubject === 'math' || lowerSubject === 'mathematics') {
    return classification.hasMathGoals;
  }
  
  if (lowerSubject === 'ela' || lowerSubject === 'english' || lowerSubject === 'reading' || lowerSubject === 'writing') {
    return classification.hasELAGoals;
  }
  
  // For other subjects, check if any goals exist (could be unclassified)
  return classification.hasMathGoals || classification.hasELAGoals || classification.unclassifiedGoals.length > 0;
}

/**
 * Filters IEP goals by subject
 * @param iepGoals Array of IEP goal strings
 * @param subject The subject to filter for
 * @returns Array of goals relevant to the subject
 */
export function filterGoalsBySubject(
  iepGoals: string[] | null | undefined,
  subject: string
): string[] {
  const classification = classifyIEPGoalsBySubject(iepGoals);
  const lowerSubject = subject.toLowerCase();
  
  if (lowerSubject === 'math' || lowerSubject === 'mathematics') {
    return classification.mathGoals;
  }
  
  if (lowerSubject === 'ela' || lowerSubject === 'english' || lowerSubject === 'reading' || lowerSubject === 'writing') {
    return classification.elaGoals;
  }
  
  // For other subjects, return all goals
  return iepGoals || [];
}