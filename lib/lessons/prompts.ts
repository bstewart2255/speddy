// Role-based prompt templates for lesson generation
import { LessonRequest, determineGradeGroups } from './schema';

export class PromptBuilder {
  /**
   * Builds the system prompt based on teacher role
   */
  buildSystemPrompt(role: LessonRequest['teacherRole']): string {
    const basePrompt = `You are an expert ${this.getRoleTitle(role)} creating educational materials.

CRITICAL REQUIREMENTS:
1. Return ONLY a valid JSON object matching the LessonResponse schema
2. Materials allowed: ONLY worksheets, pencils, whiteboard, and dry erase markers
3. FORBIDDEN: scissors, glue, cutting, pasting, laminating, manipulatives, dice, cards, apps, websites, tablets, computers, movement activities
4. All activities must be completed at student desks
5. All materials must be included directly on the worksheets
6. Group students within 1 grade level for the same activities
7. Worksheets MUST contain complete, detailed content - not placeholders

JSON STRUCTURE (no comments, no markdown, no trailing commas):
{
  "lesson": {
    "title": "string",
    "duration": number,
    "objectives": ["string"],
    "materials": "Worksheets, pencils, whiteboard and markers only",
    "overview": "string",
    "introduction": { "description": "string", "duration": number, "instructions": ["string"], "materials": ["string"] },
    "mainActivity": { "description": "string", "duration": number, "instructions": ["string"], "materials": ["string"] },
    "closure": { "description": "string", "duration": number, "instructions": ["string"], "materials": ["string"] },
    "answerKey": {},
    "roleSpecificContent": {}
  },
  "studentMaterials": [{
    "studentId": "string",
    "gradeGroup": number,
    "worksheet": {
      "title": "string",
      "instructions": "string",
      "sections": [{
        "title": "string",
        "instructions": "string",
        "items": [{
          "sectionType": "warmup",
          "sectionTitle": "string",
          "instructions": "string",
          "items": [{
            "type": "visual",
            "content": "actual content text here",
            "choices": ["optional for multiple choice"],
            "blankLines": 2
          }]
        }]
      }],
      "accommodations": ["string"]
    }
  }],
  "metadata": {
    "gradeGroups": [{ "grades": [1], "studentIds": ["string"], "activityLevel": "on" }],
    "validationStatus": "passed"
  }
}

IMPORTANT: 
- Generate COMPLETE content, not placeholders. Include full story text, all questions, complete instructions.
- Return ONLY valid JSON - no comments, no markdown code blocks, no trailing commas.`;

    // Add role-specific requirements
    const rolePrompt = this.getRoleSpecificPrompt(role);
    
    return basePrompt + '\n\n' + rolePrompt;
  }

  /**
   * Builds the user prompt with student and lesson details
   */
  buildUserPrompt(request: LessonRequest): string {
    const gradeGroups = determineGradeGroups(request.students);
    
    let prompt = `Create a ${request.duration}-minute ${request.subject} lesson.\n`;
    
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
        prompt += `\nStudent ${student.id}:\n`;
        prompt += `- Grade: ${student.grade}\n`;
        
        if (student.readingLevel) {
          prompt += `- Reading Level: Grade ${student.readingLevel}\n`;
        }
        
        if (student.iepGoals && student.iepGoals.length > 0) {
          prompt += `- IEP Goals: ${student.iepGoals.join('; ')}\n`;
        }
        
        if (student.accommodations && student.accommodations.length > 0) {
          prompt += `- Accommodations Needed: ${student.accommodations.join('; ')}\n`;
        }
      });
      
      prompt += '\n';
    });
    
    prompt += `\nREMEMBER:
- Students in the same grade group should receive the same base activity
- Apply individual accommodations as listed
- All materials must be on the worksheet
- Use simple, clear instructions at appropriate reading levels
- Include visual supports where helpful
- Ensure activities can be completed in ${request.duration} minutes
- IMPORTANT: Each worksheet must contain actual content with real questions, problems, or tasks
- For story-based activities, include the complete story text in the worksheet
- Worksheets must have substantial content - not just placeholder text`;
    
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

  private getRoleSpecificPrompt(role: LessonRequest['teacherRole']): string {
    switch (role) {
      case 'resource':
        return `RESOURCE SPECIALIST FOCUS:
- Academic skill development in reading, math, and writing
- Align activities to grade-level standards with appropriate modifications
- Use evidence-based interventions and strategies
- Include explicit instruction and guided practice
- Provide scaffolding and differentiation strategies
- Focus on IEP goal progress

For ELA/Reading worksheets, include:
- Complete story text when teaching story elements (characters, setting, problem, solution)
- Reading comprehension questions based on the provided text
- Vocabulary exercises with context from the story
- Writing prompts related to the story

In roleSpecificContent, include:
- differentiationStrategies: Specific strategies for each grade group
- scaffoldingSteps: How to break down complex tasks`;

      case 'ot':
        return `OCCUPATIONAL THERAPY FOCUS:
- Fine motor skill development (pencil grip, hand strength, bilateral coordination)
- Visual-motor integration and visual perception
- Sensory regulation strategies that can be done at desk
- Handwriting and pre-writing skills
- Self-regulation and attention strategies
- Functional school skills

In roleSpecificContent, include:
- fineMotorActivities: Specific exercises for hand strength and coordination
- sensorySupports: Desk-based sensory strategies

IMPORTANT: All activities must be worksheet-based. Include:
- Tracing activities for pre-writing
- Mazes and dot-to-dot for visual-motor skills
- Coloring within boundaries for hand control
- Letter/number formation practice`;

      case 'speech':
        return `SPEECH-LANGUAGE PATHOLOGY FOCUS:
- Articulation and phonological awareness
- Receptive and expressive language development
- Vocabulary and concept development
- Grammar and syntax practice
- Social communication and pragmatics
- Following directions and comprehension

In roleSpecificContent, include:
- articulationTargets: Specific sounds or patterns to practice
- languageGoals: Language objectives being addressed

IMPORTANT: All activities must be worksheet-based. Include:
- Picture-based articulation practice
- Fill-in-the-blank for language structures
- Sequencing activities for narrative skills
- Question-answer formats for comprehension`;

      case 'counseling':
        return `SCHOOL COUNSELING FOCUS:
- Social-emotional learning (SEL) skills
- Emotion identification and regulation
- Problem-solving and decision-making
- Friendship and social skills
- Coping strategies and stress management
- Self-awareness and self-advocacy

Activities should include:
- Emotion identification worksheets
- Scenario-based problem solving
- Written reflection prompts
- Goal-setting exercises
- Coping strategy practice on paper`;

      default:
        return '';
    }
  }
}

// Export singleton instance
export const promptBuilder = new PromptBuilder();