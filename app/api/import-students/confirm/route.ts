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
        // Normalize and validate initials
        const initialsNormalized = (student.initials || '').toUpperCase().replace(/[^A-Z]/g, '');
        const fallbackInitials = `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`.toUpperCase();

        if (initialsNormalized.length < 2 || initialsNormalized.length > 4) {
          results.push({
            success: false,
            initials: initialsNormalized || fallbackInitials,
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
          .eq('initials', initialsNormalized)
          .eq('grade_level', student.gradeLevel)
          .maybeSingle();

        if (existingStudent) {
          results.push({
            success: false,
            initials: initialsNormalized,
            error: `Student with initials "${initialsNormalized}" in grade ${student.gradeLevel} already exists`
          });
          errorCount++;
          continue;
        }

        // Determine school context
        // Priority: student-specific (from current school selection) > user profile > null
        // IMPORTANT: Must validate user has access to the school for security
        const requestedSchoolId = student.schoolId || userProfile?.school_id || null;

        // Validate user has access to the requested school
        if (requestedSchoolId) {
          const { data: accessibleSchools, error: schoolsError } = await supabase
            .rpc('user_accessible_school_ids');

          if (schoolsError) {
            log.error('Failed to fetch accessible schools', schoolsError, {
              userId,
              studentInitials: initialsNormalized
            });
            results.push({
              success: false,
              initials: initialsNormalized,
              error: 'Failed to validate school access'
            });
            errorCount++;
            continue;
          }

          const hasAccess = accessibleSchools?.some(s => s.school_id === requestedSchoolId);
          if (!hasAccess) {
            log.error('User does not have access to requested school', null, {
              userId,
              requestedSchoolId,
              studentInitials: initialsNormalized
            });
            results.push({
              success: false,
              initials: initialsNormalized,
              error: `User does not have access to school ${requestedSchoolId}`
            });
            errorCount++;
            continue;
          }
        }

        const schoolSite = student.schoolSite || userProfile?.school_site || null;
        const schoolId = requestedSchoolId;
        const districtId = student.districtId || userProfile?.district_id || null;
        const stateId = student.stateId || userProfile?.state_id || null;

        log.info('Assigning student to school', {
          userId,
          studentInitials: initialsNormalized,
          schoolId,
          schoolSite
        });

        // Create student and student_details atomically using RPC function
        // This prevents orphaned student records if student_details insert fails
        const { data: importResult, error: importError } = await supabase
          .rpc('import_student_atomic', {
            p_provider_id: userId,
            p_initials: initialsNormalized,
            p_grade_level: student.gradeLevel,
            p_school_site: schoolSite,
            p_school_id: schoolId,
            p_district_id: districtId,
            p_state_id: stateId,
            p_first_name: student.firstName,
            p_last_name: student.lastName,
            p_iep_goals: student.goals
          })
          .single();

        // Check for RPC call errors
        if (importError) {
          log.error('Failed to call import_student_atomic', importError, {
            userId,
            studentInitials: initialsNormalized
          });

          results.push({
            success: false,
            initials: initialsNormalized,
            error: 'Failed to import student'
          });
          errorCount++;
          continue;
        }

        // Check the result from the RPC function
        if (!importResult || !importResult.success) {
          const errorMessage = importResult?.error_message || 'Unknown error';

          // Check if this is a unique constraint violation
          const isDuplicate = errorMessage.includes('duplicate key') ||
                             errorMessage.includes('unique constraint') ||
                             errorMessage.includes('ux_students_provider_grade_initials');

          if (isDuplicate) {
            log.warn('Duplicate student detected during atomic insert', {
              userId,
              studentInitials: initialsNormalized,
              gradeLevel: student.gradeLevel
            });

            results.push({
              success: false,
              initials: initialsNormalized,
              error: `Student with initials "${initialsNormalized}" in grade ${student.gradeLevel} already exists`
            });
          } else {
            log.error('Failed to create student atomically', null, {
              userId,
              studentInitials: initialsNormalized,
              errorMessage
            });

            results.push({
              success: false,
              initials: initialsNormalized,
              error: errorMessage
            });
          }

          errorCount++;
          continue;
        }

        const newStudent = { id: importResult.student_id };

        // Success
        log.info('Student created successfully', {
          userId,
          studentId: newStudent.id,
          studentInitials: initialsNormalized,
          goalsCount: student.goals.length
        });

        results.push({
          success: true,
          studentId: newStudent.id,
          initials: initialsNormalized
        });
        successCount++;
      } catch (error: any) {
        const errorInitials = (student.initials || '').toUpperCase().replace(/[^A-Z]/g, '') ||
                             `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`.toUpperCase();

        log.error('Error importing student', error, {
          userId,
          studentInitials: errorInitials
        });

        results.push({
          success: false,
          initials: errorInitials,
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
