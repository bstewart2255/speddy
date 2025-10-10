// Reading Comprehension Template
// Structure: Passage + Comprehension Questions

import type { WorksheetTemplate, Duration, ProblemCountRange } from '../../types';

export const readingComprehensionTemplate: WorksheetTemplate = {
  // Metadata
  id: 'reading-comprehension',
  name: 'Reading Comprehension',
  description: 'A reading passage followed by comprehension questions',
  subjectType: 'ela',

  // Structure: 2 sections (passage, then questions)
  sections: [
    {
      title: 'Reading Passage',
      slots: [
        {
          type: 'passage',
          count: 1,
          minLength: 100,  // Adjusted by grade in formatting rules
          maxLength: 500,
        },
      ],
    },
    {
      title: 'Comprehension Questions',
      instructions: 'Read the passage above and answer the following questions.',
      slots: [
        {
          type: 'questions',
          count: 'duration-based',
          allowedTypes: ['multiple-choice', 'short-answer', 'long-answer'],
        },
      ],
    },
  ],

  // Problem count formula
  problemCountFormula: (duration: Duration, grade: string): ProblemCountRange => {
    // Base question counts
    const baseMin = 4;
    const baseMax = 6;

    // Duration multiplier
    const multiplier = duration / 30; // 15min = 0.5x, 30min = 1x, 45min = 1.5x, 60min = 2x

    // Grade adjustment (younger students = fewer questions)
    const gradeNum = grade === 'K' ? 0 : parseInt(grade);
    const gradeAdjustment = gradeNum <= 2 ? 0.8 : 1;

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
