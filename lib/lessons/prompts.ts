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
3. Group students within 1 grade level
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

DIFFERENTIATION:
- Students in same grade group: identical activities
- Adjust language complexity based on reading level
- Target IEP goals when provided
- Resource role: content one grade below student level
- Mixed IEP goals: target majority, include minority when possible

${this.getSubjectSpecificRequirements(subjectType)}

TEACHER LESSON PLAN:
- Student initials: Use actual initials from student data
- Teacher script: 2-3 sentence introduction
- Whiteboard examples: Based on duration (5-15min: 2, 20-30min: 2-3, 45min: 3-4, 60+min: 4-5)
- Show all student problems with answers

JSON STRUCTURE: Follow LessonResponse schema with lesson, studentMaterials, and metadata objects.

KEY RULES:
- No placeholders - all content must be complete
- Use 2 sections only: Introduction, Activity
- Examples must show worked solutions, not tips
- Include teacherLessonPlan with all fields`;

    // Add role-specific requirements
    const rolePrompt = this.getRoleSpecificPrompt(role, subjectType);
    
    return basePrompt + '\n\n' + rolePrompt;
  }

  /**
   * Builds the user prompt with student and lesson details
   */
  buildUserPrompt(request: LessonRequest): string {
    const gradeGroups = determineGradeGroups(request.students);
    const minProblems = this.getMinimumActivityCount(request.students, request.duration);
    const maxProblems = Math.ceil(minProblems * 1.33); // ~33% more than minimum

    // CRITICAL: Start with problem count requirement
    let prompt = `CRITICAL REQUIREMENT: Generate between ${minProblems} and ${maxProblems} problems (inclusive) in the Activity section.\n`;
    prompt += `Each student worksheet MUST have between ${minProblems} and ${maxProblems} problems. This is MANDATORY.\n\n`;

    prompt += `Create a ${request.duration}-minute ${request.subjectType.toUpperCase()} lesson.\n`;
    prompt += `Subject: ${request.subject}\n`;

    if (request.topic) {
      prompt += `Topic: ${request.topic}\n`;
    }

    if (request.focusSkills && request.focusSkills.length > 0) {
      prompt += `Focus Skills: ${request.focusSkills.join(', ')}\n`;
    }

    prompt += `\nSTUDENT INFORMATION:\n`;
    prompt += `Total Students: ${request.students.length}\n`;
    prompt += `Grade Groups: ${gradeGroups.length}\n\n`;
    
    // Describe each grade group
    gradeGroups.forEach((group, index) => {
      const groupStudents = request.students.filter(s => 
        group.studentIds.includes(s.id)
      );
      
      prompt += `GRADE GROUP ${index + 1}:\n`;
      prompt += `Grades: ${group.grades.join(', ')}\n`;
      prompt += `Number of students: ${group.studentIds.length}\n`;
      
      groupStudents.forEach(student => {
        const studentIdentifier = student.initials || student.id;
        prompt += `\nStudent ${studentIdentifier}:\n`;
        prompt += `- Grade: ${student.grade}\n`;
        
        if (student.readingLevel) {
          prompt += `- Reading Level: Grade ${student.readingLevel}\n`;
        }
        
        if (student.iepGoals && student.iepGoals.length > 0) {
          prompt += `- IEP Goals: ${student.iepGoals.join('; ')}\n`;
        }
      });
      
      prompt += '\n';
    });
    
    // Add subject-specific reminders
    const subjectReminder = request.subjectType === 'ela'
      ? `SUBJECT-SPECIFIC REMINDERS:
- Include complete story text for reading activities
- Focus on reading comprehension, vocabulary, writing, or grammar
- Use grade-appropriate text complexity based on reading levels
- Questions should target: main idea, details, character analysis, sequence, cause/effect`
      : `SUBJECT-SPECIFIC REMINDERS:
- Focus on mathematical concepts and problem-solving
- Include computation practice and word problems  
- Use "visual-math" question type for math computations
- Use visual representations where helpful
- Target math skills appropriate for student levels`;

    prompt += `\nKEY REQUIREMENTS:
- Between ${minProblems} and ${maxProblems} problems per student (inclusive, as stated above)
- Use 2 sections: Introduction (1-2 examples), Activity (${minProblems}-${maxProblems} problems)
- Include teacherLessonPlan with ${this.getExampleCount(request.duration)} whiteboard examples
- Students in same grade group get identical activities
- Adjust difficulty based on reading levels
- Target IEP goals in content when provided

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
IF topic="reading/comprehension": Include story passage (100-200 words) FIRST, then comprehension questions
IF topic="decoding/phonics": NO story. Focus on letter sounds, word decoding. Example: "Sound out: cat"
IF topic="writing": NO story. Focus on sentence construction and writing prompts
IF topic="grammar/vocabulary": NO story. Focus on the specific concept
DEFAULT: Follow focusSkills array`;
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