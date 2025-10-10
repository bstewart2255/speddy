// Writing & Composition Template
// Structure: Prompt + Planning + Writing Space

import type { WorksheetTemplate, Duration, ProblemCountRange } from '../../types';

export const writingPromptTemplate: WorksheetTemplate = {
  // Metadata
  id: 'writing-prompt',
  name: 'Writing & Composition',
  description: 'Writing prompt with planning space and lined writing area',
  subjectType: 'ela',

  // Structure: 3 sections (prompt, planning, writing)
  sections: [
    {
      title: 'Writing Prompt',
      slots: [
        {
          type: 'passage',  // The prompt itself
          count: 1,
          minLength: 50,
          maxLength: 200,
        },
      ],
    },
    {
      title: 'Plan Your Writing',
      instructions: 'Use this space to plan your ideas.',
      slots: [
        {
          type: 'questions',
          count: 3,  // 3 planning questions
          allowedTypes: ['short-answer'],
        },
      ],
    },
    {
      title: 'Write Your Response',
      instructions: 'Write your final response here.',
      slots: [
        {
          type: 'practice',  // Writing space
          count: 1,
          allowedTypes: ['long-answer'],
        },
      ],
    },
  ],

  // Problem count formula (for planning questions and writing lines)
  problemCountFormula: (duration: Duration, grade: string): ProblemCountRange => {
    // Writing quantity based on duration
    // Measured in expected sentence count
    const baseMin = 4;  // sentences
    const baseMax = 8;  // sentences

    const multiplier = duration / 30;

    // Older students write more
    const gradeNum = grade === 'K' ? 0 : parseInt(grade);
    const gradeMultiplier = 1 + (gradeNum * 0.2);

    return {
      min: Math.ceil(baseMin * multiplier * gradeMultiplier),
      max: Math.ceil(baseMax * multiplier * gradeMultiplier),
    };
  },

  // Formatting
  formatting: {
    numberingStyle: 'none',  // Writing doesn't need numbering
    spacing: 'generous',
    showInstructions: true,
  },

  // Grade-specific adjustments
  gradeAdjustments: {
    'K': { spacing: 'generous' },
    '1': { spacing: 'generous' },
    '2': { spacing: 'normal' },
    '3': { spacing: 'normal' },
    '4': { spacing: 'normal' },
    '5': { spacing: 'compact' },
  },
};
