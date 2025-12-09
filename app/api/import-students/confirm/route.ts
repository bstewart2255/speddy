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
import { updateExistingSessionsForStudent } from '@/lib/scheduling/session-requirement-sync';

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
  // New fields from multi-file upload
  sessionsPerWeek?: number;
  minutesPerSession?: number;
  teacherId?: string;
  teacherName?: string; // For updating the deprecated teacher_name column
  // UPSERT fields
  action?: 'insert' | 'update' | 'skip'; // Defaults to 'insert' for backward compatibility
  studentId?: string; // Required for 'update' action
}

interface ImportResult {
  success: boolean;
  studentId?: string;
  initials: string;
  action: 'inserted' | 'updated' | 'skipped' | 'error';
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

    // OPTIMIZATION: Batch fetch all required data upfront (3 queries instead of 3N)
    const [
      { data: userProfile },
      { data: existingStudents },
      { data: accessibleSchools, error: schoolsError }
    ] = await Promise.all([
      // 1. Get user's profile
      supabase
        .from('profiles')
        .select('school_id, district_id, state_id, school_site')
        .eq('id', userId)
        .single(),
      // 2. Batch fetch ALL existing students for this provider (for duplicate checking)
      supabase
        .from('students')
        .select('id, initials, grade_level')
        .eq('provider_id', userId),
      // 3. Fetch accessible schools once
      supabase.rpc('user_accessible_school_ids')
    ]);

    // Build lookup map for O(1) duplicate detection: key = "INITIALS-GRADE"
    const existingStudentMap = new Map<string, boolean>();
    for (const student of existingStudents || []) {
      const key = `${student.initials}-${student.grade_level}`;
      existingStudentMap.set(key, true);
    }

    // Build Set for O(1) school access checks
    const accessibleSchoolSet = new Set<string>();
    if (!schoolsError && accessibleSchools) {
      for (const school of accessibleSchools) {
        accessibleSchoolSet.add(school.school_id);
      }
    }

    const results: ImportResult[] = [];
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Track newly added students to detect duplicates within the same import batch
    const addedInThisBatch = new Set<string>();

    // Import each student (validation is now O(1) per student)
    for (const student of students) {
      try {
        // Determine action (default to 'insert' for backward compatibility)
        const action = student.action || 'insert';

        // Normalize and validate initials
        const initialsNormalized = (student.initials || '').toUpperCase().replace(/[^A-Z]/g, '');
        const fallbackInitials = `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`.toUpperCase();

        // Handle skip action
        if (action === 'skip') {
          results.push({
            success: true,
            studentId: student.studentId,
            initials: initialsNormalized || fallbackInitials,
            action: 'skipped'
          });
          skippedCount++;
          continue;
        }

        if (initialsNormalized.length < 2 || initialsNormalized.length > 4) {
          results.push({
            success: false,
            initials: initialsNormalized || fallbackInitials,
            action: 'error',
            error: 'Invalid initials: must be 2-4 characters'
          });
          errorCount++;
          continue;
        }

        // For updates, validate studentId is provided
        if (action === 'update' && !student.studentId) {
          results.push({
            success: false,
            initials: initialsNormalized,
            action: 'error',
            error: 'Student ID required for update action'
          });
          errorCount++;
          continue;
        }

        // For inserts, check for duplicates
        if (action === 'insert') {
          // Check for duplicate using Map - O(1) instead of database query
          const duplicateKey = `${initialsNormalized}-${student.gradeLevel}`;
          if (existingStudentMap.has(duplicateKey)) {
            results.push({
              success: false,
              initials: initialsNormalized,
              action: 'error',
              error: `Student with initials "${initialsNormalized}" in grade ${student.gradeLevel} already exists`
            });
            errorCount++;
            continue;
          }

          // Check for duplicate within the same import batch
          if (addedInThisBatch.has(duplicateKey)) {
            results.push({
              success: false,
              initials: initialsNormalized,
              action: 'error',
              error: `Duplicate in import: "${initialsNormalized}" in grade ${student.gradeLevel} appears multiple times`
            });
            errorCount++;
            continue;
          }
        }

        // Determine school context
        // Priority: student-specific (from current school selection) > user profile > null
        // IMPORTANT: Must validate user has access to the school for security
        const requestedSchoolId = student.schoolId || userProfile?.school_id || null;

        // Validate user has access to the requested school using Set - O(1)
        if (requestedSchoolId) {
          if (schoolsError) {
            log.error('Failed to fetch accessible schools', schoolsError, {
              userId,
              studentInitials: initialsNormalized
            });
            results.push({
              success: false,
              initials: initialsNormalized,
              action: 'error',
              error: 'Failed to validate school access'
            });
            errorCount++;
            continue;
          }

          if (!accessibleSchoolSet.has(requestedSchoolId)) {
            log.error('User does not have access to requested school', null, {
              userId,
              requestedSchoolId,
              studentInitials: initialsNormalized
            });
            results.push({
              success: false,
              initials: initialsNormalized,
              action: 'error',
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

        log.info(`${action === 'update' ? 'Updating' : 'Creating'} student`, {
          userId,
          studentInitials: initialsNormalized,
          action,
          schoolId,
          schoolSite
        });

        if (action === 'update') {
          // UPDATE: Update existing student using upsert_students_atomic RPC

          // Fetch current student requirements BEFORE the update (needed for session sync)
          const { data: currentStudent } = await supabase
            .from('students')
            .select('sessions_per_week, minutes_per_session')
            .eq('id', student.studentId)
            .single();

          const oldRequirements = {
            sessions_per_week: currentStudent?.sessions_per_week ?? null,
            minutes_per_session: currentStudent?.minutes_per_session ?? null
          };

          const { data: updateResult, error: updateError } = await supabase
            .rpc('upsert_students_atomic', {
              p_provider_id: userId,
              p_students: [{
                action: 'update',
                studentId: student.studentId,
                initials: initialsNormalized,
                gradeLevel: student.gradeLevel,
                firstName: student.firstName,
                lastName: student.lastName,
                goals: student.goals,
                sessionsPerWeek: student.sessionsPerWeek || null,
                minutesPerSession: student.minutesPerSession || null,
                teacherId: student.teacherId || null,
                teacherName: student.teacherName || null
              }]
            });

          if (updateError) {
            log.error('Failed to call upsert_students_atomic for update', updateError, {
              userId,
              studentId: student.studentId,
              studentInitials: initialsNormalized
            });

            results.push({
              success: false,
              studentId: student.studentId,
              initials: initialsNormalized,
              action: 'error',
              error: 'Failed to update student'
            });
            errorCount++;
            continue;
          }

          // Check result
          const upsertResult = updateResult as { updated?: number; errors?: number; results?: Array<{ success: boolean; error?: string }> };
          if (upsertResult.errors && upsertResult.errors > 0) {
            const errorMsg = upsertResult.results?.[0]?.error || 'Unknown error';
            log.error('Failed to update student', null, {
              userId,
              studentId: student.studentId,
              studentInitials: initialsNormalized,
              error: errorMsg
            });

            results.push({
              success: false,
              studentId: student.studentId,
              initials: initialsNormalized,
              action: 'error',
              error: errorMsg
            });
            errorCount++;
            continue;
          }

          // Success - now sync sessions if schedule requirements were provided
          const newRequirements = {
            sessions_per_week: student.sessionsPerWeek ?? null,
            minutes_per_session: student.minutesPerSession ?? null
          };

          // Check if schedule requirements changed and sync sessions accordingly
          const requirementsChanged =
            student.sessionsPerWeek !== undefined ||
            student.minutesPerSession !== undefined;

          if (requirementsChanged) {
            try {
              const syncResult = await updateExistingSessionsForStudent(
                student.studentId!,
                oldRequirements,
                newRequirements
              );

              if (!syncResult.success) {
                log.warn('Session sync had issues after student update', {
                  userId,
                  studentId: student.studentId,
                  studentInitials: initialsNormalized,
                  syncError: syncResult.error
                });
              } else {
                log.info('Sessions synced successfully', {
                  userId,
                  studentId: student.studentId,
                  studentInitials: initialsNormalized,
                  conflictCount: syncResult.conflictCount || 0
                });
              }
            } catch (syncError) {
              log.error('Failed to sync sessions after update', syncError instanceof Error ? syncError : null, {
                userId,
                studentId: student.studentId,
                studentInitials: initialsNormalized
              });
              // Don't fail the update - just log the sync error
            }
          }

          log.info('Student updated successfully', {
            userId,
            studentId: student.studentId,
            studentInitials: initialsNormalized,
            goalsCount: student.goals?.length ?? 0
          });

          results.push({
            success: true,
            studentId: student.studentId,
            initials: initialsNormalized,
            action: 'updated'
          });
          updatedCount++;
        } else {
          // INSERT: Create student and student_details atomically using RPC function
          // This prevents orphaned student records if student_details insert fails
          const duplicateKey = `${initialsNormalized}-${student.gradeLevel}`;

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
              p_iep_goals: student.goals,
              p_sessions_per_week: student.sessionsPerWeek || null,
              p_minutes_per_session: student.minutesPerSession || null,
              p_teacher_id: student.teacherId || null
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
              action: 'error',
              error: 'Failed to import student'
            });
            errorCount++;
            continue;
          }

          // Check the result from the RPC function
          if (!importResult || !(importResult as { success?: boolean }).success) {
            const errorMessage = (importResult as { error_message?: string })?.error_message || 'Unknown error';

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
                action: 'error',
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
                action: 'error',
                error: errorMessage
              });
            }

            errorCount++;
            continue;
          }

          const newStudent = { id: (importResult as { student_id?: string }).student_id };

          // Success
          log.info('Student created successfully', {
            userId,
            studentId: newStudent.id,
            studentInitials: initialsNormalized,
            goalsCount: student.goals?.length ?? 0
          });

          results.push({
            success: true,
            studentId: newStudent.id,
            initials: initialsNormalized,
            action: 'inserted'
          });
          insertedCount++;

          // Track successful import for batch duplicate detection
          addedInThisBatch.add(duplicateKey);
        }
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
          action: 'error',
          error: error.message || 'Unknown error occurred'
        });
        errorCount++;
      }
    }

    // Track import completion with UPSERT counts
    track.event('students_imported', {
      userId,
      totalAttempted: students.length,
      insertedCount,
      updatedCount,
      skippedCount,
      errorCount
    });

    log.info('Student UPSERT completed', {
      userId,
      totalAttempted: students.length,
      inserted: insertedCount,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorCount
    });

    perf.end({ success: errorCount === 0 });

    return NextResponse.json({
      success: true,
      data: {
        results,
        summary: {
          total: students.length,
          // Legacy field for backward compatibility
          succeeded: insertedCount + updatedCount,
          failed: errorCount,
          // UPSERT counts
          inserted: insertedCount,
          updated: updatedCount,
          skipped: skippedCount
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
