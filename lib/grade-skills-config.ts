export interface SkillItem {
  id: string;
  label: string;
  category: 'math' | 'ela' | 'both';
  trimester?: 'beginning' | 'middle' | 'end';
  gradeLevel?: string;
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
      { id: 'letter-recognition', label: 'Letter Recognition (Upper/Lower)', category: 'ela', trimester: 'beginning' },
      { id: 'letter-sounds', label: 'Letter Sounds', category: 'ela', trimester: 'beginning' },
      { id: 'sight-words-k', label: 'Sight Words (Pre-Primer)', category: 'ela', trimester: 'middle' },
      { id: 'name-writing', label: 'Name Writing', category: 'ela', trimester: 'end' },
      { id: 'counting-20', label: 'Counting to 20', category: 'math', trimester: 'beginning' },
      { id: 'number-recognition', label: 'Number Recognition 0-10', category: 'math', trimester: 'beginning' },
      { id: 'one-to-one', label: 'One-to-One Correspondence', category: 'math', trimester: 'middle' },
      { id: 'shapes', label: 'Basic Shapes Recognition', category: 'math', trimester: 'middle' },
      { id: 'patterns', label: 'Simple Patterns (AB, ABC)', category: 'math', trimester: 'end' },
      { id: 'sorting', label: 'Sorting & Classifying', category: 'math', trimester: 'end' }
    ]
  },
  '1': {
    label: '1st Grade',
    skills: [
      { id: 'phonemic-awareness', label: 'Phonemic Awareness (Blending/Segmenting)', category: 'ela', trimester: 'beginning' },
      { id: 'cvc-words', label: 'CVC Word Reading', category: 'ela', trimester: 'beginning' },
      { id: 'sight-words-1', label: 'Sight Words (Primer)', category: 'ela', trimester: 'middle' },
      { id: 'sentence-writing', label: 'Simple Sentence Writing', category: 'ela', trimester: 'middle' },
      { id: 'story-elements', label: 'Story Elements (Character, Setting)', category: 'ela', trimester: 'end' },
      { id: 'addition-20', label: 'Addition Within 20', category: 'math', trimester: 'beginning' },
      { id: 'subtraction-20', label: 'Subtraction Within 20', category: 'math', trimester: 'middle' },
      { id: 'place-value-tens', label: 'Place Value (Tens & Ones)', category: 'math', trimester: 'middle' },
      { id: 'counting-120', label: 'Counting to 120', category: 'math', trimester: 'beginning' },
      { id: 'word-problems-1', label: 'Simple Word Problems', category: 'math', trimester: 'end' }
    ]
  },
  '2': {
    label: '2nd Grade',
    skills: [
      { id: 'reading-comp', label: 'Reading Comprehension (Main Idea)', category: 'ela', trimester: 'middle' },
      { id: 'fluency-2', label: 'Reading Fluency', category: 'ela', trimester: 'beginning' },
      { id: 'sight-words-2', label: 'Sight Words (Grade 2)', category: 'ela', trimester: 'beginning' },
      { id: 'paragraph-writing', label: 'Paragraph Writing', category: 'ela', trimester: 'end' },
      { id: 'phonics-patterns', label: 'Advanced Phonics Patterns', category: 'ela', trimester: 'middle' },
      { id: 'place-value-hundreds', label: 'Place Value (Hundreds)', category: 'math', trimester: 'beginning' },
      { id: 'addition-100', label: 'Addition Within 100', category: 'math', trimester: 'beginning' },
      { id: 'subtraction-100', label: 'Subtraction Within 100', category: 'math', trimester: 'middle' },
      { id: 'time-money', label: 'Time & Money', category: 'math', trimester: 'middle' },
      { id: 'measurement', label: 'Basic Measurement', category: 'math', trimester: 'end' }
    ]
  },
  '3': {
    label: '3rd Grade',
    skills: [
      { id: 'main-idea', label: 'Main Idea & Supporting Details', category: 'ela', trimester: 'beginning' },
      { id: 'inferencing', label: 'Making Inferences', category: 'ela', trimester: 'middle' },
      { id: 'text-features', label: 'Text Features', category: 'ela', trimester: 'beginning' },
      { id: 'opinion-writing', label: 'Opinion Writing', category: 'ela', trimester: 'end' },
      { id: 'prefixes-suffixes', label: 'Prefixes & Suffixes', category: 'ela', trimester: 'middle' },
      { id: 'multiplication', label: 'Multiplication Facts', category: 'math', trimester: 'beginning' },
      { id: 'division', label: 'Division Facts', category: 'math', trimester: 'middle' },
      { id: 'fractions', label: 'Introduction to Fractions', category: 'math', trimester: 'middle' },
      { id: 'area-perimeter', label: 'Area & Perimeter', category: 'math', trimester: 'end' },
      { id: 'word-problems-3', label: 'Multi-Step Word Problems', category: 'math', trimester: 'end' }
    ]
  },
  '4': {
    label: '4th Grade',
    skills: [
      { id: 'summarizing', label: 'Summarizing Text', category: 'ela', trimester: 'beginning' },
      { id: 'text-evidence', label: 'Citing Text Evidence', category: 'ela', trimester: 'middle' },
      { id: 'narrative-writing', label: 'Narrative Writing', category: 'ela', trimester: 'middle' },
      { id: 'context-clues', label: 'Context Clues', category: 'ela', trimester: 'beginning' },
      { id: 'theme', label: 'Identifying Theme', category: 'ela', trimester: 'end' },
      { id: 'multi-digit-mult', label: 'Multi-Digit Multiplication', category: 'math', trimester: 'beginning' },
      { id: 'long-division', label: 'Long Division', category: 'math', trimester: 'middle' },
      { id: 'fraction-operations', label: 'Fraction Operations', category: 'math', trimester: 'middle' },
      { id: 'decimals', label: 'Decimals', category: 'math', trimester: 'end' },
      { id: 'factors-multiples', label: 'Factors & Multiples', category: 'math', trimester: 'beginning' }
    ]
  },
  '5': {
    label: '5th Grade',
    skills: [
      { id: 'analyzing-text', label: 'Analyzing Complex Text', category: 'ela', trimester: 'middle' },
      { id: 'compare-contrast', label: 'Compare & Contrast Texts', category: 'ela', trimester: 'beginning' },
      { id: 'research-writing', label: 'Research Writing', category: 'ela', trimester: 'end' },
      { id: 'figurative-language', label: 'Figurative Language', category: 'ela', trimester: 'middle' },
      { id: 'point-of-view', label: 'Point of View', category: 'ela', trimester: 'beginning' },
      { id: 'decimal-operations', label: 'Decimal Operations', category: 'math', trimester: 'beginning' },
      { id: 'fraction-mixed', label: 'Fractions (Unlike Denominators)', category: 'math', trimester: 'middle' },
      { id: 'volume', label: 'Volume', category: 'math', trimester: 'end' },
      { id: 'coordinate-plane', label: 'Coordinate Plane', category: 'math', trimester: 'end' },
      { id: 'numerical-expressions', label: 'Numerical Expressions', category: 'math', trimester: 'middle' }
    ]
  }
};