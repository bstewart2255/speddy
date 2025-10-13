// V2 Validator - Lightweight content-only validation
// Much simpler than v1 validator since we only validate content, not structure

import type { V2ContentResponse } from './v2-schema';
import { isV2ContentResponse } from './v2-schema';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate V2 content response
 * Much simpler than v1 - only validate content quality, not structure
 */
export function validateV2Content(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Type check
  if (!isV2ContentResponse(data)) {
    return {
      valid: false,
      errors: ['Invalid content response structure'],
      warnings: [],
    };
  }

  const content = data as V2ContentResponse;

  // Validate questions
  if (content.questions.length === 0) {
    errors.push('Must have at least one question');
  }

  // Check question quality
  for (let i = 0; i < content.questions.length; i++) {
    const q = content.questions[i];

    // Check question text length
    if (q.text.length < 5) {
      warnings.push(`Question ${i + 1}: Text seems too short`);
    }

    // Check answer is not empty
    if (!q.answer || q.answer.trim() === '') {
      errors.push(`Question ${i + 1}: Answer cannot be empty`);
    }

    // Validate multiple choice
    if (q.type === 'multiple-choice') {
      if (!q.choices || q.choices.length !== 4) {
        errors.push(`Question ${i + 1}: Multiple choice must have exactly 4 choices`);
      }

      // Check for letter prefixes (should not have them)
      if (q.choices) {
        for (let j = 0; j < q.choices.length; j++) {
          if (/^[A-D]\)|^[A-D]\./.test(q.choices[j].trim())) {
            errors.push(
              `Question ${i + 1}, Choice ${j + 1}: Remove letter prefix (A, B, C, D)`
            );
          }
        }
      }

      // Check if correct answer is in choices
      if (q.choices && !q.choices.includes(q.answer)) {
        warnings.push(
          `Question ${i + 1}: Answer "${q.answer}" not found in choices. This may be okay if answer is an explanation.`
        );
      }
    }
  }

  // Validate passage if present
  if (content.passage) {
    if (content.passage.length < 50) {
      warnings.push('Passage seems too short (< 50 words)');
    }
  }

  // Validate examples if present
  if (content.examples) {
    for (let i = 0; i < content.examples.length; i++) {
      const ex = content.examples[i];
      if (!ex.problem || ex.problem.trim() === '') {
        errors.push(`Example ${i + 1}: Problem cannot be empty`);
      }
      if (!ex.solution || ex.solution.length === 0) {
        errors.push(`Example ${i + 1}: Solution steps cannot be empty`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Quick validation - just check if structure is valid
 */
export function quickValidate(data: unknown): boolean {
  return isV2ContentResponse(data);
}
