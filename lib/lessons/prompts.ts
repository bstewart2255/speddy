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

CRITICAL REQUIREMENTS:
1. Return ONLY a valid JSON object matching the LessonResponse schema
2. Materials allowed: ONLY worksheets, pencils, whiteboard, and dry erase markers
3. FORBIDDEN: scissors, glue, cutting, pasting, laminating, manipulatives, dice, cards, apps, websites, tablets, computers, movement activities
4. All activities must be completed at student desks
5. All materials must be included directly on the worksheets
6. Group students within 1 grade level for the same activities
7. Worksheets MUST contain complete, detailed content - not placeholders

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
   
3. BLANK LINE RULES (context-based):
   - For single word answers (decode, spell, identify): Use 1 blankLine regardless of grade
   - For short answers (Grade K-1): Use 3 blankLines
   - For short answers (Grade 2-3): Use 2 blankLines
   - For short answers (Grade 4-5): Use 2 blankLines
   - For long answers (Grade K-1): Use 4 blankLines
   - For long answers (Grade 2-3): Use 4 blankLines
   - For long answers (Grade 4-5): Use 3 blankLines

4. MULTIPLE CHOICE FORMAT:
   - Always exactly 4 options
   - CRITICAL: Do NOT include letter prefixes in the choices array
   - Correct: ["Red", "Blue", "Green", "Yellow"]
   - WRONG: ["A. Red", "B. Blue", "C. Green", "D. Yellow"]
   - The rendering system will add letters automatically
   - One clearly correct answer
   - Distractors should be plausible but wrong

5. ACTIVITY ITEM COUNTS (DURATION-BASED MANDATORY MINIMUMS):

   🚨🚨🚨 CRITICAL VALIDATION REQUIREMENT 🚨🚨🚨
   FAILURE TO MEET THESE MINIMUMS WILL CAUSE IMMEDIATE REJECTION

   You MUST generate AT LEAST the minimum number of problems specified below.
   The Activity section items array MUST contain the required number of problem objects.

   ⚠️ COUNTING INSTRUCTIONS - READ CAREFULLY:
   - Count EACH problem as a separate item in the items array
   - If you need 12 problems, the items array must have 12 objects
   - Each object should have type: "multiple-choice", "fill-blank", "short-answer", etc.
   - Do NOT group multiple problems into one item
   - Do NOT use placeholders or suggestions instead of actual problems

   EXAMPLE OF CORRECT STRUCTURE FOR 12 PROBLEMS:
   "items": [
     {"type": "multiple-choice", "question": "Problem 1...", ...},
     {"type": "fill-blank", "question": "Problem 2...", ...},
     {"type": "short-answer", "question": "Problem 3...", ...},
     {"type": "multiple-choice", "question": "Problem 4...", ...},
     {"type": "fill-blank", "question": "Problem 5...", ...},
     {"type": "short-answer", "question": "Problem 6...", ...},
     {"type": "multiple-choice", "question": "Problem 7...", ...},
     {"type": "fill-blank", "question": "Problem 8...", ...},
     {"type": "short-answer", "question": "Problem 9...", ...},
     {"type": "multiple-choice", "question": "Problem 10...", ...},
     {"type": "fill-blank", "question": "Problem 11...", ...},
     {"type": "short-answer", "question": "Problem 12...", ...}
   ]

   For 5-15 minute lessons:
   - Grades K-2: Target 6-8 practice problems (minimum 6) in Activity section
   - Grades 3-5: Target 8-12 practice problems (minimum 8) in Activity section

   For 20-30 minute lessons:
   - Grades K-2: Target 9-12 practice problems (minimum 9) in Activity section
   - Grades 3-5: Target 12-18 practice problems (minimum 12) in Activity section

   For 45 minute lessons:
   - Grades K-2: Target 12-16 practice problems (minimum 12) in Activity section
   - Grades 3-5: Target 16-24 practice problems (minimum 16) in Activity section

   For 60+ minute lessons:
   - Grades K-2: Target 15-20 practice problems (minimum 15) in Activity section
   - Grades 3-5: Target 20-30 practice problems (minimum 20) in Activity section

   - Include variety: mix of question types appropriate for the subject
   - ⚠️ VALIDATION WILL FAIL if you generate fewer than the minimum problems
   - ⚠️ COUNT CAREFULLY: Only problems in the "Activity" section count (not examples)
   - ⚠️ Each student must have the minimum number of practice problems

STUDENT DIFFERENTIATION REQUIREMENTS:

1. READING LEVEL ADJUSTMENTS:
   - If reading level below grade: Use simpler vocabulary, shorter sentences
   - If reading level at grade: Use grade-appropriate text complexity  
   - If reading level above grade: Can use slightly more complex language

2. IEP GOAL INTEGRATION:
   - Math IEP goals: Include problems that target specific math skills mentioned
   - Reading IEP goals: Include vocabulary, fluency, or comprehension activities
   - Writing IEP goals: Include writing prompts or sentence-building exercises

3. GRADE GROUP DIFFERENTIATION:
   - Students in same grade group get identical base activities
   - Adjust difficulty within grade group based on individual reading levels
   - Target IEP goals through question content, not structure changes

CONTENT TARGETING WHEN NO IEP GOALS PROVIDED:
- Resource: Focus on skills ONE GRADE LEVEL BELOW the student's current grade (e.g., Grade 3 student gets Grade 2 level content) as students in special education typically perform below grade level
- OT: Target fundamental fine motor and visual-motor skills for grade level
- Speech: Address basic articulation and language skills appropriate for grade
- Counseling: Focus on age-appropriate social-emotional development

If no IEP goals specified, include activities that address:
- Resource: Foundational skills from the previous grade level in the specified subject
- OT: Grade-appropriate motor skills that support classroom participation
- Speech: Common speech/language needs for the student's age group
- Counseling: Social-emotional skills typical for the student's developmental stage
- Skills that support general classroom success and build confidence

MIXED IEP GOAL HANDLING:
- When students in same grade group have different IEP goals:
  1. Create content targeting the MAJORITY of students' goals
  2. Include 1-2 problems addressing minority goals when possible
  3. Students without IEP goals receive grade-level foundational content
  
- For conflicting math IEP goals in same group:
  1. Choose the most fundamental skill as primary focus
  2. Include secondary skills as additional questions
  3. Prioritize: computation > word problems > advanced concepts

${this.getSubjectSpecificRequirements(subjectType)}

TEACHER LESSON PLAN REQUIREMENTS (NEW - MANDATORY):
The lesson MUST include a structured teacher lesson plan with these exact components:

1. STUDENT INITIALS:
   - Use the actual student initials provided (e.g., "J.B.", "G.B.")
   - Format: ["J.D.", "M.S.", "A.P."] for quick reference

2. LESSON TOPIC:
   - Clear, specific statement matching worksheet content
   - Example: "Adding Fractions with Like Denominators"

3. TEACHER INTRODUCTION SCRIPT:
   - Conversational text the teacher reads aloud (2-3 sentences)
   - Connect to real-world examples students understand
   - Engaging and age-appropriate
   - Example: "Today we're learning about adding fractions with the same bottom number. Think of it like adding slices of the same pizza!"

4. WHITEBOARD EXAMPLES (DURATION-BASED REQUIREMENTS):
   Number of examples required based on lesson duration:
   - 5-15 minutes: Exactly 2 examples
   - 20-30 minutes: Exactly 2-3 examples
   - 45 minutes: Exactly 3-4 examples
   - 60 minutes: Exactly 4-5 examples

   - Each example must include:
     * Problem statement
     * Step-by-step solution (as array of strings, NO numbering - just the step text)
     * Teaching point to emphasize
   - Examples MUST correspond to worksheet problem types
   - Include visual representations where helpful
   - Steps format: ["First, identify the...", "Next, calculate...", "Finally, check..."]
   - DO NOT include: ["1. First...", "Step 1: First...", "(1) First..."]

5. STUDENT PROBLEMS DISPLAY:
   - Show ALL problems from ALL student worksheets
   - Include the correct answer for each problem
   - If students have different worksheets, show ALL variations
   - Group by student initials if differentiated

JSON STRUCTURE (STRICT - no deviations):
{
  "lesson": {
    "title": "string",
    "duration": number,
    "objectives": ["string"],
    "materials": "Worksheets, pencils, whiteboard and markers only",
    "overview": "string",
    "introduction": { "description": "string", "duration": number, "instructions": ["string"], "materials": ["string"] },
    "activity": { "description": "string", "duration": number, "instructions": ["string"], "materials": ["string"] },
    "teacherLessonPlan": {
      "studentInitials": ["string"],
      "topic": "string",
      "teacherIntroduction": {
        "script": "string",
        "materials": ["whiteboard", "markers"],
        "visualAids": ["string"]
      },
      "whiteboardExamples": [
        {
          "number": 1,
          "title": "string",
          "problem": "string",
          "steps": ["string"],
          "teachingPoint": "string"
        }
      ],
      "studentProblems": [
        {
          "studentInitials": "string",
          "problems": [
            {
              "number": "string",
              "question": "string",
              "questionType": "multiple-choice|fill-blank|short-answer|visual|long-answer",
              "choices": ["string"],
              "answer": "string",
              "solution": ["string"],
              "commonErrors": ["string"]
            }
          ]
        }
      ],
      "teachingNotes": {
        "pacing": ["string"],
        "differentiation": ["string"],
        "checkpoints": ["string"]
      }
    },
    "answerKey": {},
    "roleSpecificContent": {}
  },
  "studentMaterials": [{
    "studentId": "string",
    "gradeGroup": number,
    "worksheet": {
      "title": "[Subject] Practice - Grade [X]",
      "instructions": "",
      "sections": [
        {
          "title": "Examples",
          "instructions": "Review these examples before starting",
          "items": [
            {
              "type": "example",
              "content": "MUST be a complete worked example showing HOW to solve a problem, not a suggestion. For math: '3 + 2 = 5 (count 3 fingers, add 2 more)'. For reading: 'The word CAT has 3 sounds: /k/ /a/ /t/'. NOT suggestions like 'Look for key words' or 'Remember to check your work'."
            }
          ]
        },
        {
          "title": "Activity",
          "instructions": "Complete all problems below",
          "items": [{
            "sectionType": "practice",
            "sectionTitle": "Practice Problems",
            "instructions": "Work through each problem carefully",
            "items": [
              // 🚨 CRITICAL: Generate EXACTLY the required number of problems here
              // For 45-min Grade 1-2: MUST have 12+ separate problem objects
              // For 45-min Grade 3-5: MUST have 16+ separate problem objects
              // Each problem is a separate object in this array
              {
                "type": "multiple-choice|fill-blank|short-answer|long-answer|visual-math",
                "content": "Complete question text here",
                "choices": ["option text 1", "option text 2", "option text 3", "option text 4"],
                "blankLines": 3
              }
            ]
          }]
        }
      ],
      "accommodations": ["string"]
    }
  }],
  "metadata": {
    "gradeGroups": [{
      "grades": [1],
      "studentIds": ["string"],
      "activityLevel": "on"  // MUST be exactly: "below", "on", or "above" (not "at")
    }],
    "validationStatus": "passed"
  }
}

ERROR PREVENTION:
- NEVER use "problem-1", "question-2", "[insert content]", "add content here" as content
- NEVER use placeholder text - include complete, real questions and problems
- NEVER vary from the 2-section structure (Introduction, Activity)
- NEVER use question types other than the 6 listed above
- NEVER vary blankLines counts from the grade-based rules
- NEVER use numbers (1,2,3,4) for multiple choice - renderer will label choices A,B,C,D; provide text-only choices
- NEVER create activity sections with fewer than the duration-based minimum (see requirements above)
- ALWAYS include teacherLessonPlan with all required fields
- ALWAYS include the required number of whiteboard examples based on lesson duration (see duration-based requirements above)
- ALWAYS show ALL student problems with answers in teacherLessonPlan
- EXAMPLES must be WORKED examples with solutions, NOT tips or suggestions
- For math examples: Show the problem AND the complete solution process
- For reading examples: Show actual words/sentences being decoded or analyzed
- WRONG example: "Remember to look for context clues"
- RIGHT example: "The word 'happy' means feeling good. In 'The happy dog wagged its tail', we know the dog feels good."

IMPORTANT:
- Generate COMPLETE content, not placeholders. Include full story text, all questions, complete instructions.
- Return ONLY valid JSON - no comments, no markdown code blocks, no trailing commas.
- Each question must be grade-appropriate and align with the specified subject area.

CRITICAL - ONLY FOR READING COMPREHENSION LESSONS:
IF the topic is "reading comprehension" or includes "story", the worksheet MUST include:
1. FIRST: A complete story/passage as a separate item with type: "passage"
2. THEN: Comprehension questions about that passage

REQUIRED STRUCTURE FOR READING PASSAGES (reading comprehension only):
The Activity section must start with the passage, like this:
{
  "title": "Activity",
  "items": [{
    "items": [
      {
        "type": "passage",
        "content": "The Brave Little Fox\\n\\nOnce upon a time, there was a little fox who lived in the forest. [CONTINUE WITH COMPLETE 100-200 WORD STORY appropriate for grade level]"
      },
      {
        "type": "short-answer",
        "content": "What is the main idea of the story?",
        "blankLines": 2
      },
      {
        "type": "multiple-choice",
        "content": "Who is the main character?",
        "choices": ["The fox", "The rabbit", "The bear", "The owl"],
        "blankLines": 0
      }
      // ... more comprehension questions
    ],
    "sectionType": "practice",
    "sectionTitle": "Reading Comprehension"
  }]
}

NEVER generate comprehension questions without including the actual story text first!

REMEMBER: Stories are ONLY for reading comprehension lessons. For decoding, phonics, grammar, or writing lessons, focus on those specific skills without a story passage.`;

    // Add role-specific requirements
    const rolePrompt = this.getRoleSpecificPrompt(role, subjectType);
    
    return basePrompt + '\n\n' + rolePrompt;
  }

  /**
   * Builds the user prompt with student and lesson details
   */
  buildUserPrompt(request: LessonRequest): string {
    const gradeGroups = determineGradeGroups(request.students);
    
    let prompt = `SUBJECT FOCUS: ${request.subjectType.toUpperCase()}\n`;
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

    prompt += `\nFORMATTING REMINDERS:
- Use exactly 2 worksheet sections: Introduction, Activity
- Follow grade-based blank line rules: K-1 use 4 lines, 2-3 use 3 lines, 4-5 use 2 lines
- Multiple choice questions must have exactly 4 choices (A, B, C, D)
- ⚠️ MANDATORY: Include EXACTLY ${this.getActivityItemCount(request.students, request.duration)} practice problems in the Activity section (minimum ${this.getMinimumActivityCount(request.students, request.duration)})
- ⚠️ COUNT VERIFICATION: You MUST generate at least ${this.getMinimumActivityCount(request.students, request.duration)} individual problem items in the Activity section
- ⚠️ STRUCTURE: Activity section must have items array with ${this.getMinimumActivityCount(request.students, request.duration)}+ problem objects
- Introduction section should have 1-2 example/instruction items only
- All content must be complete and ready-to-use, no placeholders
- Questions should be ${request.subjectType.toUpperCase()}-focused and grade-appropriate
- Adjust language complexity based on individual reading levels
- Worksheet instructions should be specific to the content or omitted entirely (no generic instructions)
- Incorporate IEP goals into question content where applicable

${subjectReminder}

TEACHER LESSON PLAN SPECIFIC REQUIREMENTS:
- Use the actual student initials provided in the student information
- The lesson topic must match the worksheet content exactly
- Teacher introduction script should be 2-3 sentences, conversational and engaging
- Include ${this.getExampleCount(request.duration)} whiteboard examples that correspond to worksheet problems
- Each whiteboard example needs numbered steps and a teaching point
- In studentProblems, show ALL problems from ALL worksheets with correct answers
- If students have different worksheets, show all variations grouped by student
- Include common errors and solutions where helpful for complex problems

REMEMBER:
- Students in the same grade group should receive the same base activity
- Adjust content difficulty based on individual reading levels listed above
- Use simple, clear instructions at appropriate reading levels
- Include visual supports where helpful for math problems
- Ensure activities can be completed in ${request.duration} minutes
- IMPORTANT: Each worksheet must contain actual content with real questions, problems, or tasks
- For story-based activities, include the complete story text in the worksheet
- Worksheets must have substantial content - not just placeholder text
- The teacherLessonPlan is FOR THE TEACHER - make it practical and immediately usable`;
    
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
ELA-SPECIFIC REQUIREMENTS:

IMPORTANT: Choose content based on the lesson topic/focus:

FOR READING COMPREHENSION LESSONS (topic includes "reading", "comprehension", "story"):
- MUST include complete story text as a type:"passage" item BEFORE comprehension questions
- Story/passage should be 100-200 words, grade-appropriate
- Questions should target: main idea, details, character analysis, sequence, cause/effect
- Structure: First item is passage, followed by comprehension questions about that passage

FOR DECODING/PHONICS LESSONS (topic includes "decoding", "phonics", "letter sounds"):
- DO NOT include a story passage
- Focus on letter-sound relationships, word decoding, syllable breaking
- Include words to decode, sound out, or identify
- Use fill-blank for writing decoded words (1 blankLine)
- Include letter recognition and formation practice
- Example problems: "Sound out: cat", "Circle the word that says 'dog'", "Write the missing letter: b_t"

FOR WRITING LESSONS (topic includes "writing", "sentences", "paragraphs"):
- DO NOT include a story passage unless for inspiration
- Focus on sentence construction, capitalization, punctuation, spacing
- Include writing prompts appropriate to grade level
- Use appropriate blankLines for extended responses

FOR GRAMMAR/VOCABULARY LESSONS:
- DO NOT include a story passage unless as context
- Focus on the specific grammar concept or vocabulary words
- Include practice identifying and using the target skill

DEFAULT: If topic is unclear, focus on the skills mentioned in focusSkills array.

ELA WORKSHEET CONTENT FOCUS (varies by topic):
- Reading comprehension: passages with questions (passage MUST be included for this topic)
- Decoding/phonics: letter sounds, word decoding, syllable work (NO passage needed)
- Vocabulary: exercises with sentence context (passage optional)
- Writing: sentence/paragraph construction (passage optional)
- Grammar: parts of speech, sentence structure (passage optional)

ELA EXAMPLES SECTION:
- For phonics/decoding: "To decode a word, sound out each letter: c-a-t = cat"
- For sight words: "These are words you should know by sight: the, of, to, you"
- For reading comprehension: "To find the main idea, look for what the whole story is about"
- For writing: "Start your sentence with a capital letter and end with a period"

CRITICAL ELA QUESTION RULES:
- For "Read the word X" multiple choice questions: NEVER show the target word as one of the options
- Instead use: "Which word is 'my'?" or "Find the word that says 'my'"
- For decoding questions: Use fill-blank type with 1 blankLine, ask students to write the decoded word
- For sight word identification: Show 4 different words, ask which one matches the spoken/target word
- Single word responses (decode, spell): Always use 1 blankLine only`;
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
        return `RESOURCE SPECIALIST FOCUS:
- Academic skill development in reading, math, and writing
- Align activities to grade-level standards with appropriate modifications
- Use evidence-based interventions and strategies
- Include explicit instruction and guided practice
- Provide scaffolding and differentiation strategies
- Focus on IEP goal progress

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