// Multiplication Practice Template
// Structure: Practice Problems focused on multiplication

import type { WorksheetTemplate, Duration, ProblemCountRange } from '../../types';

export const multiplicationTemplate: WorksheetTemplate = {
  // Metadata
  id: 'multiplication',
  name: 'Multiplication Practice',
  description: 'Multiplication computation problems',
  subjectType: 'math',

  // Structure: 1 section (practice only)
  sections: [
    {
      title: 'Practice Problems',
      instructions: 'Solve each multiplication problem. Show your work.',
      slots: [
        {
          type: 'problems',
          count: 'duration-based',
          allowedTypes: ['visual-math', 'short-answer'],
        },
      ],
    },
  ],

  // Problem count formula
  problemCountFormula: (duration: Duration, grade: string): ProblemCountRange => {
    // Base problem counts (computation is faster than word problems)
    const baseMin = 8;
    const baseMax = 12;

    // Duration multiplier
    const multiplier = duration / 30;

    // Grade adjustment (younger = fewer problems; multiplication typically starts in grade 2-3)
    const gradeNum = grade === 'K' ? 0 : parseInt(grade, 10);
    const gradeAdjustment = gradeNum <= 2 ? 0.7 : gradeNum <= 3 ? 0.9 : 1;

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
    '2': { spacing: 'generous' },
    '5': { spacing: 'compact' },
  },
};
