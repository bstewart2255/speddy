// Word Problems Template
// Structure: Examples + Practice Word Problems

import type { WorksheetTemplate, Duration, ProblemCountRange } from '../../types';

export const wordProblemsTemplate: WorksheetTemplate = {
  // Metadata
  id: 'word-problems',
  name: 'Word Problems',
  description: 'Story-based math problems with examples',
  subjectType: 'math',

  // Structure: 2 sections (examples, practice)
  sections: [
    {
      title: 'Example Problems',
      instructions: 'Study how these problems are solved.',
      slots: [
        {
          type: 'examples',
          count: 2,  // 2 worked examples
          allowedTypes: ['long-answer'],
        },
      ],
    },
    {
      title: 'Practice Problems',
      instructions: 'Solve each word problem. Show your work.',
      slots: [
        {
          type: 'problems',
          count: 'duration-based',
          allowedTypes: ['long-answer'],
        },
      ],
    },
  ],

  // Problem count formula
  problemCountFormula: (duration: Duration, grade: string): ProblemCountRange => {
    // Word problems take longer than computation
    const baseMin = 4;
    const baseMax = 6;

    const multiplier = duration / 30;

    // Younger students = fewer word problems (reading complexity)
    const gradeNum = grade === 'K' ? 0 : parseInt(grade, 10);
    const gradeAdjustment = gradeNum <= 1 ? 0.75 : 1;

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
