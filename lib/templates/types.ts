// Core types for the template-based worksheet generation system (v2)

export type SubjectType = 'ela' | 'math';
export type GradeLevel = 'K' | '1' | '2' | '3' | '4' | '5';
export type Duration = 15 | 30 | 45 | 60;

// Topic IDs that map directly to templates
export type ELATopic =
  | 'reading-comprehension'
  | 'phonics-decoding'
  | 'writing-prompt'
  | 'grammar-vocabulary';

export type MathTopic =
  | 'computation'
  | 'word-problems'
  | 'mixed-practice';

export type TemplateTopic = ELATopic | MathTopic;

// Question types supported across templates
export type QuestionType =
  | 'multiple-choice'
  | 'short-answer'
  | 'long-answer'
  | 'fill-blank'
  | 'true-false'
  | 'matching'
  | 'visual-math';

// Template slot types define what kind of content goes in each section
export type SlotType =
  | 'passage'           // Reading passage
  | 'questions'         // Question set
  | 'problems'          // Math problems
  | 'writing-prompt'    // Writing prompt
  | 'examples'          // Example problems
  | 'practice';         // Practice problems

// Problem count can be fixed or duration-based
export type ProblemCount = number | 'duration-based';

// Template section definition
export interface TemplateSection {
  title: string;
  instructions?: string;
  slots: TemplateSlot[];
}

// Template slot definition - defines what content goes where
export interface TemplateSlot {
  type: SlotType;
  count: ProblemCount;
  allowedTypes?: QuestionType[];  // If undefined, all types allowed
  minLength?: number;              // Min length for passages/prompts
  maxLength?: number;              // Max length for passages/prompts
}

// Problem count formula - calculates min/max problems based on duration and grade
export interface ProblemCountRange {
  min: number;
  max: number;
}

export type ProblemCountFormula = (
  duration: Duration,
  grade: string
) => ProblemCountRange;

// Formatting rules
export interface FormattingRules {
  numberingStyle: '1.' | 'a)' | 'i)' | 'none';
  spacing: 'compact' | 'normal' | 'generous';
  showInstructions: boolean;
}

// Complete template definition
export interface WorksheetTemplate {
  // Template metadata
  id: TemplateTopic;
  name: string;
  description?: string;
  subjectType: SubjectType;

  // Structure definition
  sections: TemplateSection[];

  // Problem count calculation
  problemCountFormula: ProblemCountFormula;

  // Formatting preferences
  formatting: FormattingRules;

  // Grade-specific adjustments (optional)
  gradeAdjustments?: {
    [grade: string]: Partial<FormattingRules>;
  };
}

// Topic configuration for the UI dropdown
export interface TopicOption {
  id: TemplateTopic;
  label: string;
  description: string;
  subjectType: SubjectType;
  icon?: string;
}

// Template selection input
export interface TemplateSelectionParams {
  subjectType: SubjectType;
  topic: TemplateTopic;
  duration: Duration;
  grade: string;
  studentCount?: number;
}

// Template registry type
export type TemplateRegistry = {
  [K in TemplateTopic]: WorksheetTemplate;
};
