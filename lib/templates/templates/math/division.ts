// Division Practice Template
// Structure: Practice Problems focused on division

import type { WorksheetTemplate, Duration, ProblemCountRange } from '../../types';

export const divisionTemplate: WorksheetTemplate = {
  // Metadata
  id: 'division',
  name: 'Division Practice',
  description: 'Division computation problems',
  subjectType: 'math',

  // Structure: 1 section (practice only)
  sections: [
    {
      title: 'Practice Problems',
      instructions: 'Solve each division problem. Show your work.',
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
    // Division takes longer than other operations
    const baseMin = 6;
    const baseMax = 10;

    // Duration multiplier
    const multiplier = duration / 30;

    // Grade adjustment (division typically starts in grade 3)
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
    '5': { spacing: 'compact' },
  },
};
