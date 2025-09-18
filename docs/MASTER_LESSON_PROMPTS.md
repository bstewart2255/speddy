# Enhanced Lesson Generation Prompts

## Overview

This document contains the complete enhanced prompt system designed to generate consistent, structured, and functional worksheets through AI lesson generation. The approach prioritizes rigid formatting standards over AI creativity to ensure predictable, usable educational materials.

## Design Philosophy

- **Consistency over Creativity**: Standardized structures that teachers can rely on
- **Functional over Fancy**: Worksheets that actually work in classroom settings
- **Predictable Formatting**: Teachers know exactly what to expect every time
- **Grade-Appropriate Differentiation**: Smart content adjustment while maintaining structure

---

## Complete System Prompt Template

```typescript
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
   These are REQUIRED minimums that MUST be met - lessons with fewer items will be rejected:

   For 5-15 minute lessons:
   - Grades K-2: Exactly 6-8 practice problems in Activity section
   - Grades 3-5: Exactly 8-12 practice problems in Activity section

   For 20-30 minute lessons:
   - Grades K-2: Exactly 9-12 practice problems in Activity section
   - Grades 3-5: Exactly 12-18 practice problems in Activity section

   For 45 minute lessons:
   - Grades K-2: Exactly 12-16 practice problems in Activity section
   - Grades 3-5: Exactly 16-24 practice problems in Activity section

   For 60 minute lessons:
   - Grades K-2: Exactly 15-20 practice problems in Activity section
   - Grades 3-5: Exactly 20-30 practice problems in Activity section

   - Include variety: mix of question types appropriate for the subject
   - CRITICAL: These are MINIMUM requirements - generating fewer will cause validation failure

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

TEACHER LESSON PLAN REQUIREMENTS (MANDATORY):
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

4. WHITEBOARD EXAMPLES (DURATION-BASED REQUIREMENTS):
   Number of examples required based on lesson duration:
   - 5-15 minutes: Exactly 2 examples
   - 20-30 minutes: Exactly 2-3 examples
   - 45 minutes: Exactly 3-4 examples
   - 60 minutes: Exactly 4-5 examples

   - Each example must include:
     * Problem statement
     * Step-by-step solution (numbered steps without "Step N:" prefix)
     * Teaching point to emphasize
   - Examples MUST correspond to worksheet problem types

5. STUDENT PROBLEMS DISPLAY:
   - Show ALL problems from ALL student worksheets
   - Include the correct answer for each problem
   - Group by student if differentiated

SUBJECT-SPECIFIC REQUIREMENTS:

ELA-SPECIFIC REQUIREMENTS:
- ALWAYS include complete story text as a type:"passage" item BEFORE comprehension questions
- Story/passage should be 100-200 words, grade-appropriate
- Focus on vocabulary, reading fluency, writing, grammar, or phonics
- Questions should target: main idea, details, character analysis, sequence, cause/effect
- Writing prompts should be clear and grade-appropriate
- Include context clues for vocabulary questions

ELA WORKSHEET CONTENT STRUCTURE:
For reading comprehension lessons, Activity section MUST follow this pattern:
1. FIRST ITEM: type: "passage" with the complete story text
2. FOLLOWING ITEMS: comprehension questions about that specific passage

Example: Instead of "What lesson does Tom learn?" without context,
Generate: type:"passage" with "Tom was a young boy who... [full story]"
Then: "What lesson does Tom learn in the story above?"

ELA WORKSHEET CONTENT FOCUS:
- Reading passages with comprehension questions (passage MUST be included)
- Vocabulary exercises with sentence context
- Writing activities (sentences, paragraphs, creative writing)
- Grammar practice (parts of speech, sentence structure)
- Phonics/spelling activities for younger grades

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
- Single word responses (decode, spell): Always use 1 blankLine only

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
- For operations: "Add means to combine, subtract means to take away"

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
          "title": "Introduction",
          "instructions": "Read the instructions and examples below",
          "items": [{
            "sectionType": "introduction",
            "sectionTitle": "Getting Started",
            "instructions": "Review these examples before starting the activity",
            "items": [
              {
                "type": "example",
                "content": "Example problem or instruction text here"
              }
            ]
          }]
        },
        {
          "title": "Activity",
          "instructions": "Complete all problems below",
          "items": [{
            "sectionType": "practice",
            "sectionTitle": "Practice Problems",
            "instructions": "Work through each problem carefully",
            "items": [
              {
                "type": "multiple-choice|fill-blank|short-answer|long-answer|visual-math",
                "content": "Complete question text here",
                "choices": ["option 1", "option 2", "option 3", "option 4"],
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
    "gradeGroups": [{ "grades": [1], "studentIds": ["string"], "activityLevel": "on" }],
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
- NEVER create activity sections with fewer than 6 items or more than 12 items

IMPORTANT:
- Generate COMPLETE content, not placeholders. Include full story text, all questions, complete instructions.
- Return ONLY valid JSON - no comments, no markdown code blocks, no trailing commas.
- Each question must be grade-appropriate and align with the specified subject area.

CRITICAL FOR ELA READING COMPREHENSION LESSONS:
When creating reading comprehension activities, the worksheet MUST include:
1. FIRST: A complete story/passage as a separate item with type: "passage"
2. THEN: Comprehension questions about that passage

REQUIRED STRUCTURE FOR READING PASSAGES:
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
      }
    ],
    "sectionType": "practice",
    "sectionTitle": "Reading Comprehension"
  }]
}

NEVER generate comprehension questions without including the actual story text first!`;

  // Add role-specific requirements
  const rolePrompt = this.getRoleSpecificPrompt(role, subjectType);

  return basePrompt + '\n\n' + rolePrompt;
}
```

---

## Complete User Prompt Template

```typescript
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
- Follow context-based blank line rules (1 line for single words, grade-based for others)
- Multiple choice questions must have exactly 4 choices (text only, no letter prefixes)
- Include ${this.getActivityItemCount(request.students)} practice items in Activity section
- Introduction section should have 1-2 example/instruction items only
- All content must be complete and ready-to-use, no placeholders
- Questions should be ${request.subjectType.toUpperCase()}-focused and grade-appropriate
- Adjust language complexity based on individual reading levels
- Worksheet instructions should be specific to the content or omitted entirely (no generic instructions)
- Incorporate IEP goals into question content where applicable

${subjectReminder}

REMEMBER:
- Students in the same grade group should receive the same base activity
- Adjust content difficulty based on individual reading levels listed above
- Use simple, clear instructions at appropriate reading levels
- Include visual supports where helpful for math problems
- Ensure activities can be completed in ${request.duration} minutes
- IMPORTANT: Each worksheet must contain actual content with real questions, problems, or tasks
- For story-based activities, include the complete story text in the worksheet
- Worksheets must have substantial content - not just placeholder text`;

  return prompt;
}
```

---

## Helper Functions

```typescript
// Updated LessonRequest interface to include subjectType
interface LessonRequest {
  students: StudentProfile[];
  teacherRole: 'resource' | 'ot' | 'speech' | 'counseling';
  subject: string;
  subjectType: 'ela' | 'math'; // NEW: explicit subject type selection
  topic?: string;
  duration: number;
  focusSkills?: string[];
  lessonDate?: string;
  timeSlot?: string;
}

private getActivityItemCount(students: StudentProfile[]): string {
  const maxGrade = Math.max(...students.map(s => s.grade));
  if (maxGrade <= 2) {
    return '6-8'; // Grades K-2: 6-8 items
  } else {
    return '8-12'; // Grades 3-5: 8-12 items
  }
}

private getBlankLineCount(grade: number, questionType: string): number {
  if (questionType === 'visual-math' || questionType === 'multiple-choice') {
    return 0;
  }

  if (grade <= 1) {
    return 4; // K-1: always 4 lines
  } else if (grade <= 3) {
    return questionType === 'long-answer' ? 5 : 3; // 2-3: 3 for short, 5 for long
  } else {
    return questionType === 'long-answer' ? 4 : 2; // 4-5: 2 for short, 4 for long
  }
}

// Helper function to determine target grade level for content difficulty
private getTargetGradeLevel(student: StudentProfile, role: string): number {
  if (role === 'resource') {
    return Math.max(0, student.grade - 1); // One grade below, minimum kindergarten
  }
  return student.grade; // Other roles use actual grade level
}

// Subject-specific prompt builder
private getSubjectSpecificPrompt(subjectType: 'ela' | 'math'): string {
  // This would be integrated into the main system prompt
  // Content shown above in SUBJECT-SPECIFIC REQUIREMENTS section
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
```

---

## Formatting Examples

### ✅ GOOD - Consistent Structure

```json
{
  "worksheet": {
    "sections": [
      {
        "title": "Introduction",
        "items": [
          {
            "sectionType": "introduction",
            "items": [
              {
                "type": "example",
                "content": "Example: 2 + 3 = 5. When adding, count up from the first number."
              }
            ]
          }
        ]
      },
      {
        "title": "Activity",
        "items": [
          {
            "sectionType": "practice",
            "items": [
              {
                "type": "visual-math",
                "content": "4 + 6 = ____"
              },
              {
                "type": "multiple-choice",
                "content": "What is 7 + 2?",
                "choices": ["8", "9", "10", "11"]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### ❌ BAD - Inconsistent Structure

```json
{
  "worksheet": {
    "sections": [
      {
        "title": "Warm-Up", // Wrong section name (should be Introduction/Activity)
        "items": [
          {
            "sectionType": "problems", // Wrong section type
            "items": [
              {
                "type": "question", // Invalid question type
                "content": "Problem 1", // Placeholder content
                "choices": ["1. 4", "2. 5", "3. 6"] // Wrong format, missing option
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

## Implementation Notes

### Validation Updates Needed

The existing MaterialsValidator should be enhanced to check:

- Section structure (exactly 2 sections: Introduction, Activity)
- Question types (only the 5 allowed types + "example" for Introduction)
- Blank line counts match grade-based rules
- Multiple choice format (exactly 4 options, A-D labels)
- Activity section has appropriate item count (6-12 items based on grade)

### Testing Strategy

- Generate lessons for different grade combinations
- Verify consistent formatting across multiple generations
- Check that IEP goals are appropriately integrated
- Ensure reading level adjustments work correctly
- Validate that no placeholder content is generated

### Future Enhancements

- Subject-specific formatting rules (math vs reading worksheets)
- Seasonal/thematic content constraints
- Advanced IEP goal targeting
- Visual element specifications for math problems

---

## Rationale for Constraints

### Why Simplified 2-Section Structure?

- More realistic lesson flow: teacher introduces, students practice
- Simpler for teachers to manage (no artificial warm-up/wrap-up)
- More time allocated to actual practice activities
- Cleaner worksheet design focused on learning objectives
- Matches how teachers actually structure lessons

### Why Standardized Question Types?

- Eliminates formatting confusion
- Teachers know how to grade each type
- Students become familiar with formats
- Reduces AI creativity that leads to unusable formats

### Why Grade-Based Blank Line Rules?

- Appropriate for different writing abilities
- Consistent spacing for similar grade levels
- Prevents AI from arbitrary decisions
- Matches typical classroom expectations

### Why Activity Item Count Ranges?

- Ensures appropriate workload for grade levels (6-8 for K-2, 8-12 for 3-5)
- Prevents overwhelming younger students with too many problems
- Guarantees sufficient practice for older students
- Provides flexibility while maintaining structure
- Makes lesson timing predictable (more items = longer lessons)

---

## Recent Updates (September 2025)

### Formatting Fixes (Issue #268)

- **Multiple Choice**: Choices must be text-only; the renderer adds A-D labels automatically
- **Step Numbering**: Cleaned up duplicate numbering in lesson plans
- **Examples**: Clarified that examples must be worked solutions, not tips
- **Data Structure**: Simplified nested rendering for cleaner output

### Version 2.0 - Formatting and Logic Fixes

The following improvements were made to address formatting issues and enhance lesson quality:

#### 1. Student Identification

- **Changed**: System now uses actual student initials from database (e.g., "J.B.", "G.B.")
- **Previous**: Used truncated student IDs (e.g., "E6", "C3")
- **Impact**: Teacher lesson plans now show meaningful student identifiers

#### 2. Multiple Choice Formatting

- **Changed**: Choices array must contain text only, no letter prefixes
- **Previous**: AI sometimes included letters in choices causing duplicate prefixes
- **Impact**: Clean formatting without "A. A. Red" type errors

#### 3. Context-Aware Examples

- **Changed**: Examples are now subject and activity-specific
- **Previous**: Generic "main idea" example appeared in all worksheets
- **Impact**: Relevant examples that match the lesson content

#### 4. Improved Blank Lines Logic

- **Changed**: Single word answers use 1 line, context-based rules for others
- **Previous**: All responses used grade-based rules regardless of answer length
- **Impact**: Appropriate space for different answer types

#### 5. AI Logic Rules for ELA

- **Changed**: Added explicit rules to prevent illogical question formats
- **Previous**: AI could create questions like "Read 'my'" with 'my' as an option
- **Impact**: Logically sound questions that make pedagogical sense

#### 6. Teacher Lesson Plan Structure

- **Changed**: When teacherLessonPlan exists, only that renders (no duplicate content)
- **Previous**: Both old and new formats appeared causing duplication
- **Impact**: Clean, single presentation of lesson plan

#### 7. Step Numbering

- **Changed**: Steps in solutions no longer include "Step N:" prefix
- **Previous**: Redundant numbering with ordered lists
- **Impact**: Clean numbered lists without redundancy

#### 8. Worksheet Instructions

- **Changed**: Instructions should be content-specific or omitted
- **Previous**: Generic "Complete all problems" on every worksheet
- **Impact**: Meaningful instructions when needed, none when obvious

### Implementation Notes for v2.0

These updates maintain backward compatibility while improving output quality. The key changes are:

1. **Database Integration**: Student initials must be fetched from the `students` table
2. **Prompt Clarity**: More explicit instructions prevent AI confusion
3. **Renderer Logic**: Conditional rendering prevents duplicate content
4. **Validation Updates**: Ensure new rules are enforced during generation

All changes are reflected in the prompt templates above and should be used for any new implementations or updates to the lesson generation system.
