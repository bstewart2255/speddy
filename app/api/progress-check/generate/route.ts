import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { z } from 'zod';

// Extended timeout for AI generation
export const maxDuration = 300; // 5 minutes

// Zod schema for progress check response validation
// Note: No scoringNotes field - worksheets are student-facing only
const AssessmentItemSchema = z.object({
  type: z.enum(['multiple_choice', 'short_answer', 'problem', 'observation']),
  prompt: z.string(),
  passage: z.string().optional(), // For reading comprehension questions
  options: z.array(z.string()).optional(),
});

const IEPGoalAssessmentSchema = z.object({
  goal: z.string(),
  assessmentItems: z.array(AssessmentItemSchema),
});

const WorksheetSchema = z.object({
  studentInitials: z.string(),
  iepGoals: z.array(IEPGoalAssessmentSchema),
});

// System prompt for progress check generation
const SYSTEM_PROMPT = `You are an expert special education assessment designer. Create assessment items to evaluate student progress on IEP goals.

CRITICAL RULES:
1. This worksheet is for STUDENTS to complete, NOT teachers
2. Do NOT include teacher notes, scoring criteria, scoring rubrics, or assessment guidelines
3. Do NOT mention IEP goals on the worksheet - students should only see questions
4. Do NOT include any meta-commentary about what the question tests
5. All prompts must be direct instructions the student can read and follow

REQUIREMENTS:
1. Test EVERY IEP goal provided
2. Generate EXACTLY 3 assessment items per goal
3. Vary formats based on goal type
4. Keep language grade-appropriate and student-friendly
5. For reading comprehension goals, ALWAYS include a passage followed by questions
6. For writing goals, specify how many sentences or paragraphs to write

ALLOWED ASSESSMENT TYPES - YOU MUST USE ONLY THESE 4 TYPES:
1. "multiple_choice" - Questions with 4 answer choices (must include "options" array with exactly 4 options)
2. "short_answer" - Open-ended questions requiring written responses (specify length: "Write 3-5 sentences...")
3. "problem" - Math problems or exercises requiring work space
4. "observation" - Behavioral/performance tasks the student will demonstrate

MAPPING GOALS TO ASSESSMENT TYPES:
- Reading comprehension → Use "short_answer" with passage field
- Writing goals → Use "short_answer" (specify number of sentences: "Write 5 sentences about...")
- Math goals → Use "problem" or "multiple_choice"
- Behavioral/Social goals → Use "observation" (write what student should demonstrate)
- Knowledge recall → Use "multiple_choice" or "short_answer"

CORRECT EXAMPLES:

Reading comprehension (short_answer with passage):
{
  "type": "short_answer",
  "passage": "The cat sat on the mat. It was a sunny day. The cat purred happily as it watched birds fly by the window.",
  "prompt": "Write 3-4 sentences describing what the cat was doing and how it felt."
}

Writing goal (short_answer without passage):
{
  "type": "short_answer",
  "prompt": "Write 5 sentences about your favorite animal. Include what it looks like, where it lives, and why you like it."
}

Math goal (problem):
{
  "type": "problem",
  "prompt": "Solve the problem and show your work: 12 + 15 = ?"
}

Behavioral goal (observation):
{
  "type": "observation",
  "prompt": "Raise your hand and wait to be called on before speaking."
}

Multiple choice (must have exactly 4 options):
{
  "type": "multiple_choice",
  "prompt": "Which of these is a mammal?",
  "options": ["Snake", "Shark", "Dog", "Lizard"]
}

OUTPUT FORMAT (valid JSON):
{
  "studentInitials": "J.D.",
  "iepGoals": [
    {
      "goal": "[exact IEP goal text - for internal tracking only, NOT shown to student]",
      "assessmentItems": [
        {
          "type": "multiple_choice" | "short_answer" | "problem" | "observation",
          "passage": "ONLY include for reading comprehension questions",
          "prompt": "The actual instruction/question the student will read",
          "options": ["Option A", "Option B", "Option C", "Option D"]
        }
      ]
    }
  ]
}

VALIDATION CHECKLIST BEFORE RESPONDING:
✓ No teacher-facing notes or scoring criteria anywhere
✓ All prompts are student-readable instructions
✓ Multiple choice items have exactly 4 options
✓ Short answer items specify expected length (number of sentences)
✓ Observation items describe what student should do, not how teacher should score
✓ Reading comprehension items include the passage in the "passage" field

CRITICAL: The "type" field MUST be one of these EXACT strings: "multiple_choice", "short_answer", "problem", or "observation". Do not create any other type names.

You must respond with ONLY a valid JSON object. No other text.`;

// Validation function to detect teacher-facing content
function validateStudentFacingContent(worksheet: any): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Teacher-facing terms that should NOT appear in student prompts
  const teacherTerms = [
    /scoring\s+(note|criteria|rubric|guide)/i,
    /award\s+point/i,
    /teacher\s+(should|will|must)\s+(observe|assess|evaluate|score)/i,
    /assessment\s+criteria/i,
    /rubric/i,
    /learning\s+objective/i,
    /iep\s+goal/i,
    /mastery\s+level/i,
    /performance\s+indicator/i,
    /grading/i
  ];

  // Check all assessment item prompts
  worksheet.iepGoals?.forEach((goal: any, goalIndex: number) => {
    goal.assessmentItems?.forEach((item: any, itemIndex: number) => {
      const prompt = item.prompt || '';

      // Check for teacher-facing terms
      teacherTerms.forEach(pattern => {
        if (pattern.test(prompt)) {
          warnings.push(
            `Goal ${goalIndex + 1}, Item ${itemIndex + 1}: Prompt contains teacher-facing language: "${prompt.substring(0, 50)}..."`
          );
        }
      });

      // Check that prompt is in imperative/question form (student-facing)
      const isQuestionOrCommand = /^(write|solve|read|demonstrate|explain|describe|calculate|show|draw|identify|list|what|which|how|why|when|where|who)/i.test(prompt.trim());
      if (!isQuestionOrCommand && item.type !== 'observation') {
        warnings.push(
          `Goal ${goalIndex + 1}, Item ${itemIndex + 1}: Prompt may not be student-facing (doesn't start with action verb or question word)`
        );
      }

      // Validate passage doesn't contain teacher notes
      if (item.passage) {
        teacherTerms.forEach(pattern => {
          if (pattern.test(item.passage)) {
            warnings.push(
              `Goal ${goalIndex + 1}, Item ${itemIndex + 1}: Passage contains teacher-facing language`
            );
          }
        });
      }
    });
  });

  return {
    isValid: warnings.length === 0,
    warnings
  };
}

export async function POST(request: NextRequest) {
  return withAuth(async (req: NextRequest, userId: string) => {
    try {
      const supabase = await createClient();
      const body = await req.json();

      // Validate request
      const validation = validateRequest(body);
      if (!validation.isValid) {
        return NextResponse.json(
          { error: 'Invalid request', details: validation.errors },
          { status: 400 }
        );
      }

      const { studentIds } = body;

      // Enforce max 10 students limit
      if (studentIds.length > 10) {
        return NextResponse.json(
          { error: 'Too many students', details: 'Maximum 10 students allowed per batch' },
          { status: 400 }
        );
      }

      // Fetch student data with IEP goals
      const { data: studentsData, error: dbError } = await supabase
        .from('students')
        .select('id, initials, grade_level, student_details(iep_goals)')
        .eq('provider_id', userId)
        .in('id', studentIds);

      if (dbError) {
        console.error('Database error:', dbError);
        return NextResponse.json(
          { error: 'Database error', details: dbError.message },
          { status: 500 }
        );
      }

      if (!studentsData || studentsData.length === 0) {
        return NextResponse.json(
          { error: 'No students found', details: 'No students found with the provided IDs' },
          { status: 404 }
        );
      }

      // Initialize OpenAI client
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Process students in parallel with Promise.allSettled
      const worksheetPromises = studentsData.map(async (student) => {
        try {
          console.log(`[Progress Check] Processing student ${student.id} (${student.initials})`);

          // Extract IEP goals
          const studentDetails = Array.isArray(student.student_details)
            ? student.student_details[0]
            : student.student_details;

          const iepGoals = studentDetails?.iep_goals || [];

          console.log(`[Progress Check] Student ${student.initials} has ${iepGoals.length} IEP goals`);

          // Skip if no IEP goals
          if (iepGoals.length === 0) {
            console.log(`[Progress Check] Skipping student ${student.initials} - no IEP goals`);
            return {
              success: false,
              studentId: student.id,
              error: 'No IEP goals found'
            };
          }

          // Build user prompt
          const userPrompt = `Create a progress check assessment for:

Student: ${student.initials}
Grade: ${student.grade_level}

IEP Goals:
${iepGoals.map((goal: string, idx: number) => `${idx + 1}. ${goal}`).join('\n')}

For EACH goal, create exactly 3 assessment items. Mix types appropriately:
- Multiple choice for knowledge/comprehension
- Short answer for application/explanation
- Problems for skill demonstration
- Observation prompts for behaviors/social skills`;

          // Call OpenAI directly with timeout
          try {
            console.log(`[Progress Check] Calling OpenAI for student ${student.initials}...`);

            const completion = await Promise.race([
              openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: SYSTEM_PROMPT },
                  { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 4000,
                response_format: { type: 'json_object' }
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 30000)
              )
            ]);

            console.log(`[Progress Check] OpenAI response received for ${student.initials}`);

            const content = completion.choices[0]?.message?.content;
            if (!content) {
              throw new Error('Empty response from OpenAI');
            }

            // Parse JSON response
            const jsonResponse = JSON.parse(content);
            console.log(`[Progress Check] JSON parsed for ${student.initials}:`, {
              hasStudentInitials: !!jsonResponse.studentInitials,
              hasIepGoals: !!jsonResponse.iepGoals,
              iepGoalCount: jsonResponse.iepGoals?.length || 0
            });

            // Validate with Zod
            const parsedWorksheet = WorksheetSchema.parse(jsonResponse);
            console.log(`[Progress Check] Zod validation passed for ${student.initials}`);

            // Validate that content is student-facing (no teacher notes)
            const contentValidation = validateStudentFacingContent(parsedWorksheet);
            if (!contentValidation.isValid) {
              console.warn(`[Progress Check] Content validation warnings for ${student.initials}:`, contentValidation.warnings);
              // Log warnings but don't fail - let the worksheet through with warnings
              // This allows some flexibility while logging potential issues
            }

            return {
              success: true,
              studentId: student.id,
              studentInitials: student.initials,
              gradeLevel: student.grade_level,
              iepGoals: parsedWorksheet.iepGoals
            };
          } catch (error) {
            console.error(`[Progress Check] Error in OpenAI call for ${student.initials}:`, error);
            if (error instanceof Error && error.message === 'Timeout') {
              throw new Error('Generation timeout');
            }
            throw error;
          }
        } catch (error) {
          console.error(`Error generating worksheet for student ${student.id}:`, error);
          return {
            success: false,
            studentId: student.id,
            error: error instanceof Error ? error.message : 'Generation failed'
          };
        }
      });

      // Wait for all to complete
      const results = await Promise.allSettled(worksheetPromises);

      // Extract successful worksheets and errors
      const worksheets: any[] = [];
      const errors: any[] = [];

      console.log('[Progress Check] Processing results:', {
        totalResults: results.length,
        fulfilled: results.filter(r => r.status === 'fulfilled').length,
        rejected: results.filter(r => r.status === 'rejected').length
      });

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          console.log(`[Progress Check] Student ${index + 1} result:`, {
            success: result.value.success,
            studentId: result.value.studentId,
            error: result.value.error
          });

          if (result.value.success) {
            worksheets.push({
              studentId: result.value.studentId,
              studentInitials: result.value.studentInitials,
              iepGoals: result.value.iepGoals
            });
          } else {
            errors.push({
              studentId: result.value.studentId,
              error: result.value.error
            });
          }
        } else {
          console.error(`[Progress Check] Student ${index + 1} promise rejected:`, result.reason);
          errors.push({
            studentId: studentsData[index]?.id,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });

      console.log('[Progress Check] Final results:', {
        successCount: worksheets.length,
        errorCount: errors.length
      });

      return NextResponse.json({
        success: worksheets.length > 0,
        worksheets,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      console.error('Progress check generation error:', error);

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      if (errorMsg.includes('timeout')) {
        return NextResponse.json(
          { error: 'Request timeout', details: 'Generation took too long. Please try with fewer students.' },
          { status: 504 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to generate progress checks', details: errorMsg },
        { status: 500 }
      );
    }
  })(request);
}

function validateRequest(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!body.studentIds || !Array.isArray(body.studentIds) || body.studentIds.length === 0) {
    errors.push('studentIds array is required and must not be empty');
  }

  if (body.studentIds && body.studentIds.length > 10) {
    errors.push('Maximum 10 students allowed per batch');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
