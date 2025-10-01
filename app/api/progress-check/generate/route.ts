import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { createClient } from '@/lib/supabase/server';
import { createAIProvider } from '@/lib/lessons/providers';
import { z } from 'zod';

// Extended timeout for AI generation
export const maxDuration = 300; // 5 minutes

// Zod schema for progress check response validation
const AssessmentItemSchema = z.object({
  type: z.enum(['multiple_choice', 'short_answer', 'problem', 'observation']),
  prompt: z.string(),
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

REQUIREMENTS:
1. Test EVERY IEP goal provided
2. Generate EXACTLY 3 assessment items per goal
3. Vary formats based on goal type
4. Keep language grade-appropriate

ASSESSMENT FORMATS:
- Academic goals (Math/ELA): Problems, questions, tasks
- Behavioral goals: Observable criteria with rating scale
- Social goals: Scenario-based prompts
- Speech/OT goals: Practical task descriptions

OBSERVATION PROMPT EXAMPLE:
{
  "type": "observation",
  "prompt": "During a 15-minute group activity, observe and tally each time student raises hand before speaking",
  "scoringNotes": "Goal met if demonstrated 3+ times"
}

OUTPUT FORMAT (valid JSON):
{
  "studentInitials": "J.D.",
  "iepGoals": [
    {
      "goal": "[exact IEP goal text]",
      "assessmentItems": [
        {
          "type": "multiple_choice" | "short_answer" | "problem" | "observation",
          "prompt": "Assessment question/task",
          "options": ["A", "B", "C", "D"],
          "scoringNotes": "What to look for"
        }
      ]
    }
  ]
}

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

      // Initialize AI provider
      const provider = createAIProvider();

      // Process students in parallel with Promise.allSettled
      const worksheetPromises = studentsData.map(async (student) => {
        try {
          // Extract IEP goals
          const studentDetails = Array.isArray(student.student_details)
            ? student.student_details[0]
            : student.student_details;

          const iepGoals = studentDetails?.iep_goals || [];

          // Skip if no IEP goals
          if (iepGoals.length === 0) {
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

          // Create a minimal request object for the provider
          const mockRequest = {
            students: [{ id: student.id, grade: parseInt(student.grade_level) || 3 }],
            teacherRole: 'resource' as const,
            subject: 'Progress Check',
            subjectType: 'ela' as const,
            topic: 'IEP Goal Assessment',
            duration: 30
          };

          // Call AI provider with timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s per student

          try {
            const response = await Promise.race([
              provider.generateLesson(mockRequest, SYSTEM_PROMPT, userPrompt),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 30000)
              )
            ]) as any;

            clearTimeout(timeoutId);

            // Log the actual response structure for debugging
            console.log('[Progress Check] AI Response structure:', {
              hasLesson: !!response.lesson,
              hasWorksheet: !!response.worksheet,
              hasStudentMaterials: !!response.studentMaterials,
              lessonKeys: response.lesson ? Object.keys(response.lesson) : [],
              topLevelKeys: Object.keys(response)
            });

            // Parse and validate response
            let parsedWorksheet;
            try {
              // The response is a LessonResponse, try multiple extraction paths
              let content = response;

              // Try to extract from lesson.content or similar nested paths
              if (response.lesson) {
                content = response.lesson;
              }

              // If it's wrapped in studentMaterials, try to extract
              if (response.studentMaterials && response.studentMaterials.length > 0) {
                content = response.studentMaterials[0].worksheet || response.studentMaterials[0];
              }

              // Log what we're trying to parse
              console.log('[Progress Check] Attempting to parse content:', {
                contentType: typeof content,
                hasStudentInitials: !!content.studentInitials,
                hasIepGoals: !!content.iepGoals,
                contentKeys: typeof content === 'object' ? Object.keys(content) : []
              });

              parsedWorksheet = WorksheetSchema.parse(content);
            } catch (parseError) {
              console.error('[Progress Check] Failed to parse AI response:', parseError);
              console.error('[Progress Check] Raw response:', JSON.stringify(response, null, 2).slice(0, 500));
              throw new Error('Invalid AI response format');
            }

            return {
              success: true,
              studentId: student.id,
              studentInitials: student.initials,
              iepGoals: parsedWorksheet.iepGoals
            };
          } finally {
            clearTimeout(timeoutId);
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

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
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
          errors.push({
            studentId: studentsData[index]?.id,
            error: result.reason?.message || 'Unknown error'
          });
        }
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
