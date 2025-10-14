// Grammar & Vocabulary Template
// Structure: Practice Exercises

import type { WorksheetTemplate, Duration, ProblemCountRange } from '../../types';

export const grammarVocabularyTemplate: WorksheetTemplate = {
  // Metadata
  id: 'grammar-vocabulary',
  name: 'Grammar & Vocabulary',
  description: 'Grammar rules or vocabulary words with practice exercises',
  subjectType: 'ela',

  // Structure: 1 section (practice only)
  sections: [
    {
      title: 'Practice',
      instructions: 'Complete each exercise.',
      slots: [
        {
          type: 'questions',
          count: 'duration-based',
          allowedTypes: ['multiple-choice', 'fill-blank', 'short-answer'],
        },
      ],
    },
  ],

  // Problem count formula
  problemCountFormula: (duration: Duration, grade: string): ProblemCountRange => {
    const baseMin = 6;
    const baseMax = 10;

    const multiplier = duration / 30;

    // Grammar practice can be quicker for older students
    const gradeNum = grade === 'K' ? 0 : parseInt(grade, 10);
    const gradeAdjustment = gradeNum >= 4 ? 1.2 : 1;

    return {
      min: Math.ceil(baseMin * multiplier * gradeAdjustment),
      max: Math.ceil(baseMax * multiplier * gradeAdjustment),
    };
  },

  // Formatting
  formatting: {
    numberingStyle: '1.',
    spacing: 'normal',
    showInstructions: true,
  },

  // Grade-specific adjustments
  gradeAdjustments: {
    'K': { spacing: 'generous' },
    '1': { spacing: 'generous' },
    '5': { spacing: 'compact' },
  },
};
