// Template Registry - Central registry for all worksheet templates
// Provides lookup and management for template-based generation

import type { WorksheetTemplate, TemplateRegistry, TemplateTopic, TopicOption, SubjectType } from './types';

// Import all templates
import { readingComprehensionTemplate } from './templates/ela/reading-comprehension';
import { phonicsDecodingTemplate } from './templates/ela/phonics-decoding';
import { writingPromptTemplate } from './templates/ela/writing-prompt';
import { grammarVocabularyTemplate } from './templates/ela/grammar-vocabulary';
import { computationTemplate } from './templates/math/computation';
import { wordProblemsTemplate } from './templates/math/word-problems';
import { mixedPracticeTemplate } from './templates/math/mixed-practice';
import { additionTemplate } from './templates/math/addition';
import { subtractionTemplate } from './templates/math/subtraction';
import { multiplicationTemplate } from './templates/math/multiplication';
import { divisionTemplate } from './templates/math/division';
import { fractionsTemplate } from './templates/math/fractions';

// Template registry - single source of truth for all templates
export const templateRegistry: TemplateRegistry = {
  // ELA Templates
  'reading-comprehension': readingComprehensionTemplate,
  'phonics-decoding': phonicsDecodingTemplate,
  'writing-prompt': writingPromptTemplate,
  'grammar-vocabulary': grammarVocabularyTemplate,

  // Math Templates - General
  'computation': computationTemplate,
  'word-problems': wordProblemsTemplate,
  'mixed-practice': mixedPracticeTemplate,

  // Math Templates - Specific Operations
  'addition': additionTemplate,
  'subtraction': subtractionTemplate,
  'multiplication': multiplicationTemplate,
  'division': divisionTemplate,
  'fractions': fractionsTemplate,
};

// Topic options for UI dropdowns
export const topicOptions: TopicOption[] = [
  // ELA Topics
  {
    id: 'reading-comprehension',
    label: 'Reading Comprehension',
    description: 'Story or passage with comprehension questions',
    subjectType: 'ela',
  },
  {
    id: 'phonics-decoding',
    label: 'Phonics & Decoding',
    description: 'Sound patterns and word reading practice',
    subjectType: 'ela',
  },
  {
    id: 'writing-prompt',
    label: 'Writing & Composition',
    description: 'Writing prompt with planning and response space',
    subjectType: 'ela',
  },
  {
    id: 'grammar-vocabulary',
    label: 'Grammar & Vocabulary',
    description: 'Grammar rules or vocabulary with practice exercises',
    subjectType: 'ela',
  },

  // Math Topics - General
  {
    id: 'computation',
    label: 'Computation Practice',
    description: 'Mixed math facts and computation problems',
    subjectType: 'math',
  },
  {
    id: 'word-problems',
    label: 'Word Problems',
    description: 'Story-based math problems',
    subjectType: 'math',
  },
  {
    id: 'mixed-practice',
    label: 'Mixed Review',
    description: 'Combination of computation and word problems',
    subjectType: 'math',
  },

  // Math Topics - Specific Operations
  {
    id: 'addition',
    label: 'Addition',
    description: 'Addition practice problems',
    subjectType: 'math',
  },
  {
    id: 'subtraction',
    label: 'Subtraction',
    description: 'Subtraction practice problems',
    subjectType: 'math',
  },
  {
    id: 'multiplication',
    label: 'Multiplication',
    description: 'Multiplication practice problems',
    subjectType: 'math',
  },
  {
    id: 'division',
    label: 'Division',
    description: 'Division practice problems',
    subjectType: 'math',
  },
  {
    id: 'fractions',
    label: 'Fractions',
    description: 'Fraction concepts and practice',
    subjectType: 'math',
  },
];

// Get template by ID
export function getTemplate(id: TemplateTopic): WorksheetTemplate | undefined {
  return templateRegistry[id];
}

// Get all templates for a subject type
export function getTemplatesBySubject(subjectType: SubjectType): WorksheetTemplate[] {
  return Object.values(templateRegistry).filter(
    (template) => template.subjectType === subjectType
  );
}

// Get topic options for a subject type
export function getTopicOptionsForSubject(subjectType: SubjectType): TopicOption[] {
  return topicOptions.filter((option) => option.subjectType === subjectType);
}

// Get all template IDs
export function getAllTemplateIds(): TemplateTopic[] {
  return Object.keys(templateRegistry) as TemplateTopic[];
}

// Validate that a topic ID exists
export function isValidTopic(topic: string): topic is TemplateTopic {
  return topic in templateRegistry;
}
