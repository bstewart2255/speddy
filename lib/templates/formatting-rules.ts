// Grade-based formatting rules for worksheet generation
// These rules ensure age-appropriate spacing, instructions, and presentation

import type { GradeLevel, FormattingRules } from './types';

// Blank line counts for fill-in responses based on grade
export const BLANK_LINE_COUNTS: Record<string, number> = {
  'K': 5,
  '1': 4,
  '2': 3,
  '3': 3,
  '4': 2,
  '5': 2,
};

// Get blank lines for a grade level
export function getBlankLines(grade: string): number {
  return BLANK_LINE_COUNTS[grade] || 3; // Default to 3 lines
}

// Word count ranges for passages based on grade
export const PASSAGE_WORD_COUNTS: Record<string, { min: number; max: number }> = {
  'K': { min: 50, max: 100 },
  '1': { min: 100, max: 150 },
  '2': { min: 150, max: 250 },
  '3': { min: 200, max: 300 },
  '4': { min: 250, max: 400 },
  '5': { min: 300, max: 500 },
};

// Get passage word count range for a grade
export function getPassageWordCount(grade: string): { min: number; max: number } {
  return PASSAGE_WORD_COUNTS[grade] || { min: 200, max: 300 }; // Default to grade 3
}

// Instruction complexity based on grade
export const INSTRUCTION_STYLES: Record<string, string> = {
  'K': 'very simple',
  '1': 'simple',
  '2': 'simple',
  '3': 'clear',
  '4': 'clear',
  '5': 'detailed',
};

// Get instruction style for a grade
export function getInstructionStyle(grade: string): string {
  return INSTRUCTION_STYLES[grade] || 'clear'; // Default to 'clear'
}

// Sentence complexity for questions based on grade
export const SENTENCE_COMPLEXITY: Record<string, string> = {
  'K': 'very short sentences (5-8 words)',
  '1': 'short sentences (6-10 words)',
  '2': 'simple sentences (8-12 words)',
  '3': 'moderate sentences (10-15 words)',
  '4': 'varied sentences (12-18 words)',
  '5': 'complex sentences (15-20 words)',
};

// Get sentence complexity guideline for a grade
export function getSentenceComplexity(grade: string): string {
  return SENTENCE_COMPLEXITY[grade] || 'moderate sentences (10-15 words)';
}

// Default formatting by grade level
export const DEFAULT_FORMATTING: Record<string, FormattingRules> = {
  'K': {
    numberingStyle: '1.',
    spacing: 'generous',
    showInstructions: true,
  },
  '1': {
    numberingStyle: '1.',
    spacing: 'generous',
    showInstructions: true,
  },
  '2': {
    numberingStyle: '1.',
    spacing: 'normal',
    showInstructions: true,
  },
  '3': {
    numberingStyle: '1.',
    spacing: 'normal',
    showInstructions: true,
  },
  '4': {
    numberingStyle: '1.',
    spacing: 'normal',
    showInstructions: true,
  },
  '5': {
    numberingStyle: '1.',
    spacing: 'compact',
    showInstructions: true,
  },
};

// Get default formatting for a grade
export function getDefaultFormatting(grade: string): FormattingRules {
  return DEFAULT_FORMATTING[grade] || DEFAULT_FORMATTING['3']; // Default to grade 3
}

// Multiple choice formatting rules
export const MULTIPLE_CHOICE_RULES = {
  choiceCount: 4, // Always exactly 4 choices
  useLetterPrefixes: false, // Never use A), B), C), D) prefixes
  presentation: 'Plain text choices without letter prefixes',
};

// Math problem complexity by grade
export const MATH_COMPLEXITY: Record<string, { operations: string[]; numberRange: string }> = {
  'K': {
    operations: ['addition', 'subtraction'],
    numberRange: '0-10',
  },
  '1': {
    operations: ['addition', 'subtraction'],
    numberRange: '0-20',
  },
  '2': {
    operations: ['addition', 'subtraction', 'simple multiplication'],
    numberRange: '0-100',
  },
  '3': {
    operations: ['addition', 'subtraction', 'multiplication', 'division'],
    numberRange: '0-1000',
  },
  '4': {
    operations: ['all four operations', 'multi-digit'],
    numberRange: '0-10000',
  },
  '5': {
    operations: ['all four operations', 'decimals', 'fractions'],
    numberRange: '0-100000',
  },
};

// Get math complexity for a grade
export function getMathComplexity(grade: string): { operations: string[]; numberRange: string } {
  return MATH_COMPLEXITY[grade] || MATH_COMPLEXITY['3']; // Default to grade 3
}

// Reading comprehension question types by grade
export const COMPREHENSION_QUESTION_TYPES: Record<string, string[]> = {
  'K': ['literal recall', 'picture-based'],
  '1': ['literal recall', 'main idea', 'sequence'],
  '2': ['literal recall', 'main idea', 'inference', 'vocabulary'],
  '3': ['literal recall', 'main idea', 'inference', 'vocabulary', 'author\'s purpose'],
  '4': ['literal recall', 'inference', 'theme', 'cause and effect', 'compare and contrast'],
  '5': ['inference', 'theme', 'analysis', 'author\'s craft', 'text structure'],
};

// Get appropriate question types for reading comprehension by grade
export function getComprehensionQuestionTypes(grade: string): string[] {
  return COMPREHENSION_QUESTION_TYPES[grade] || COMPREHENSION_QUESTION_TYPES['3'];
}
