// Fractions Practice Template
// Structure: Practice Problems focused on fractions

import type { WorksheetTemplate, Duration, ProblemCountRange } from '../../types';

export const fractionsTemplate: WorksheetTemplate = {
  // Metadata
  id: 'fractions',
  name: 'Fractions Practice',
  description: 'Fraction computation and concepts',
  subjectType: 'math',

  // Structure: 1 section (practice only)
  sections: [
    {
      title: 'Practice Problems',
      instructions: 'Solve each fraction problem. Show your work.',
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
    // Fractions take longer than basic operations
    const baseMin = 6;
    const baseMax = 10;

    // Duration multiplier
    const multiplier = duration / 30;

    // Grade adjustment (fractions typically start in grade 3)
    const gradeNum = grade === 'K' ? 0 : parseInt(grade, 10);
    const gradeAdjustment = gradeNum <= 3 ? 0.8 : 1;

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
    '3': { spacing: 'generous' },
    '5': { spacing: 'normal' },
  },
};
