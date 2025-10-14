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
 */
export function normalizeQuestionType(type: string): QuestionType {
  // First try direct enum match
  if (Object.values(QuestionType).includes(type as QuestionType)) {
    return type as QuestionType;
  }

  // Then try legacy mapping
  if (type in LEGACY_TYPE_MAPPINGS) {
    return LEGACY_TYPE_MAPPINGS[type];
  }

  // Default to short answer if unknown
  console.warn(`Unknown question type: ${type}, defaulting to short-answer`);
  return QuestionType.SHORT_ANSWER;
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
