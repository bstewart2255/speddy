// V2 Schema - Simplified content-only schema for template-based generation
// AI generates ONLY content, not structure or formatting

import type { TemplateTopic } from '@/lib/templates/types';
import type { AbilityProfile } from './ability-detector';

/**
 * V2 Content Request - What we send to AI
 */
export interface V2ContentRequest {
  topic: TemplateTopic;
  subjectType: 'ela' | 'math';
  grade: string;
  duration: number;
  problemCount: number;  // Already calculated by template
  studentInitials?: string[];
  abilityProfile?: AbilityProfile;  // Optional: IEP-derived ability profile
}

/**
 * V2 Content Response - What AI returns (content only!)
 */
export interface V2ContentResponse {
  // Optional: Main passage or story (for reading comprehension, word problems)
  passage?: string;

  // Optional: Writing prompt (for writing worksheets)
  prompt?: string;

  // Optional: Example problems with solutions (for showing how to solve)
  examples?: V2Example[];

  // Main content: The questions/problems for students
  questions: V2Question[];

  // Metadata about generation
  metadata: {
    contentGenerated: boolean;
    estimatedDuration: number;
    gradeLevel: string;
  };
}

/**
 * Example problem with solution
 */
export interface V2Example {
  problem: string;
  solution: string[];  // Step-by-step solution
  teachingPoint?: string;  // What to emphasize
}

/**
 * Question or problem for student
 */
export interface V2Question {
  text: string;  // The question/problem text
  type: 'multiple-choice' | 'short-answer' | 'long-answer' | 'fill-blank' | 'true-false' | 'visual-math' | 'math-work';
  answer: string;  // Correct answer

  // Optional fields based on question type
  choices?: string[];  // For multiple choice (exactly 4, NO letter prefixes)
  explanation?: string;  // Why this is the answer
  hints?: string[];  // Optional hints for struggling students
}

/**
 * Type guards
 */
export function isV2ContentResponse(data: any): data is V2ContentResponse {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Must have questions array
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    console.error('V2 validation failed: questions must be a non-empty array');
    return false;
  }

  // Validate each question
  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i];

    if (typeof q.text !== 'string' || q.text.trim() === '') {
      console.error(`V2 validation failed: questions[${i}].text must be a non-empty string`);
      return false;
    }

    const validTypes = ['multiple-choice', 'short-answer', 'long-answer', 'fill-blank', 'true-false', 'visual-math', 'math-work'];
    if (!validTypes.includes(q.type)) {
      console.error(`V2 validation failed: questions[${i}].type must be one of ${validTypes.join(', ')}`);
      return false;
    }

    if (typeof q.answer !== 'string' || q.answer.trim() === '') {
      console.error(`V2 validation failed: questions[${i}].answer must be a non-empty string`);
      return false;
    }

    // Validate multiple choice has exactly 4 choices
    if (q.type === 'multiple-choice') {
      if (!Array.isArray(q.choices) || q.choices.length !== 4) {
        console.error(`V2 validation failed: questions[${i}].choices must have exactly 4 options for multiple-choice`);
        return false;
      }

      // Check for letter prefixes (should NOT have them)
      for (const choice of q.choices) {
        if (/^[A-D]\)|^[A-D]\./.test(choice.trim())) {
          console.error(`V2 validation failed: questions[${i}].choices should not include letter prefixes`);
          return false;
        }
      }
    }
  }

  // Validate metadata
  if (!data.metadata || typeof data.metadata !== 'object') {
    console.error('V2 validation failed: metadata must be an object');
    return false;
  }

  return true;
}
