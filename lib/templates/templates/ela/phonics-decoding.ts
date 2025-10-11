// Phonics & Decoding Template
// Structure: Examples + Decoding Practice + Application

import type { WorksheetTemplate, Duration, ProblemCountRange } from '../../types';

export const phonicsDecodingTemplate: WorksheetTemplate = {
  // Metadata
  id: 'phonics-decoding',
  name: 'Phonics & Decoding',
  description: 'Phonics patterns with decoding and application practice',
  subjectType: 'ela',

  // Structure: 3 sections (examples, practice, application)
  sections: [
    {
      title: 'Sound Pattern',
      instructions: 'Look at these example words.',
      slots: [
        {
          type: 'examples',
          count: 5,  // 5 example words showing the pattern
        },
      ],
    },
    {
      title: 'Practice Reading',
      instructions: 'Read each word aloud.',
      slots: [
        {
          type: 'practice',
          count: 'duration-based',
          allowedTypes: ['fill-blank'],
        },
      ],
    },
    {
      title: 'Use the Words',
      instructions: 'Complete each sentence using a word from above.',
      slots: [
        {
          type: 'questions',
          count: 'duration-based',
          allowedTypes: ['fill-blank', 'short-answer'],
        },
      ],
    },
  ],

  // Problem count formula
  problemCountFormula: (duration: Duration, grade: string): ProblemCountRange => {
    // Phonics is typically for K-2, so base counts are lower
    const baseMin = 6;
    const baseMax = 10;

    const multiplier = duration / 30;

    return {
      min: Math.ceil(baseMin * multiplier),
      max: Math.ceil(baseMax * multiplier),
    };
  },

  // Formatting
  formatting: {
    numberingStyle: '1.',
    spacing: 'generous',  // Phonics needs more space
    showInstructions: true,
  },

  // Grade-specific adjustments
  gradeAdjustments: {
    'K': { spacing: 'generous' },
    '1': { spacing: 'generous' },
    '2': { spacing: 'normal' },
  },
};
