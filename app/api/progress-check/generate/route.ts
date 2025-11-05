import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { createClient } from '@/lib/supabase/server';
import { generateProgressCheck, type AssessmentItem, type IEPGoalAssessment } from '@/lib/progress-checks/generator';

// Extended timeout for AI generation
export const maxDuration = 300; // 5 minutes

interface Worksheet {
  studentId: string;
  studentInitials: string;
  gradeLevel?: number;
  iepGoals: IEPGoalAssessment[];
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

      // Get user's role to determine filtering
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profileError || !profile) {
        console.error('Profile fetch error:', profileError);
        return NextResponse.json(
          { error: 'Failed to fetch user profile', details: profileError?.message },
          { status: 500 }
        );
      }

      // Fetch student data with IEP goals
      // For SEAs, rely on RLS to filter students via assigned sessions
      // For providers, filter by provider_id
      let studentsQuery = supabase
        .from('students')
        .select('id, initials, grade_level, student_details(iep_goals)')
        .in('id', studentIds);

      // Only filter by provider_id for non-SEA users
      if (profile?.role !== 'sea') {
        studentsQuery = studentsQuery.eq('provider_id', userId);
      }

      const { data: studentsData, error: dbError } = await studentsQuery;

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

          // Call Claude generator with timeout
          try {
            console.log(`[Progress Check] Calling Claude for student ${student.initials}...`);

            const worksheet = await Promise.race([
              generateProgressCheck({
                studentInitials: student.initials,
                gradeLevel: student.grade_level,
                iepGoals: iepGoals
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 30000)
              )
            ]);

            console.log(`[Progress Check] Claude response received for ${student.initials}`);

            return {
              success: true,
              studentId: student.id,
              studentInitials: student.initials,
              gradeLevel: student.grade_level,
              iepGoals: worksheet.iepGoals
            };
          } catch (error) {
            console.error(`[Progress Check] Error in Claude call for ${student.initials}:`, error);
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
              gradeLevel: result.value.gradeLevel,
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
