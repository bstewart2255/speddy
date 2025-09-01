// Minimal, flexible JSON schema for lesson generation
// Designed to work across all roles (Resource, OT, Speech) and all AI models

export interface StudentProfile {
  id: string;
  grade: number; // Numeric for easier grouping (e.g., 2 for 2nd grade)
  readingLevel?: number; // Optional: grade equivalent
  iepGoals?: string[]; // Optional: relevant IEP goals
  accommodations?: string[]; // Optional: needed accommodations
}

export interface LessonRequest {
  students: StudentProfile[];
  teacherRole: 'resource' | 'ot' | 'speech' | 'counseling';
  subject: string;
  topic?: string;
  duration: number; // in minutes
  focusSkills?: string[]; // Optional: specific skills to target
}

export interface LessonResponse {
  lesson: LessonPlan;
  studentMaterials: StudentMaterial[];
  metadata: LessonMetadata;
}

export interface LessonPlan {
  title: string;
  duration: number;
  objectives: string[];
  materials: string; // Always "Worksheets, pencils, whiteboard and markers only"
  
  // Teacher guidance
  overview: string;
  introduction: ActivitySection;
  mainActivity: ActivitySection;
  closure: ActivitySection;
  
  // Optional answer key
  answerKey?: AnswerKey;
  
  // Differentiation strategies
  differentiation?: {
    below?: string;
    onLevel?: string;
    above?: string;
  };
  
  // Role-specific sections (populated based on teacher role)
  roleSpecificContent?: {
    // For OT
    fineMotorActivities?: string[];
    sensorySupports?: string[];
    
    // For Speech
    articulationTargets?: string[];
    languageGoals?: string[];
    
    // For Resource
    differentiationStrategies?: string[];
    scaffoldingSteps?: string[];
  };
}

export interface ActivitySection {
  description: string;
  duration: number;
  instructions: string[];
  materials: string[]; // Specific materials for this section
}

export interface StudentMaterial {
  studentId: string;
  studentName?: string; // For display purposes
  gradeGroup: number; // Which grade cluster this student belongs to
  
  worksheet: {
    title: string;
    instructions: string; // At student's reading level
    sections?: Array<{
      title: string;
      instructions?: string;
      items: WorksheetContent[];
    }>;
    content?: WorksheetContent[]; // Legacy support
    accommodations: string[]; // Applied accommodations
  };
  
  accommodations?: string[];
  answerKey?: AnswerKey; // Optional: for activities with specific answers
}

export interface WorksheetContent {
  sectionType: 'warmup' | 'practice' | 'assessment' | 'enrichment';
  sectionTitle: string;
  instructions: string;
  
  // Flexible content that can be different based on activity type
  items: WorksheetItem[];
}

export interface WorksheetItem {
  type: 'question' | 'problem' | 'task' | 'prompt' | 'visual';
  content: string; // The actual question/problem/task
  
  // Optional fields for different item types
  choices?: string[]; // For multiple choice
  blankLines?: number; // For written responses
  visualSupport?: string; // Description of visual aid
  space?: 'small' | 'medium' | 'large'; // Answer space size
}

export interface AnswerKey {
  answers?: Record<string, string | string[]>; // Legacy format
  items?: {
    itemNumber: number;
    correctAnswer: string;
    acceptableVariations?: string[];
  }[];
  rubric?: string;
  notes?: string;
}

export interface LessonMetadata {
  generatedAt: string;
  modelUsed: string;
  modelVersion?: string;
  generationTime: number; // milliseconds
  gradeGroups: GradeGroup[];
  validationStatus: 'passed' | 'failed';
  validationErrors?: string[];
}

export interface GradeGroup {
  grades: number[]; // e.g., [2, 3] for 2nd and 3rd graders together
  studentIds: string[];
  studentCount?: number;
  readingLevels?: number[];
  activityLevel: 'below' | 'on' | 'above'; // Relative to grade level
}

// Validation constraints
export const ALLOWED_MATERIALS = [
  'worksheets',
  'pencils', 
  'pencil',
  'whiteboard',
  'dry erase marker',
  'marker',
  'paper'
];

export const FORBIDDEN_MATERIALS = [
  'scissors',
  'glue',
  'cut',
  'paste',
  'laminate',
  'cards',
  'dice',
  'manipulatives',
  'blocks',
  'ipad',
  'tablet',
  'computer',
  'app',
  'website',
  'online'
];

// Helper function to validate grade grouping
export function determineGradeGroups(students: StudentProfile[]): GradeGroup[] {
  const groups: GradeGroup[] = [];
  const sortedStudents = [...students].sort((a, b) => a.grade - b.grade);
  
  let currentGroup: GradeGroup = {
    grades: [],
    studentIds: [],
    activityLevel: 'on'
  };
  
  for (const student of sortedStudents) {
    if (currentGroup.grades.length === 0) {
      // Start first group
      currentGroup.grades.push(student.grade);
      currentGroup.studentIds.push(student.id);
    } else {
      const lastGrade = currentGroup.grades[currentGroup.grades.length - 1];
      
      if (Math.abs(student.grade - lastGrade) <= 1) {
        // Within 1 grade, add to current group
        if (!currentGroup.grades.includes(student.grade)) {
          currentGroup.grades.push(student.grade);
        }
        currentGroup.studentIds.push(student.id);
      } else {
        // More than 1 grade apart, start new group
        groups.push(currentGroup);
        currentGroup = {
          grades: [student.grade],
          studentIds: [student.id],
          activityLevel: 'on'
        };
      }
    }
  }
  
  // Add the last group
  if (currentGroup.studentIds.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}

// Type guard functions
export function isValidLessonResponse(data: any): data is LessonResponse {
  return (
    data &&
    typeof data === 'object' &&
    'lesson' in data &&
    'studentMaterials' in data &&
    'metadata' in data
  );
}

export function isValidTeacherRole(role: string): role is LessonRequest['teacherRole'] {
  return ['resource', 'ot', 'speech', 'counseling'].includes(role);
}