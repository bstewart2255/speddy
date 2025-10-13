// Computation Practice Template
// Structure: Examples + Practice Problems

import type { WorksheetTemplate, Duration, ProblemCountRange } from '../../types';

export const computationTemplate: WorksheetTemplate = {
  // Metadata
  id: 'computation',
  name: 'Computation Practice',
  description: 'Examples followed by computation practice problems',
  subjectType: 'math',

  // Structure: 2 sections (examples, then practice)
  sections: [
    {
      title: 'Examples',
      instructions: 'Study these examples carefully.',
      slots: [
        {
          type: 'examples',
          count: 3,  // Always 3 example problems
          allowedTypes: ['visual-math'],
        },
      ],
    },
    {
      title: 'Practice Problems',
      instructions: 'Solve each problem. Show your work.',
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

    // Grade adjustment (younger = fewer problems due to fine motor)
    const gradeNum = grade === 'K' ? 0 : parseInt(grade, 10);
    const gradeAdjustment = gradeNum <= 1 ? 0.6 : gradeNum <= 2 ? 0.8 : 1;

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
