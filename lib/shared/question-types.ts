/**
 * Centralized Question Type System
 *
 * Single source of truth for question types, formatting rules, and rendering specifications
 * across all content generation tools (AI Lesson Builder, Exit Tickets, Progress Check, Sample Lessons)
 */

/**
 * Regex pattern to detect phonics questions asking for single sound/letter
 * Matches patterns like "write down the first sound", "write the ending letter", etc.
 */
const PHONICS_SINGLE_SOUND_PATTERN = /write\s+(down\s+)?(the\s+)?(first|last|beginning|ending)\s+(sound|letter)/i;

/**
 * Standardized question types - use these across all modules
 */
export enum QuestionType {
  // Multiple choice with 4 options
  MULTIPLE_CHOICE = 'multiple-choice',

  // Short written response (2-3 lines)
  SHORT_ANSWER = 'short-answer',

  // Long written response (4-6 lines)
  LONG_ANSWER = 'long-answer',

  // Fill in the blank within text
  FILL_BLANK = 'fill-blank',

  // True/False question
  TRUE_FALSE = 'true-false',

  // Math computation (grid layout, minimal work space)
  VISUAL_MATH = 'visual-math',

  // Math word problem (requires work space)
  MATH_WORK = 'math-work',

  // Teacher observation (behavioral/skill demonstration)
  OBSERVATION = 'observation',

  // Text content (passages, instructions - non-question)
  PASSAGE = 'passage',

  // Example problem (teacher-facing only)
  EXAMPLE = 'example',

  // Writing prompt (displays as plain text)
  WRITING_PROMPT = 'writing-prompt',
}

/**
 * Legacy type name mappings for backward compatibility
 */
export const LEGACY_TYPE_MAPPINGS: Record<string, QuestionType> = {
  // Exit Tickets legacy names
  'multiple_choice': QuestionType.MULTIPLE_CHOICE,
  'short_answer': QuestionType.SHORT_ANSWER,
  'fill_in_blank': QuestionType.FILL_BLANK,
  'problem': QuestionType.MATH_WORK,
  'word_problem': QuestionType.MATH_WORK,

  // Progress Check legacy names
  'observation': QuestionType.OBSERVATION,

  // AI Lesson Builder legacy names
  'fill-in-blank': QuestionType.FILL_BLANK,
  'text': QuestionType.PASSAGE,
  'example': QuestionType.EXAMPLE,
};

/**
 * Normalize a question type string to the standard enum value
 * @param type - The type string to normalize
 * @param content - Optional question content for smart type detection
 */
export function normalizeQuestionType(type: string, content?: string): QuestionType {
  let normalizedType: QuestionType | undefined;

  // First try direct enum match
  if (Object.values(QuestionType).includes(type as QuestionType)) {
    normalizedType = type as QuestionType;
  }

  // Try legacy mapping if no direct match
  if (!normalizedType && type in LEGACY_TYPE_MAPPINGS) {
    normalizedType = LEGACY_TYPE_MAPPINGS[type];
  }

  // Default to short answer if still no match
  if (!normalizedType) {
    console.warn(`Unknown question type: ${type}, defaulting to short-answer`);
    normalizedType = QuestionType.SHORT_ANSWER;
  }

  // Apply content-based corrections if content is provided
  return content ? applyContentBasedCorrections(normalizedType, content) : normalizedType;
}

/**
 * Apply content-based type corrections to fix common AI misclassifications
 */
function applyContentBasedCorrections(type: QuestionType, content: string): QuestionType {
  // Priority 1: Oral/verbal tasks should be observations (no written answer)
  // This catches "read out loud", "count aloud", "tell the teacher", etc.
  if ((type === QuestionType.SHORT_ANSWER || type === QuestionType.LONG_ANSWER) && isOralTask(content)) {
    return QuestionType.OBSERVATION;
  }

  // Priority 2: Reading-only tasks should be observations (no written answer)
  // This catches "read the passage" without any follow-up questions
  if ((type === QuestionType.SHORT_ANSWER || type === QuestionType.LONG_ANSWER) && isReadingOnlyTask(content)) {
    return QuestionType.OBSERVATION;
  }

  // Priority 3: Math problems should have work space instead of lines
  // This catches word problems that AI marked as short_answer
  if (type === QuestionType.SHORT_ANSWER && isMathProblem(content)) {
    return QuestionType.MATH_WORK;
  }

  return type;
}

/**
 * Formatting specifications for each question type
 */
export interface QuestionFormatSpec {
  /** Default number of blank lines for answer */
  defaultLines: number;

  /** Whether this type requires a work space box */
  needsWorkSpace: boolean;

  /** Whether this type uses grid layout (for computation) */
  useGridLayout: boolean;

  /** Whether to show question number */
  showNumber: boolean;

  /** Whether this is student-facing (vs teacher-only) */
  studentFacing: boolean;

  /** CSS class for styling */
  cssClass: string;

  /** Human-readable label */
  label: string;
}

/**
 * Format specifications for all question types
 */
export const QUESTION_FORMATS: Record<QuestionType, QuestionFormatSpec> = {
  [QuestionType.MULTIPLE_CHOICE]: {
    defaultLines: 0,
    needsWorkSpace: false,
    useGridLayout: false,
    showNumber: true,
    studentFacing: true,
    cssClass: 'question-multiple-choice',
    label: 'Multiple Choice',
  },

  [QuestionType.SHORT_ANSWER]: {
    defaultLines: 3,
    needsWorkSpace: false,
    useGridLayout: false,
    showNumber: true,
    studentFacing: true,
    cssClass: 'question-short-answer',
    label: 'Short Answer',
  },

  [QuestionType.LONG_ANSWER]: {
    defaultLines: 6,
    needsWorkSpace: false,
    useGridLayout: false,
    showNumber: true,
    studentFacing: true,
    cssClass: 'question-long-answer',
    label: 'Long Answer',
  },

  [QuestionType.FILL_BLANK]: {
    defaultLines: 1,
    needsWorkSpace: false,
    useGridLayout: false,
    showNumber: true,
    studentFacing: true,
    cssClass: 'question-fill-blank',
    label: 'Fill in the Blank',
  },

  [QuestionType.TRUE_FALSE]: {
    defaultLines: 0,
    needsWorkSpace: false,
    useGridLayout: false,
    showNumber: true,
    studentFacing: true,
    cssClass: 'question-true-false',
    label: 'True/False',
  },

  [QuestionType.VISUAL_MATH]: {
    defaultLines: 2,
    needsWorkSpace: false,
    useGridLayout: true, // Use grid for computation
    showNumber: true,
    studentFacing: true,
    cssClass: 'question-visual-math',
    label: 'Math Computation',
  },

  [QuestionType.MATH_WORK]: {
    defaultLines: 5,
    needsWorkSpace: true, // Needs large work space
    useGridLayout: false,
    showNumber: true,
    studentFacing: true,
    cssClass: 'question-math-work',
    label: 'Math Problem',
  },

  [QuestionType.OBSERVATION]: {
    defaultLines: 0,
    needsWorkSpace: false,
    useGridLayout: false,
    showNumber: true,
    studentFacing: true, // Student sees what they need to demonstrate
    cssClass: 'question-observation',
    label: 'Observation',
  },

  [QuestionType.PASSAGE]: {
    defaultLines: 0,
    needsWorkSpace: false,
    useGridLayout: false,
    showNumber: false,
    studentFacing: true,
    cssClass: 'content-passage',
    label: 'Reading Passage',
  },

  [QuestionType.EXAMPLE]: {
    defaultLines: 0,
    needsWorkSpace: false,
    useGridLayout: false,
    showNumber: false,
    studentFacing: false, // Teacher-facing only
    cssClass: 'content-example',
    label: 'Example (Teacher Only)',
  },

  [QuestionType.WRITING_PROMPT]: {
    defaultLines: 0,
    needsWorkSpace: false,
    useGridLayout: false,
    showNumber: false,
    studentFacing: true,
    cssClass: 'question-writing-prompt',
    label: 'Writing Prompt',
  },
};

/**
 * Calculate appropriate line count based on question content and type
 */
export function calculateLineCount(
  type: QuestionType,
  content: string,
  explicitLines?: number
): number {
  // If explicitly specified, use that
  if (explicitLines !== undefined && explicitLines > 0) {
    return Math.min(explicitLines, 20); // Cap at 20 lines
  }

  const format = QUESTION_FORMATS[type];

  // Check if this is a number sequence task before applying workspace rules
  // Number sequence tasks need answer lines, not work space
  if (type === QuestionType.MATH_WORK && isNumberSequenceTask(content)) {
    return 5; // Provide answer lines for sequence writing
  }

  // For types that don't use lines, return 0
  if (!format.studentFacing || format.needsWorkSpace || type === QuestionType.MULTIPLE_CHOICE) {
    return 0;
  }

  // Check content for explicit requirements
  const contentLower = content.toLowerCase();

  // Single letter/sound (phonics)
  if (PHONICS_SINGLE_SOUND_PATTERN.test(content)) {
    return 2;
  }

  // Paragraph count
  const paragraphMatch = content.match(/(\d+)\s+paragraph/i);
  if (paragraphMatch) {
    const count = parseInt(paragraphMatch[1]);
    return Math.min(count * 8, 20);
  }

  // Sentence count
  const sentenceMatch = content.match(/(\d+)(?:-(\d+))?\s+sentence/i);
  if (sentenceMatch) {
    const minCount = parseInt(sentenceMatch[1]);
    const maxCount = sentenceMatch[2] ? parseInt(sentenceMatch[2]) : minCount;
    const avgCount = (minCount + maxCount) / 2;
    return Math.min(Math.ceil(avgCount * 2) + 1, 20);
  }

  // Word count
  const wordMatch = content.match(/(\d+)(?:-(\d+))?\s+word/i);
  if (wordMatch) {
    const minWords = parseInt(wordMatch[1]);
    const maxWords = wordMatch[2] ? parseInt(wordMatch[2]) : minWords;
    const avgWords = (minWords + maxWords) / 2;
    return Math.min(Math.ceil(avgWords / 10) + 2, 20);
  }

  // Content length heuristic
  if (content.length < 50) {
    return format.defaultLines;
  } else if (content.length > 150) {
    return Math.min(format.defaultLines + 4, 12);
  }

  return format.defaultLines;
}

/**
 * Check if a problem is actually a number sequence task (not computation)
 */
export function isNumberSequenceTask(content: string): boolean {
  const patterns = [
    /write\s+(down\s+)?(the\s+)?numbers/i,
    /count\s+(from|to|forward|backwards?)/i,
    /list\s+the\s+numbers/i,
    /write\s+down\s+what\s+you\s+(count|say)/i,
    /start\s+at\s+\d+\s+and\s+count/i,
  ];

  return patterns.some(pattern => pattern.test(content));
}

/**
 * Detect if content is a math problem based on keywords and patterns
 */
export function isMathProblem(content: string): boolean {
  const contentLower = content.toLowerCase();

  // Math operation keywords
  const mathKeywords = [
    'solve', 'calculate', 'add', 'subtract', 'multiply', 'divide',
    'sum', 'difference', 'product', 'quotient', 'total', 'remainder',
    'equation', 'expression', 'how many', 'how much',
  ];

  // Check for math keywords
  const hasMathKeyword = mathKeywords.some(keyword => contentLower.includes(keyword));

  // Check for numbers with math operators (e.g., "5 + 3", "10 - 2")
  const hasMathExpression = /\d+\s*[+\-×÷=<>]\s*\d+/.test(content);

  // Check for word problem patterns with numbers
  const hasNumbersWithContext = /\d+/.test(content) && (
    /apples|books|students|dollars|cents|minutes|hours|feet|inches/.test(contentLower)
  );

  return hasMathKeyword || hasMathExpression || hasNumbersWithContext;
}

/**
 * Detect if task requires oral/verbal performance (should be observation type)
 */
export function isOralTask(content: string): boolean {
  const contentLower = content.toLowerCase();

  const oralPatterns = [
    /\b(read|say|count|recite|speak|tell)\s+(out\s+)?loud(ly)?/i,
    /\bread\s+aloud/i,
    /\bcount\s+(from|to|forward|backward)/i,
    /teacher\s+will\s+(observe|listen|watch)/i,
    /\bdemonstrate\s+(by|to|for)/i,
    /\bshow\s+the\s+teacher/i,
    /\bverbally/i,
    /\borally/i,
  ];

  return oralPatterns.some(pattern => pattern.test(content));
}

/**
 * Detect if task is reading-only without written response
 */
export function isReadingOnlyTask(content: string): boolean {
  const contentLower = content.toLowerCase();

  // Must mention reading
  const hasReadingInstruction = /\b(read|look at|review)\s+(the\s+)?(passage|text|story|paragraph)/i.test(content);

  if (!hasReadingInstruction) {
    return false;
  }

  // Should NOT ask for written output
  const asksForWriting = /(write|list|explain|describe|answer|complete|fill)/i.test(contentLower);

  // Should NOT ask questions
  const asksQuestions = /(\?|what|how|why|when|where|who|which)/i.test(contentLower);

  return hasReadingInstruction && !asksForWriting && !asksQuestions;
}

/**
 * Format multiple computation problems that are crammed on one line
 *
 * Detects patterns like "5+8=____6-4=____8x3=____" and adds line breaks
 * between each problem for better readability.
 *
 * @param content - The question text to format
 * @returns Formatted text with line breaks between computation problems
 */
export function formatMultipleComputationProblems(content: string): string {
  // Pattern to match computation problems: number operator number = blanks
  // Matches: 5+8=____, 12 + 3 = ____, 4×5=_____, etc.
  const computationPattern = /(\d+\s*[+\-×÷x*\/]\s*\d+\s*=\s*_+)/g;

  // Find all computation problems in the content
  const problems = content.match(computationPattern);

  // If we found multiple problems, check if they're adjacent (no line breaks between them)
  if (problems && problems.length > 1) {
    // Check if problems are crammed together (minimal spacing, no line breaks)
    const crammedPattern = /(\d+\s*[+\-×÷x*\/]\s*\d+\s*=\s*_+)\s*(\d+\s*[+\-×÷x*\/])/;

    if (crammedPattern.test(content)) {
      // Insert line break before each problem that follows another
      // This handles: ____6-4 -> ____\n6-4
      let formatted = content.replace(
        /(_+)\s*(\d+\s*[+\-×÷x*\/]\s*\d+\s*=\s*_+)/g,
        '$1\n$2'
      );

      return formatted;
    }
  }

  return content;
}

/**
 * Clean and normalize question content for rendering
 *
 * Applies all content cleaning transformations in the correct order:
 * 1. Remove spatial references (above, below)
 * 2. Format multiple computation problems
 *
 * @param content - The question text to clean
 * @returns Cleaned and formatted question content
 */
export function cleanQuestionContent(content: string): string {
  let cleaned = removeSpatialReferences(content);
  cleaned = formatMultipleComputationProblems(cleaned);
  return cleaned;
}

/**
 * Remove spatial references from question content
 *
 * TODO: Review these replacements for accuracy and edge cases.
 * This is a heuristic approach that removes references to layout positioning
 * (above, below, following, etc.) which may not match actual rendering.
 *
 * @param content - The question text to clean
 * @returns Cleaned text with spatial references removed
 */
export function removeSpatialReferences(content: string): string {
  let cleaned = content;

  // Replace "the [element] below" with just "the [element]"
  cleaned = cleaned.replace(/\b(the\s+(?:passage|text|story|paragraph|image|diagram|table|chart))\s+below\b/gi, '$1');

  // Replace "the [element] above" with just "the [element]"
  cleaned = cleaned.replace(/\b(the\s+(?:passage|text|story|paragraph|image|diagram|table|chart))\s+above\b/gi, '$1');

  // Replace "shown below" or "provided below" with nothing
  cleaned = cleaned.replace(/\s*(?:shown|provided|given)\s+below\b/gi, '');

  // Replace "shown above" or "provided above" with nothing
  cleaned = cleaned.replace(/\s*(?:shown|provided|given)\s+above\b/gi, '');

  // Replace "in the text below" with "in the text"
  cleaned = cleaned.replace(/\bin\s+the\s+(text|passage)\s+below\b/gi, 'in the $1');

  // Replace "in the text above" with "in the text"
  cleaned = cleaned.replace(/\bin\s+the\s+(text|passage)\s+above\b/gi, 'in the $1');

  // Clean up any double spaces created by replacements
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned;
}

/**
 * Strip numbering from AI-generated content (e.g., "1. What is..." -> "What is...")
 */
export function stripQuestionNumber(content: string): string {
  return content.replace(/^\d+\.\s*/, '');
}

/**
 * Standard question type for TypeScript interfaces
 */
export type QuestionTypeString =
  | 'multiple-choice'
  | 'short-answer'
  | 'long-answer'
  | 'fill-blank'
  | 'true-false'
  | 'visual-math'
  | 'math-work'
  | 'observation'
  | 'passage'
  | 'example'
  | 'writing-prompt';

/**
 * Validate that a string is a valid question type
 */
export function isValidQuestionType(type: string): type is QuestionTypeString {
  return Object.values(QuestionType).includes(type as QuestionType) ||
         type in LEGACY_TYPE_MAPPINGS;
}
