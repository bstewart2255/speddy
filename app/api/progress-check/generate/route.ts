import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { z } from 'zod';

// Extended timeout for AI generation
export const maxDuration = 300; // 5 minutes

// Zod schema for progress check response validation
const AssessmentItemSchema = z.object({
  type: z.enum(['multiple_choice', 'short_answer', 'problem', 'observation']),
  prompt: z.string(),
  passage: z.string().optional(), // For reading comprehension questions
  options: z.array(z.string()).optional(),
  scoringNotes: z.string().optional(),
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

CRITICAL: This worksheet is for the STUDENT to complete. Do NOT include teacher notes, scoring criteria, or references to IEP goals on the worksheet. Students should NOT see their IEP goals - only the assessment questions.

REQUIREMENTS:
1. Test EVERY IEP goal provided
2. Generate EXACTLY 3 assessment items per goal
3. Vary formats based on goal type
4. Keep language grade-appropriate and student-friendly
5. For reading comprehension goals, ALWAYS include a passage followed by questions

ALLOWED ASSESSMENT TYPES - YOU MUST USE ONLY THESE 4 TYPES:
1. "multiple_choice" - Questions with 4 answer choices (A, B, C, D)
2. "short_answer" - Open-ended questions requiring written responses
3. "problem" - Math problems or exercises requiring work space
4. "observation" - Behavioral tasks for teacher observation (include scoringNotes)

MAPPING GOALS TO ASSESSMENT TYPES:
- Reading comprehension → Use "short_answer" with passage field
- Writing goals → Use "short_answer" (provides lines for student writing)
- Math goals → Use "problem" (provides work space) or "multiple_choice"
- Behavioral/Social goals → Use "observation" (include scoringNotes)
- Knowledge recall → Use "multiple_choice" or "short_answer"

EXAMPLES:

Reading comprehension (short_answer with passage):
{
  "type": "short_answer",
  "passage": "The cat sat on the mat. It was a sunny day. The cat purred happily as it watched birds fly by the window.",
  "prompt": "What was the cat doing on the mat?"
}

Writing goal (short_answer without passage):
{
  "type": "short_answer",
  "prompt": "Write 3 sentences about your favorite animal."
}

Math goal (problem):
{
  "type": "problem",
  "prompt": "Solve: 12 + 15 = ?"
}

Behavioral goal (observation):
{
  "type": "observation",
  "prompt": "Demonstrate raising your hand before speaking",
  "scoringNotes": "Award point if student raises hand and waits to be called on"
}

OUTPUT FORMAT (valid JSON):
{
  "studentInitials": "J.D.",
  "iepGoals": [
    {
      "goal": "[exact IEP goal text - this is for internal use only, NOT shown to student]",
      "assessmentItems": [
        {
          "type": "multiple_choice" | "short_answer" | "problem" | "observation",
          "passage": "Include ONLY if this is a reading comprehension question",
          "prompt": "The actual question the student will see",
          "options": ["A", "B", "C", "D"],
          "scoringNotes": "For teacher use only, not shown to student"
        }
      ]
    }
  ]
}

CRITICAL: The "type" field MUST be one of these EXACT strings: "multiple_choice", "short_answer", "problem", or "observation". Do not create any other type names.

You must respond with ONLY a valid JSON object. No other text.`;

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
            console.log(`[Progress Check] Validation passed for ${student.initials}`);

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
