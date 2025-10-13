// Template Selector - Logic for selecting and configuring templates
// Handles template selection, problem count calculation, and formatting

import type {
  WorksheetTemplate,
  TemplateSelectionParams,
  Duration,
  ProblemCountRange,
  FormattingRules,
} from './types';
import { getTemplate } from './template-registry';
import { getDefaultFormatting } from './formatting-rules';

// Selection result with calculated parameters
export interface TemplateSelection {
  template: WorksheetTemplate;
  problemCount: ProblemCountRange;
  formatting: FormattingRules;
  metadata: {
    topic: string;
    subjectType: string;
    duration: Duration;
    grade: string;
  };
}

/**
 * Select and configure a template based on user input
 */
export function selectTemplate(params: TemplateSelectionParams): TemplateSelection | null {
  const { topic, duration, grade } = params;

  // Get the template
  const template = getTemplate(topic);
  if (!template) {
    console.error(`Template not found for topic: ${topic}`);
    return null;
  }

  // Calculate problem count using template's formula
  const problemCount = template.problemCountFormula(duration, grade);

  // Get formatting rules (template default + grade adjustments)
  const formatting = getFormattingForTemplate(template, grade);

  return {
    template,
    problemCount,
    formatting,
    metadata: {
      topic,
      subjectType: template.subjectType,
      duration,
      grade,
    },
  };
}

/**
 * Get formatting rules for a template with grade adjustments
 */
function getFormattingForTemplate(
  template: WorksheetTemplate,
  grade: string
): FormattingRules {
  // Start with template's default formatting
  let formatting = { ...template.formatting };

  // Apply grade-specific adjustments if they exist
  if (template.gradeAdjustments && template.gradeAdjustments[grade]) {
    formatting = {
      ...formatting,
      ...template.gradeAdjustments[grade],
    };
  }

  // Fall back to grade-level defaults if needed
  const gradeDefaults = getDefaultFormatting(grade);
  return {
    ...gradeDefaults,
    ...formatting,
  };
}

/**
 * Calculate total problem count for a section with duration-based slots
 */
export function calculateSectionProblemCount(
  template: WorksheetTemplate,
  sectionIndex: number,
  totalProblemCount: ProblemCountRange,
  duration: Duration,
  grade: string
): number {
  const section = template.sections[sectionIndex];
  if (!section) return 0;

  // Count how many slots are duration-based
  const durationBasedSlots = section.slots.filter((slot) => slot.count === 'duration-based');
  if (durationBasedSlots.length === 0) {
    // No duration-based slots, return sum of fixed counts
    return section.slots.reduce((sum, slot) => {
      return sum + (typeof slot.count === 'number' ? slot.count : 0);
    }, 0);
  }

  // For duration-based slots, use the middle of the range
  const targetCount = Math.round((totalProblemCount.min + totalProblemCount.max) / 2);

  // Distribute across duration-based slots
  return Math.ceil(targetCount / durationBasedSlots.length);
}

/**
 * Get recommended duration range for a template and grade
 */
export function getRecommendedDuration(
  template: WorksheetTemplate,
  grade: string
): { min: Duration; max: Duration; recommended: Duration } {
  // Most templates work well with 15-45 minute durations
  // K-1 students: 15-30 minutes
  // 2-3 students: 15-45 minutes
  // 4-5 students: 30-60 minutes

  const gradeNum = grade === 'K' ? 0 : parseInt(grade, 10);

  if (gradeNum <= 1) {
    return { min: 15, max: 30, recommended: 15 };
  } else if (gradeNum <= 3) {
    return { min: 15, max: 45, recommended: 30 };
  } else {
    return { min: 30, max: 60, recommended: 45 };
  }
}

/**
 * Validate template selection parameters
 */
export function validateSelectionParams(
  params: TemplateSelectionParams
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate topic
  const template = getTemplate(params.topic);
  if (!template) {
    errors.push(`Invalid topic: ${params.topic}`);
  }

  // Validate subject type matches template
  if (template && template.subjectType !== params.subjectType) {
    errors.push(
      `Subject type mismatch: ${params.subjectType} does not match template subject ${template.subjectType}`
    );
  }

  // Validate duration
  if (![15, 30, 45, 60].includes(params.duration)) {
    errors.push(`Invalid duration: ${params.duration}. Must be 15, 30, 45, or 60 minutes.`);
  }

  // Validate grade
  const validGrades = ['K', '1', '2', '3', '4', '5'];
  if (!validGrades.includes(params.grade)) {
    errors.push(`Invalid grade: ${params.grade}. Must be K, 1, 2, 3, 4, or 5.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
