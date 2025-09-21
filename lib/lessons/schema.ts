// Minimal, flexible JSON schema for lesson generation
// Designed to work across all roles (Resource, OT, Speech) and all AI models

export interface StudentProfile {
  id: string;
  initials?: string; // Student initials (e.g., "J.B.")
  grade: number; // Numeric for easier grouping (e.g., 2 for 2nd grade)
  readingLevel?: number; // Optional: grade equivalent
  iepGoals?: string[]; // Optional: relevant IEP goals
  accommodations?: string[]; // Optional: needed accommodations
}

export interface LessonRequest {
  students: StudentProfile[];
  teacherRole: 'resource' | 'ot' | 'speech' | 'counseling';
  subject: string;
  subjectType: 'ela' | 'math'; // Required: explicit subject type for enhanced prompts
  topic?: string;
  duration: number; // in minutes
  focusSkills?: string[]; // Optional: specific skills to target
  lessonDate?: string; // Optional: date for the lesson (YYYY-MM-DD)
  timeSlot?: string; // Optional: time slot identifier
}

export interface LessonResponse {
  lesson: LessonPlan;
  studentMaterials: StudentMaterial[];
  metadata: LessonMetadata;
  generation_explanation?: GenerationExplanation;
}

export interface LessonPlan {
  title: string;
  duration: number;
  objectives: string[];
  materials: string; // Always "Worksheets, pencils, whiteboard and markers only"
  
  // Teacher guidance
  overview: string;
  introduction: ActivitySection; // Teacher guidance and examples
  activity: ActivitySection; // Main student practice section
  closure?: ActivitySection; // Optional lesson closure/wrap-up section
  
  // NEW: Structured teacher lesson plan
  teacherLessonPlan?: TeacherLessonPlan;
  
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

// NEW: Teacher-focused lesson plan structure
export interface TeacherLessonPlan {
  // Student information for quick reference
  studentInitials: string[];
  
  // Clear lesson topic
  topic: string;
  
  // Teacher introduction script
  teacherIntroduction: {
    script: string; // Conversational text to read aloud
    materials: string[]; // What teacher needs ready
    visualAids?: string[]; // Optional supporting materials
  };
  
  // Whiteboard examples (2-3 required)
  whiteboardExamples: WhiteboardExample[];
  
  // All student worksheet problems for teacher reference
  studentProblems: StudentProblemSet[];
  
  // Optional teaching notes
  teachingNotes?: {
    pacing?: string[]; // Time management tips
    differentiation?: string[]; // How to adapt for different learners
    checkpoints?: string[]; // When/how to assess understanding
  };
}

export interface WhiteboardExample {
  number: number;
  title: string; // e.g., "Adding Pizza Slices"
  problem: string; // The problem statement
  steps: string[]; // Step-by-step solution
  teachingPoint: string; // Key concept to emphasize
}

export interface StudentProblemSet {
  studentInitials: string;
  problems: {
    number: string; // "1", "1a", "2", etc.
    question: string;
    questionType?: 'multiple-choice' | 'fill-blank' | 'short-answer' | 'visual' | 'long-answer';
    choices?: string[]; // For multiple choice
    answer: string;
    solution?: string[]; // For complex problems
    commonErrors?: string[]; // What to watch for
  }[];
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
  gradeLevel?: number; // Student's actual grade level
  
  worksheet: {
    title: string;
    grade?: number; // The actual grade level for this worksheet
    instructions: string; // At student's reading level
    sections?: Array<{
      title: string;
      instructions?: string;
      items: WorksheetContent[] | WorksheetItem[]; // Support both nested and flat
    }>;
    content?: WorksheetContent[]; // Legacy support
    accommodations: string[]; // Applied accommodations
  };
  
  accommodations?: string[];
  answerKey?: AnswerKey; // Optional: for activities with specific answers
}

export interface WorksheetContent {
  sectionType: 'introduction' | 'practice' | 'assessment';
  sectionTitle: string;
  instructions: string;
  
  // Flexible content that can be different based on activity type
  items: WorksheetItem[];
}

export interface WorksheetItem {
  type: 'multiple-choice' | 'fill-blank' | 'short-answer' | 'long-answer' | 'visual-math' | 'example' | 'passage' | 'text' | 'fill-in-blank';
  content: string; // The actual question/problem/task
  
  // Optional fields for different item types
  choices?: string[]; // For multiple choice (exactly 4 choices WITHOUT letter prefixes)
  blankLines?: number; // For written responses (grade-based: K-1: 4, 2-3: 3, 4-5: 2)
  visualSupport?: string; // Description of visual aid
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

export interface GenerationExplanation {
  duration_interpretation: string;
  actual_content_generated: {
    // Total count across all student worksheets (not per-student)
    practice_problems: number;
    whiteboard_examples: number;
    reasoning: string;
  };
  // Keys are student IDs (e.g., "student-1", "student-2"), values are differentiation explanations
  student_differentiation: Record<string, string>;
  validation_expectations: string;
  constraints_applied: string[];
  duration_scaling_applied: string;
  problems_with_requirements?: string;
}

// Validation constraints
export const ALLOWED_MATERIALS = [
  'worksheets',
  'pencils', 
  'pencil',
  'whiteboard',
  'dry erase marker',
  'dry-erase marker',
  'dry erase markers',
  'dry-erase markers',
  'marker',
  'markers',
  'whiteboard and markers',
  'whiteboard-and-markers',
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

// Type guard functions with deep validation
export function isValidLessonResponse(data: any): data is LessonResponse {
  // Check basic structure
  if (!data || typeof data !== 'object') {
    console.error('Lesson validation failed: Invalid data type');
    return false;
  }
  
  // Check top-level required fields
  if (!('lesson' in data) || !('studentMaterials' in data) || !('metadata' in data)) {
    console.error('Lesson validation failed: Missing required top-level fields');
    return false;
  }
  
  // Validate lesson object
  const lesson = data.lesson;
  if (!lesson || typeof lesson !== 'object') {
    console.error('Lesson validation failed: Invalid lesson object');
    return false;
  }
  
  // Check required lesson fields and their types
  const requiredLessonFields = ['title', 'duration', 'objectives', 'materials', 'overview', 
                                 'introduction', 'activity'];
  for (const field of requiredLessonFields) {
    if (!(field in lesson)) {
      console.error(`Lesson validation failed: Missing lesson.${field}`);
      return false;
    }
  }
  
  // Validate field types
  if (typeof lesson.title !== 'string' || lesson.title.trim() === '') {
    console.error(`Lesson validation failed: lesson.title must be a non-empty string, got: ${typeof lesson.title}`);
    return false;
  }
  
  if (typeof lesson.duration !== 'number' || lesson.duration <= 0) {
    console.error(`Lesson validation failed: lesson.duration must be a positive number, got: ${lesson.duration}`);
    return false;
  }
  
  if (!Array.isArray(lesson.objectives) || lesson.objectives.length === 0) {
    console.error(`Lesson validation failed: lesson.objectives must be a non-empty array, got: ${typeof lesson.objectives}`);
    return false;
  }
  
  // Check each objective is a string
  for (let i = 0; i < lesson.objectives.length; i++) {
    if (typeof lesson.objectives[i] !== 'string') {
      console.error(`Lesson validation failed: lesson.objectives[${i}] must be a string, got: ${typeof lesson.objectives[i]}`);
      return false;
    }
  }
  
  if (typeof lesson.materials !== 'string') {
    console.error(`Lesson validation failed: lesson.materials must be a string, got: ${typeof lesson.materials}`);
    return false;
  }
  
  if (typeof lesson.overview !== 'string') {
    console.error(`Lesson validation failed: lesson.overview must be a string, got: ${typeof lesson.overview}`);
    return false;
  }
  
  // Validate activity sections with type checking  
  const activitySections = ['introduction', 'activity'];
  for (const section of activitySections) {
    const activity = lesson[section];
    if (!activity || typeof activity !== 'object') {
      console.error(`Lesson validation failed: ${section} must be an object, got: ${typeof activity}`);
      return false;
    }
    
    if (!('description' in activity) || typeof activity.description !== 'string') {
      console.error(`Lesson validation failed: ${section}.description must be a string, got: ${typeof activity.description}`);
      return false;
    }
    
    if (!('duration' in activity) || typeof activity.duration !== 'number' || activity.duration <= 0) {
      console.error(`Lesson validation failed: ${section}.duration must be a positive number, got: ${activity.duration}`);
      return false;
    }
    
    if (!('instructions' in activity) || !Array.isArray(activity.instructions)) {
      console.error(`Lesson validation failed: ${section}.instructions must be an array, got: ${typeof activity.instructions}`);
      return false;
    }
    
    if (!('materials' in activity) || !Array.isArray(activity.materials)) {
      console.error(`Lesson validation failed: ${section}.materials must be an array, got: ${typeof activity.materials}`);
      return false;
    }
  }
  
  // Validate optional teacherLessonPlan if present
  if ('teacherLessonPlan' in lesson && lesson.teacherLessonPlan) {
    const tlp = lesson.teacherLessonPlan;
    
    if (!Array.isArray(tlp.studentInitials) || tlp.studentInitials.length === 0) {
      console.error('Lesson validation failed: teacherLessonPlan.studentInitials must be a non-empty array');
      return false;
    }
    
    if (typeof tlp.topic !== 'string' || tlp.topic.trim() === '') {
      console.error('Lesson validation failed: teacherLessonPlan.topic must be a non-empty string');
      return false;
    }
    
    if (!tlp.teacherIntroduction || typeof tlp.teacherIntroduction.script !== 'string') {
      console.error('Lesson validation failed: teacherLessonPlan.teacherIntroduction.script must be a string');
      return false;
    }
    
    if (!Array.isArray(tlp.whiteboardExamples) || tlp.whiteboardExamples.length < 2) {
      console.error('Lesson validation failed: teacherLessonPlan.whiteboardExamples must have at least 2 examples');
      return false;
    }
    
    if (!Array.isArray(tlp.studentProblems) || tlp.studentProblems.length === 0) {
      console.error('Lesson validation failed: teacherLessonPlan.studentProblems must be a non-empty array');
      return false;
    }
  }
  
  // Validate studentMaterials array
  if (!Array.isArray(data.studentMaterials)) {
    console.error('Lesson validation failed: studentMaterials must be an array');
    return false;
  }
  
  if (data.studentMaterials.length === 0) {
    console.error('Lesson validation failed: studentMaterials cannot be empty');
    return false;
  }
  
  // Check each student material with detailed validation
  for (let i = 0; i < data.studentMaterials.length; i++) {
    const material = data.studentMaterials[i];
    if (!material || typeof material !== 'object') {
      console.error(`Lesson validation failed: studentMaterials[${i}] must be an object`);
      return false;
    }
    
    if (!('studentId' in material) || typeof material.studentId !== 'string') {
      console.error(`Lesson validation failed: studentMaterials[${i}].studentId must be a string, got: ${typeof material.studentId}`);
      return false;
    }
    
    if (!('gradeGroup' in material) || typeof material.gradeGroup !== 'number') {
      console.error(`Lesson validation failed: studentMaterials[${i}].gradeGroup must be a number, got: ${typeof material.gradeGroup}`);
      return false;
    }
    
    if (!('worksheet' in material) || !material.worksheet || typeof material.worksheet !== 'object') {
      console.error(`Lesson validation failed: studentMaterials[${i}].worksheet must be an object`);
      return false;
    }
    
    // Validate worksheet structure
    const worksheet = material.worksheet;
    if (!('title' in worksheet) || typeof worksheet.title !== 'string') {
      console.error(`Lesson validation failed: studentMaterials[${i}].worksheet.title must be a string`);
      return false;
    }
    
    if (!('instructions' in worksheet) || typeof worksheet.instructions !== 'string') {
      console.error(`Lesson validation failed: studentMaterials[${i}].worksheet.instructions must be a string`);
      return false;
    }
    
    if ('accommodations' in worksheet && !Array.isArray(worksheet.accommodations)) {
      console.error(`Lesson validation failed: studentMaterials[${i}].worksheet.accommodations must be an array if present`);
      return false;
    }
  }
  
  // Validate metadata with detailed type checking
  const metadata = data.metadata;
  if (!metadata || typeof metadata !== 'object') {
    console.error('Lesson validation failed: metadata must be an object');
    return false;
  }
  
  if (!('gradeGroups' in metadata) || !Array.isArray(metadata.gradeGroups)) {
    console.error(`Lesson validation failed: metadata.gradeGroups must be an array, got: ${typeof metadata.gradeGroups}`);
    return false;
  }
  
  // Validate each grade group
  for (let i = 0; i < metadata.gradeGroups.length; i++) {
    const group = metadata.gradeGroups[i];
    if (!group || typeof group !== 'object') {
      console.error(`Lesson validation failed: metadata.gradeGroups[${i}] must be an object`);
      return false;
    }
    
    if (!('grades' in group) || !Array.isArray(group.grades)) {
      console.error(`Lesson validation failed: metadata.gradeGroups[${i}].grades must be an array`);
      return false;
    }
    
    if (!('studentIds' in group) || !Array.isArray(group.studentIds)) {
      console.error(`Lesson validation failed: metadata.gradeGroups[${i}].studentIds must be an array`);
      return false;
    }
    
    // Allow 'at' as an alias for 'on' (AI sometimes abbreviates)
    if ('activityLevel' in group && group.activityLevel === 'at') {
      group.activityLevel = 'on';
    }

    if (!('activityLevel' in group) || !['below', 'on', 'above'].includes(group.activityLevel)) {
      console.error(`Lesson validation failed: metadata.gradeGroups[${i}].activityLevel must be 'below', 'on', or 'above', got: ${group.activityLevel}`);
      return false;
    }
  }
  
  if (!('validationStatus' in metadata) || !['passed', 'failed'].includes(metadata.validationStatus)) {
    console.error(`Lesson validation failed: metadata.validationStatus must be 'passed' or 'failed', got: ${metadata.validationStatus}`);
    return false;
  }
  
  return true;
}

export function isValidTeacherRole(role: string): role is LessonRequest['teacherRole'] {
  return ['resource', 'ot', 'speech', 'counseling'].includes(role);
}