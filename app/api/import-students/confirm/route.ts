/**
 * Student Import Confirmation API
 * Creates student records from bulk import after user review
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/api/with-auth';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';

export const runtime = 'nodejs';

interface StudentToImport {
  firstName: string;
  lastName: string;
  initials: string; // User-edited initials
  gradeLevel: string;
  goals: string[]; // Already PII-scrubbed
  schoolSite?: string;
  schoolId?: string;
  districtId?: string;
  stateId?: string;
}

interface ImportResult {
  success: boolean;
  studentId?: string;
  initials: string;
  error?: string;
}

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  const perf = measurePerformanceWithAlerts('import_students_confirm', 'api');

  try {
    const supabase = await createClient();
    const body = await request.json();
    const { students } = body as { students: StudentToImport[] };

    if (!students || !Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        { error: 'No students provided for import' },
        { status: 400 }
      );
    }

    log.info('Starting student import', {
      userId,
      studentCount: students.length
    });

    // Get user's profile to determine school context
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('school_id, district_id, state_id, school_site')
      .eq('id', userId)
      .single();

    const results: ImportResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Import each student
    for (const student of students) {
      try {
        // Validate initials
        if (!student.initials || student.initials.length < 2 || student.initials.length > 4) {
          results.push({
            success: false,
            initials: student.initials || `${student.firstName[0]}${student.lastName[0]}`,
            error: 'Invalid initials: must be 2-4 characters'
          });
          errorCount++;
          continue;
        }

        // Check for duplicate initials in the same grade
        const { data: existingStudent } = await supabase
          .from('students')
          .select('id, initials')
          .eq('provider_id', userId)
          .eq('initials', student.initials)
          .eq('grade_level', student.gradeLevel)
          .maybeSingle();

        if (existingStudent) {
          results.push({
            success: false,
            initials: student.initials,
            error: `Student with initials "${student.initials}" in grade ${student.gradeLevel} already exists`
          });
          errorCount++;
          continue;
        }

        // Determine school context
        // Priority: student-specific (from current school selection) > user profile > null
        // This ensures students are imported to the currently selected school
        const schoolSite = student.schoolSite || userProfile?.school_site || null;
        const schoolId = student.schoolId || userProfile?.school_id || null;
        const districtId = student.districtId || userProfile?.district_id || null;
        const stateId = student.stateId || userProfile?.state_id || null;

        log.info('Assigning student to school', {
          userId,
          studentInitials: student.initials,
          schoolId,
          schoolSite
        });

        // Create student record (without teacher/schedule info - they're now nullable)
        const { data: newStudent, error: studentError } = await supabase
          .from('students')
          .insert({
            provider_id: userId,
            initials: student.initials,
            grade_level: student.gradeLevel,
            school_site: schoolSite,
            school_id: schoolId,
            district_id: districtId,
            state_id: stateId,
            // teacher_name, sessions_per_week, minutes_per_session are now nullable
            // User will fill these in later
          })
          .select('id')
          .single();

        if (studentError || !newStudent) {
          log.error('Failed to create student record', studentError, {
            userId,
            studentInitials: student.initials
          });

          results.push({
            success: false,
            initials: student.initials,
            error: studentError?.message || 'Failed to create student record'
          });
          errorCount++;
          continue;
        }

        // Create student_details record with name and IEP goals
        const { error: detailsError } = await supabase
          .from('student_details')
          .insert({
            student_id: newStudent.id,
            first_name: student.firstName,
            last_name: student.lastName,
            iep_goals: student.goals
          });

        if (detailsError) {
          log.error('Failed to create student_details record', detailsError, {
            userId,
            studentId: newStudent.id,
            studentInitials: student.initials
          });

          // Rollback: delete the student record
          await supabase
            .from('students')
            .delete()
            .eq('id', newStudent.id);

          results.push({
            success: false,
            initials: student.initials,
            error: 'Failed to create student details'
          });
          errorCount++;
          continue;
        }

        // Success
        log.info('Student created successfully', {
          userId,
          studentId: newStudent.id,
          studentInitials: student.initials,
          goalsCount: student.goals.length
        });

        results.push({
          success: true,
          studentId: newStudent.id,
          initials: student.initials
        });
        successCount++;
      } catch (error: any) {
        log.error('Error importing student', error, {
          userId,
          studentInitials: student.initials
        });

        results.push({
          success: false,
          initials: student.initials,
          error: error.message || 'Unknown error occurred'
        });
        errorCount++;
      }
    }

    // Track import completion
    track.event('students_imported', {
      userId,
      totalAttempted: students.length,
      successCount,
      errorCount
    });

    log.info('Student import completed', {
      userId,
      totalAttempted: students.length,
      successCount,
      errorCount
    });

    perf.end({ success: errorCount === 0 });

    return NextResponse.json({
      success: true,
      data: {
        results,
        summary: {
          total: students.length,
          succeeded: successCount,
          failed: errorCount
        }
      }
    });
  } catch (error: any) {
    log.error('Student import confirmation error', error, { userId });

    track.event('student_import_confirmation_error', {
      userId,
      error: error.message
    });

    perf.end({ success: false });

    return NextResponse.json(
      { error: 'An unexpected error occurred during import. Please try again.' },
      { status: 500 }
    );
  }
});
