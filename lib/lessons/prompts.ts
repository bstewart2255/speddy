// Enhanced prompt templates for lesson generation with subject-specific differentiation
import { LessonRequest, determineGradeGroups } from './schema';
import {
  getDurationMultiplier,
  getWhiteboardExampleRange,
  getBaseMinimum,
  getBaseMaximum
} from './duration-constants';

export class PromptBuilder {
  /**
   * Builds the system prompt based on teacher role and subject type
   */
  buildSystemPrompt(role: LessonRequest['teacherRole'], subjectType: 'ela' | 'math'): string {
    const basePrompt = `You are an expert ${this.getRoleTitle(role)} creating ${subjectType.toUpperCase()} educational materials.

REQUIREMENTS:
1. Return ONLY valid JSON matching LessonResponse schema
2. Materials: worksheets, pencils, whiteboard, markers ONLY
3. Generate ONE worksheet for the entire group
4. Include complete content - no placeholders

WORKSHEET FORMATTING STANDARDS (MANDATORY):

1. SECTION STRUCTURE - Every lesson must have exactly 2 sections:
   - Section 1: "Introduction" (teacher guidance, examples, and brief instructions)
   - Section 2: "Activity" (all student practice problems and questions)

2. QUESTION TYPES - Use ONLY these standardized types:
   - "multiple-choice": Must have exactly 4 choices (renderer will label them A, B, C, D)
   - "fill-blank": Use grade-based blankLines (see rules below)
   - "short-answer": Use grade-based blankLines (see rules below)  
   - "long-answer": Use grade-based blankLines (see rules below)
   - "visual-math": For math problems, no blankLines needed
   - "example": For introduction section examples only
   
3. BLANK LINES: Single word=1, Short: K-1=3, 2-5=2, Long: K-3=4, 4-5=3

4. MULTIPLE CHOICE FORMAT:
   - Always exactly 4 options
   - CRITICAL: Do NOT include letter prefixes in the choices array
   - Correct: ["Red", "Blue", "Green", "Yellow"]
   - WRONG: ["A. Red", "B. Blue", "C. Green", "D. Yellow"]
   - The rendering system will add letters automatically
   - One clearly correct answer
   - Distractors should be plausible but wrong

5. ACTIVITY COUNTS: Problem count requirements are specified in the user prompt

WORKSHEET CONTENT:
- Generate ONE worksheet that will be used by all students in the group
- Resource role: content one grade below highest student level
- The worksheet should be appropriate for the group as a whole

${this.getSubjectSpecificRequirements(subjectType)}

TEACHER LESSON PLAN:
- Student initials: Use actual initials from student data
- Teacher script: 2-3 sentence introduction
- Whiteboard examples: Must have title, problem, steps array, and teachingPoint
- Student problems: List which students will work on these problems (use initials)
- Each problem needs: number, question, answer (and choices for multiple-choice)

JSON STRUCTURE (REQUIRED):
{
  "lesson": {
    "title": "string",
    "duration": number (minutes),
    "objectives": ["string"],
    "materials": "string",
    "overview": "string",
    "introduction": { "description": "string", "duration": number, "instructions": ["string"], "materials": ["string"] },
    "activity": { "description": "string", "duration": number, "instructions": ["string"], "materials": ["string"] },
    "teacherLessonPlan": {
      "studentInitials": ["string"],
      "topic": "string",
      "teacherIntroduction": { "script": "string" },
      "whiteboardExamples": [
        {
          "title": "Example title",
          "problem": "Problem statement",
          "steps": ["Step 1", "Step 2", "Step 3"],
          "teachingPoint": "Key concept to emphasize"
        }
      ],
      "studentProblems": [
        {
          "studentInitials": "AB",
          "problems": [
            { "number": "1", "question": "problem text", "answer": "answer", "choices": ["optional for MC"] }
          ]
        }
      ]
    }
  },
  "worksheet": {
    "title": "string",
    "instructions": "string",
    "sections": [
      {
        "title": "Introduction",
        "instructions": "string",
        "items": [
          { "type": "example", "content": "example problem text" }
        ]
      },
      {
        "title": "Activity",
        "instructions": "string",
        "items": [
          { "type": "multiple-choice", "content": "question", "choices": ["A", "B", "C", "D"] },
          { "type": "fill-blank", "content": "text with ___", "blankLines": 1 },
          { "type": "short-answer", "content": "question", "blankLines": 2 },
          { "type": "long-answer", "content": "question", "blankLines": 4 },
          { "type": "visual-math", "content": "25 + 17" }
        ]
      }
    ]
  },
  "studentIds": ["string"],
  "metadata": { /* auto-filled */ },
  "generation_explanation": {
    "duration_interpretation": "string explaining understanding of duration requirements",
    "actual_content_generated": {
      "practice_problems": number,
      "whiteboard_examples": number,
      "reasoning": "string explaining content decisions"
    },
    "group_composition": "string explaining the group of students this worksheet is for",
    "validation_expectations": "string explaining expected validation outcome",
    "constraints_applied": ["list of constraints considered"],
    "duration_scaling_applied": "string explaining how duration affected content amount",
    "problems_with_requirements": "optional: any conflicts or issues with requirements"
  }
}

KEY RULES:
- Generate ONE worksheet for the entire group of students
- No placeholders - all content must be complete
- Use 2 sections only: Introduction, Activity
- Examples must show worked solutions, not tips
- Include teacherLessonPlan with all fields
- CRITICAL: Each section must have "items" array, NOT "content" array
- Activity section must contain required number of problems in items array
- For reading comprehension: Include a complete story/passage (200+ words) as type:"passage" BEFORE questions
- REQUIRED: Include generation_explanation field with your reasoning about content decisions`;

    // Add role-specific requirements
    const rolePrompt = this.getRoleSpecificPrompt(role, subjectType);
    
    return basePrompt + '\n\n' + rolePrompt;
  }

  /**
   * Builds the user prompt with student and lesson details
   */
  buildUserPrompt(request: LessonRequest): string {
    const minProblems = this.getMinimumActivityCount(request.students, request.duration);
    const maxProblems = Math.ceil(minProblems * 1.25); // ~25% more than minimum for better balance

    // CRITICAL: Start with problem count requirement
    let prompt = `CRITICAL REQUIREMENT: Generate ONE worksheet with ${minProblems}-${maxProblems} problems in the Activity section.\n`;
    prompt += `This single worksheet will be used by all ${request.students.length} students in the group.\n\n`;

    prompt += `Create a ${request.duration}-minute ${request.subjectType.toUpperCase()} lesson.\n`;
    prompt += `Subject: ${request.subject}\n`;

    if (request.topic) {
      prompt += `Topic: ${request.topic}\n`;
    }

    if (request.focusSkills && request.focusSkills.length > 0) {
      prompt += `Focus Skills: ${request.focusSkills.join(', ')}\n`;
    }

    prompt += `\nGROUP INFORMATION:\n`;
    prompt += `Number of Students: ${request.students.length}\n`;

    // Get grade range for the group
    const grades = [...new Set(request.students.map(s => s.grade))].sort();
    const gradeRange = grades.length === 1 ? `Grade ${grades[0]}` : `Grades ${Math.min(...grades)}-${Math.max(...grades)}`;
    prompt += `Grade Range: ${gradeRange}\n`;

    // List student initials for reference
    const studentInitials = request.students.map(s => s.initials || s.id).join(', ');
    prompt += `Students: ${studentInitials}\n\n`;
    
    // Add subject-specific reminders with emphasis on story inclusion
    const subjectReminder = request.subjectType === 'ela'
      ? `SUBJECT-SPECIFIC REMINDERS:
- For reading comprehension: MUST include a complete story/passage (200+ words) as type:"passage" in Introduction section
- Story must come BEFORE comprehension questions
- Focus on reading comprehension, vocabulary, writing, or grammar
- Use grade-appropriate text complexity
- Questions should target: main idea, details, character analysis, sequence, cause/effect`
      : `SUBJECT-SPECIFIC REMINDERS:
- Focus on mathematical concepts and problem-solving
- Include computation practice and word problems
- Use "visual-math" question type for math computations
- Use visual representations where helpful
- Target math skills appropriate for the grade range`;

    prompt += `\nKEY REQUIREMENTS:
- Generate ONE worksheet for all ${request.students.length} students
- Activity section MUST have ${minProblems}-${maxProblems} problems in the items array
- Use 2 sections: Introduction (examples and/or story), Activity (practice problems)
- CRITICAL: Use "items" array for problems, NOT "content" array
- Include teacherLessonPlan with ${this.getExampleCount(request.duration)} whiteboard examples
- Teacher plan should reference the group, not individual students

${subjectReminder}`;
    
    return prompt;
  }

  private getRoleTitle(role: LessonRequest['teacherRole']): string {
    switch (role) {
      case 'resource':
        return 'Special Education Resource Specialist';
      case 'ot':
        return 'Occupational Therapist';
      case 'speech':
        return 'Speech-Language Pathologist';
      case 'counseling':
        return 'School Counselor';
      default:
        return 'Special Education Teacher';
    }
  }

  private getSubjectSpecificRequirements(subjectType: 'ela' | 'math'): string {
    if (subjectType === 'ela') {
      return `
ELA TOPIC RULES:
IF topic includes "reading" or "comprehension":
  - MUST include a complete story passage (200-300 words) as type:"passage" in Introduction section
  - Story must be complete and coherent
  - Include title for the story
  - Then add comprehension questions in Activity section
IF topic="decoding/phonics": NO story. Focus on letter sounds, word decoding. Example: "Sound out: cat"
IF topic="writing": NO story. Focus on sentence construction and writing prompts
IF topic="grammar/vocabulary": NO story. Focus on the specific concept
DEFAULT: Check if comprehension questions exist - if yes, include story`;
    } else {
      return `
MATH-SPECIFIC REQUIREMENTS:
- Use "visual-math" question type for computation problems
- Include clear number problems, word problems, and visual representations
- Focus on: computation, problem-solving, patterns, measurement, geometry, fractions
- Word problems should have realistic contexts students can understand
- Show mathematical thinking through step-by-step problem solving

MATH WORKSHEET CONTENT FOCUS:
- Computation practice appropriate for grade level
- Word problems with clear, realistic scenarios
- Visual math problems (shapes, patterns, graphs)
- Mathematical reasoning questions
- Grade-appropriate math concepts and operations

MATH EXAMPLES SECTION:
- For computation: "Remember to line up your numbers by place value"
- For word problems: "Read carefully and underline what the problem is asking"
- For fractions: "The top number is the numerator, the bottom is the denominator"
- For operations: "Add means to combine, subtract means to take away"`;
    }
  }

  private getActivityItemCount(students: { grade: number }[], duration?: number): string {
    // Filter out invalid grades and default to grade 3 if all invalid
    const validGrades = students.map(s => s.grade).filter(g => !isNaN(g) && g >= 0 && g <= 12);
    const maxGrade = validGrades.length > 0 ? Math.max(...validGrades) : 3;
    const effectiveDuration = duration || 30; // Default to 30 minutes if not specified

    // Get base counts and multiplier from shared constants
    const baseMin = getBaseMinimum(maxGrade);
    const baseMax = getBaseMaximum(maxGrade);
    const multiplier = getDurationMultiplier(effectiveDuration);

    // Calculate scaled counts
    const min = Math.ceil(baseMin * multiplier);
    const max = Math.ceil(baseMax * multiplier);

    return `${min}-${max}`;
  }

  private getMinimumActivityCount(students: { grade: number }[], duration?: number): number {
    // Filter out invalid grades and default to grade 3 if all invalid
    const validGrades = students.map(s => s.grade).filter(g => !isNaN(g) && g >= 0 && g <= 12);
    const maxGrade = validGrades.length > 0 ? Math.max(...validGrades) : 3;
    const effectiveDuration = duration || 30;
    const baseMin = getBaseMinimum(maxGrade);
    const multiplier = getDurationMultiplier(effectiveDuration);
    return Math.ceil(baseMin * multiplier);
  }

  private getExampleCount(duration?: number): string {
    const effectiveDuration = duration || 30;
    const range = getWhiteboardExampleRange(effectiveDuration);

    if (range.min === range.max) {
      return `${range.min}`;
    }
    return `${range.min}-${range.max}`;
  }

  // Helper function to determine target grade level for content difficulty
  private getTargetGradeLevel(student: any, role: string): number {
    if (role === 'resource') {
      return Math.max(0, student.grade - 1); // One grade below, minimum kindergarten
    }
    return student.grade; // Other roles use actual grade level
  }

  // Enhanced role-specific prompt with subject awareness
  private getRoleSpecificPrompt(role: LessonRequest['teacherRole'], subjectType: 'ela' | 'math'): string {
    const baseRoleContent = this.getBaseRoleContent(role);
    
    if (role === 'resource') {
      const subjectSpecific = subjectType === 'ela' 
        ? `For ELA worksheets specifically:
- Include complete story text when teaching story elements
- Reading comprehension questions based on provided text
- Vocabulary exercises with context from the story
- Writing prompts related to the story content
- Target reading/writing skills one grade level below student's current grade`
        : `For MATH worksheets specifically:
- Focus on computation, word problems, and mathematical reasoning
- Include step-by-step problem-solving activities
- Use visual representations for mathematical concepts
- Target specific math skills one grade level below student's current grade
- Include realistic word problem contexts students can understand`;
      
      return baseRoleContent + '\n\n' + subjectSpecific;
    }
    
    return baseRoleContent;
  }

  private getBaseRoleContent(role: LessonRequest['teacherRole']): string {
    switch (role) {
      case 'resource':
        return `RESOURCE SPECIALIST:
- Focus on skills one grade below student level
- Target IEP goals with scaffolding and differentiation`;

      case 'ot':
        return `OCCUPATIONAL THERAPY:
- Fine motor skills: tracing, mazes, letter formation
- Visual-motor integration through worksheet activities`;

      case 'speech':
        return `SPEECH-LANGUAGE PATHOLOGY:
- Articulation and phonological awareness
- Language development through worksheet exercises`;

      case 'counseling':
        return `SCHOOL COUNSELING:
- Social-emotional learning through written activities
- Problem-solving scenarios and reflection prompts`;

      default:
        return '';
    }
  }
}

// Export singleton instance
export const promptBuilder = new PromptBuilder();