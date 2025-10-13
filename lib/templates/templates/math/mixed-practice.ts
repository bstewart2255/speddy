// Mixed Practice Template
// Structure: Review + Mixed Problems (computation + word problems)

import type { WorksheetTemplate, Duration, ProblemCountRange } from '../../types';

export const mixedPracticeTemplate: WorksheetTemplate = {
  // Metadata
  id: 'mixed-practice',
  name: 'Mixed Practice',
  description: 'Mix of computation and word problems for comprehensive review',
  subjectType: 'math',

  // Structure: 3 sections (review, computation, word problems)
  sections: [
    {
      title: 'Warm-Up',
      instructions: 'Solve these quick problems.',
      slots: [
        {
          type: 'examples',
          count: 3,  // 3 warm-up problems
          allowedTypes: ['visual-math'],
        },
      ],
    },
    {
      title: 'Computation',
      instructions: 'Solve each problem.',
      slots: [
        {
          type: 'problems',
          count: 'duration-based',
          allowedTypes: ['visual-math', 'short-answer'],
        },
      ],
    },
    {
      title: 'Word Problems',
      instructions: 'Read carefully and show your work.',
      slots: [
        {
          type: 'problems',
          count: 'duration-based',
          allowedTypes: ['math-work'],
        },
      ],
    },
  ],

  // Problem count formula
  problemCountFormula: (duration: Duration, grade: string): ProblemCountRange => {
    // Mixed practice has more variety
    // 60% computation, 40% word problems
    const baseMin = 6;   // total problems
    const baseMax = 10;

    const multiplier = duration / 30;

    const gradeNum = grade === 'K' ? 0 : parseInt(grade, 10);
    const gradeAdjustment = gradeNum <= 1 ? 0.7 : 1;

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
