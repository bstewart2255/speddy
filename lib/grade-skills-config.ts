export interface SkillItem {
  id: string;
  label: string;
  category: 'math' | 'ela' | 'both';
}

export interface GradeSkills {
  [grade: string]: {
    label: string;
    skills: SkillItem[];
  };
}

export const GRADE_SKILLS_CONFIG: GradeSkills = {
  'K': {
    label: 'Kindergarten',
    skills: [
      { id: 'letter-recognition', label: 'Letter Recognition (Upper/Lower)', category: 'ela' },
      { id: 'letter-sounds', label: 'Letter Sounds', category: 'ela' },
      { id: 'sight-words-k', label: 'Sight Words (Pre-Primer)', category: 'ela' },
      { id: 'name-writing', label: 'Name Writing', category: 'ela' },
      { id: 'counting-20', label: 'Counting to 20', category: 'math' },
      { id: 'number-recognition', label: 'Number Recognition 0-10', category: 'math' },
      { id: 'one-to-one', label: 'One-to-One Correspondence', category: 'math' },
      { id: 'shapes', label: 'Basic Shapes Recognition', category: 'math' },
      { id: 'patterns', label: 'Simple Patterns (AB, ABC)', category: 'math' },
      { id: 'sorting', label: 'Sorting & Classifying', category: 'math' }
    ]
  },
  '1': {
    label: '1st Grade',
    skills: [
      { id: 'phonemic-awareness', label: 'Phonemic Awareness (Blending/Segmenting)', category: 'ela' },
      { id: 'cvc-words', label: 'CVC Word Reading', category: 'ela' },
      { id: 'sight-words-1', label: 'Sight Words (Primer)', category: 'ela' },
      { id: 'sentence-writing', label: 'Simple Sentence Writing', category: 'ela' },
      { id: 'story-elements', label: 'Story Elements (Character, Setting)', category: 'ela' },
      { id: 'addition-20', label: 'Addition Within 20', category: 'math' },
      { id: 'subtraction-20', label: 'Subtraction Within 20', category: 'math' },
      { id: 'place-value-tens', label: 'Place Value (Tens & Ones)', category: 'math' },
      { id: 'counting-120', label: 'Counting to 120', category: 'math' },
      { id: 'word-problems-1', label: 'Simple Word Problems', category: 'math' }
    ]
  },
  '2': {
    label: '2nd Grade',
    skills: [
      { id: 'reading-comp', label: 'Reading Comprehension (Main Idea)', category: 'ela' },
      { id: 'fluency-2', label: 'Reading Fluency', category: 'ela' },
      { id: 'sight-words-2', label: 'Sight Words (Grade 2)', category: 'ela' },
      { id: 'paragraph-writing', label: 'Paragraph Writing', category: 'ela' },
      { id: 'phonics-patterns', label: 'Advanced Phonics Patterns', category: 'ela' },
      { id: 'place-value-hundreds', label: 'Place Value (Hundreds)', category: 'math' },
      { id: 'addition-100', label: 'Addition Within 100', category: 'math' },
      { id: 'subtraction-100', label: 'Subtraction Within 100', category: 'math' },
      { id: 'time-money', label: 'Time & Money', category: 'math' },
      { id: 'measurement', label: 'Basic Measurement', category: 'math' }
    ]
  },
  '3': {
    label: '3rd Grade',
    skills: [
      { id: 'main-idea', label: 'Main Idea & Supporting Details', category: 'ela' },
      { id: 'inferencing', label: 'Making Inferences', category: 'ela' },
      { id: 'text-features', label: 'Text Features', category: 'ela' },
      { id: 'opinion-writing', label: 'Opinion Writing', category: 'ela' },
      { id: 'prefixes-suffixes', label: 'Prefixes & Suffixes', category: 'ela' },
      { id: 'multiplication', label: 'Multiplication Facts', category: 'math' },
      { id: 'division', label: 'Division Facts', category: 'math' },
      { id: 'fractions', label: 'Introduction to Fractions', category: 'math' },
      { id: 'area-perimeter', label: 'Area & Perimeter', category: 'math' },
      { id: 'word-problems-3', label: 'Multi-Step Word Problems', category: 'math' }
    ]
  },
  '4': {
    label: '4th Grade',
    skills: [
      { id: 'summarizing', label: 'Summarizing Text', category: 'ela' },
      { id: 'text-evidence', label: 'Citing Text Evidence', category: 'ela' },
      { id: 'narrative-writing', label: 'Narrative Writing', category: 'ela' },
      { id: 'context-clues', label: 'Context Clues', category: 'ela' },
      { id: 'theme', label: 'Identifying Theme', category: 'ela' },
      { id: 'multi-digit-mult', label: 'Multi-Digit Multiplication', category: 'math' },
      { id: 'long-division', label: 'Long Division', category: 'math' },
      { id: 'fraction-operations', label: 'Fraction Operations', category: 'math' },
      { id: 'decimals', label: 'Decimals', category: 'math' },
      { id: 'factors-multiples', label: 'Factors & Multiples', category: 'math' }
    ]
  },
  '5': {
    label: '5th Grade',
    skills: [
      { id: 'analyzing-text', label: 'Analyzing Complex Text', category: 'ela' },
      { id: 'compare-contrast', label: 'Compare & Contrast Texts', category: 'ela' },
      { id: 'research-writing', label: 'Research Writing', category: 'ela' },
      { id: 'figurative-language', label: 'Figurative Language', category: 'ela' },
      { id: 'point-of-view', label: 'Point of View', category: 'ela' },
      { id: 'decimal-operations', label: 'Decimal Operations', category: 'math' },
      { id: 'fraction-mixed', label: 'Fractions (Unlike Denominators)', category: 'math' },
      { id: 'volume', label: 'Volume', category: 'math' },
      { id: 'coordinate-plane', label: 'Coordinate Plane', category: 'math' },
      { id: 'numerical-expressions', label: 'Numerical Expressions', category: 'math' }
    ]
  }
};