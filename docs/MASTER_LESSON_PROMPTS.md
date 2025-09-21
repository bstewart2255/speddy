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
   ⚠️ CRITICAL VALIDATION REQUIREMENT ⚠️
   You MUST generate AT LEAST the minimum number of problems specified below.
   Generating fewer problems will cause IMMEDIATE VALIDATION FAILURE.
   Count carefully - each problem in the Activity section counts toward this total.

   COUNTING EXAMPLE: "12 problems" means 12 separate items like:
   - Problem 1: Multiple choice question
   - Problem 2: Fill in the blank
   - Problem 3: Short answer
   ... continuing until you have all 12 individual problems

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
- NEVER create activity sections with fewer than 6 items or more than 12 items

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
      }
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

---

## Recent Updates (v2.2) - Validation and Structure Fixes

### What Was Fixed

#### 1. Flat vs Nested Structure Support

**Problem**: AI was generating practice problems in both flat and nested structures, but validator only counted nested ones.

**Solution**:

- Updated validator to handle both structures:
  - Flat: Items directly in Activity section
  - Nested: Items wrapped in a group with `items` array
- This eliminated false "Found 0 problems" errors

#### 2. ActivityLevel Validation

**Problem**: AI sometimes generated `activityLevel: "at"` which failed validation.

**Solution**:

- Made validation more forgiving - now accepts "at" and maps it to "on"
- Added explicit comment in JSON schema example: `// MUST be exactly: "below", "on", or "above" (not "at")`
- Prevents total failure from minor variations

#### 3. Improved Retry Mechanism

**Problem**: Appending error feedback to system prompt confused the AI and corrupted JSON structure.

**Solution**:

- Retry now replaces the user prompt with clearer instructions instead of appending
- Provides structured retry requirements without making prompt too long
- Explicitly reminds about valid activityLevel values

#### 4. Enhanced Counting Examples

**Added to prompts**:

```
COUNTING EXAMPLE: "12 problems" means 12 separate items like:
- Problem 1: Multiple choice question
- Problem 2: Fill in the blank
- Problem 3: Short answer
... continuing until you have all 12 individual problems
```

---

## Recent Updates (v2.1) - Timeout and Problem Count Fixes

### What Was Fixed

#### 1. Timeout Issues

**Problem**: AI lesson generation was timing out after ~161 seconds, exceeding the 115-second timeout limit.

**Solution**:

- Increased client-side timeout from 115s to 180s (3 minutes) in `fetch-with-retry.ts`
- Updated server-side `maxDuration` from 120s to 300s (5 minutes) for platforms that support it
- This provides sufficient time for complex lessons with multiple students

#### 2. Insufficient Practice Problems

**Problem**: AI was generating only 5 problems when 16+ were required for 45-minute lessons.

**Solution**:

- Added warning symbols (⚠️) to make requirements more visually prominent
- Enhanced retry mechanism to parse validation errors and provide specific requirements
- On validation failure, the system now explicitly tells the AI the exact number needed
- Added `getMinimumActivityCount` helper to calculate and display exact minimums

#### 3. Enhanced Error Feedback

**New retry logic**:

- Parses validation errors to extract specific problem counts
- Provides explicit instructions like "MUST include AT LEAST 16 practice problems"
- Emphasizes that requirements are not optional
- Tells AI to count carefully and verify each student has the minimum

### Implementation Details

```typescript
// Enhanced retry feedback in generator.ts
let specificRequirements = '';
validation.errors.forEach(error => {
  if (error.includes('Insufficient practice problems')) {
    const match = error.match(/minimum (\d+) required/);
    if (match) {
      specificRequirements += `\n- MUST include AT LEAST ${match[1]} practice problems in the Activity section for each student`;
    }
  }
});

const errorFeedback =
  `PREVIOUS ATTEMPT HAD ERRORS:\n${validation.errors.join('\n')}\n\n` +
  `CRITICAL REQUIREMENTS TO FIX:${specificRequirements}\n\n` +
  `You MUST generate the exact number of items required. This is not optional.`;
```

### Key Takeaways

1. **Timeouts**: Always ensure timeout settings accommodate the slowest expected API response
2. **AI Instructions**: More explicit and visually prominent instructions improve compliance
3. **Retry Logic**: Specific, targeted feedback on retry attempts is more effective than generic messages
4. **Validation**: Clear validation rules with exact numbers help both AI and developers understand requirements

---

### Version 2.3 - Removed Retry Logic

After analysis showing that retry attempts often produced worse results (fewer problems generated on retry), we removed the retry mechanism entirely to focus on getting the first attempt right.

#### Changes Made

1. **Removed Retry Logic** (`generator.ts`)
   - Eliminated the `MAX_GENERATION_ATTEMPTS` constant and retry loop
   - Single attempt generation with clear, comprehensive prompts
   - Returns lesson with validation status regardless of validation outcome

2. **Benefits of Single-Attempt Approach**
   - **Token Savings**: Eliminates double API calls and token usage
   - **Clearer AI Instructions**: No confusion from retry prompts mixing with original prompts
   - **Better First Attempts**: Forces focus on making initial prompts more effective
   - **Simpler Code**: Removes complex retry logic and prompt reconstruction

3. **Implementation**

```typescript
// Before: Multiple attempts with retry logic
while (attempts < MAX_GENERATION_ATTEMPTS) {
  // Generate, validate, retry with modified prompts
}

// After: Single attempt with clear expectations
const fullPrompt = systemPrompt + '\n\nUSER REQUEST:\n' + userPrompt;
const lesson = await this.provider.generateLesson(enrichedRequest, fullPrompt);
const validation = materialsValidator.validateLesson(lesson);

// Return lesson with validation status
return {
  lesson,
  validation,
  metadata: toSafeMetadata(this.provider.getLastGenerationMetadata()),
};
```

4. **Focus Areas for Improvement**
   - Making initial prompts clearer and more explicit
   - Providing better examples in prompts
   - Ensuring counting requirements are unambiguous
   - Testing prompt effectiveness before deployment

### Key Principle

**"Better to optimize the first attempt than to rely on retries"** - This change emphasizes the importance of clear, effective initial prompts rather than depending on retry mechanisms that can confuse the AI and waste tokens.
