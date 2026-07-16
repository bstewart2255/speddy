/**
 * Student Import Confirmation API
 * Creates student records from bulk import after user review
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';
import { log } from '@/lib/monitoring/logger';
import { track } from '@/lib/monitoring/analytics';
import { measurePerformanceWithAlerts } from '@/lib/monitoring/performance-alerts';
import { updateExistingSessionsForStudent } from '@/lib/scheduling/session-requirement-sync';
import { buildStudentDedupKey } from '@/lib/utils/student-dedup-key';
import { mapUpsertResults, PendingUpsert, ImportResult } from '@/lib/import/upsert-result-mapper';
import type { StudentToImport } from '@/lib/types/student-import';

export const runtime = 'nodejs';

// Canonical UUID form; mirrors the check in app/api/sessions/ungroup/route.ts.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withRoute({}, async ({ req: request, userId }) => {
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

    // Build lookup map for O(1) duplicate detection: key = "INITIALS-GRADE".
    // The key normalizes both components so a stored legacy SEIS grade
    // (grade_level '18'/'0') still matches an incoming normalized 'TK'/'K'.
    const existingStudentMap = new Map<string, boolean>();
    for (const student of existingStudents || []) {
      const key = buildStudentDedupKey(student.initials, student.grade_level);
      existingStudentMap.set(key, true);
    }

    // Build Set for O(1) school access checks
    const accessibleSchoolSet = new Set<string>();
    if (!schoolsError && accessibleSchools) {
      for (const school of accessibleSchools) {
        accessibleSchoolSet.add(school.school_id);
      }
    }

    // Pre-sized so every student's outcome lands in its INPUT position, whether it
    // resolves during phase-1 validation or after the batched write — keeping the
    // response order byte-compatible with the old per-student loop.
    const results: ImportResult[] = new Array(students.length);
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Track newly added students to detect duplicates within the same import batch
    const addedInThisBatch = new Set<string>();
    // Track update targets so the same student isn't updated twice in one batch —
    // the batched session-sync baseline is captured once, up front (see phase 2).
    const updatedInThisBatch = new Set<string>();

    // SPE-229: instead of one write RPC per student (a pre-select + RPC + session
    // sync each — ~3 round trips per student), validate every student here and
    // collect the inserts/updates into a SINGLE batched upsert_students_atomic
    // call below. `batchPending[i]` mirrors `batchPayload[i]`, so the RPC's
    // input-ordered results map straight back to the right student.
    const batchPayload: Array<Record<string, unknown>> = [];
    const batchPending: Array<
      PendingUpsert & {
        index: number; // original position in `students`, for input-ordered results
        student: StudentToImport;
        newRequirements: { sessions_per_week: number | null; minutes_per_session: number | null };
      }
    > = [];

    // Phase 1: validate each student (O(1) per student) and queue the writes.
    for (let index = 0; index < students.length; index++) {
      const student = students[index];
      try {
        // Determine action (default to 'insert' for backward compatibility)
        const action = student.action || 'insert';

        // Normalize and validate initials
        const initialsNormalized = (student.initials || '').toUpperCase().replace(/[^A-Z]/g, '');
        const fallbackInitials = `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`.toUpperCase();

        // Handle skip action
        if (action === 'skip') {
          results[index] = {
            success: true,
            studentId: student.studentId,
            initials: initialsNormalized || fallbackInitials,
            action: 'skipped'
          };
          skippedCount++;
          continue;
        }

        if (initialsNormalized.length < 2 || initialsNormalized.length > 4) {
          results[index] = {
            success: false,
            initials: initialsNormalized || fallbackInitials,
            action: 'error',
            error: 'Invalid initials: must be 2-4 characters'
          };
          errorCount++;
          continue;
        }

        // For updates, validate studentId is provided
        if (action === 'update' && !student.studentId) {
          results[index] = {
            success: false,
            initials: initialsNormalized,
            action: 'error',
            error: 'Student ID required for update action'
          };
          errorCount++;
          continue;
        }

        // Reject a malformed studentId up front. upsert_students_atomic casts
        // studentId to uuid BEFORE its per-row exception block, so one bad id would
        // abort the whole batched write instead of failing just this row.
        if (action === 'update' && student.studentId && !UUID_REGEX.test(student.studentId)) {
          results[index] = {
            success: false,
            studentId: student.studentId,
            initials: initialsNormalized,
            action: 'error',
            error: 'Invalid student ID'
          };
          errorCount++;
          continue;
        }

        // Reject a second update for the same student in one batch. The old
        // per-student loop re-read each student's requirements before its update, so
        // sequential updates stayed self-consistent; the batched path captures one
        // baseline up front, so a duplicate would sync sessions against a stale
        // value. Mirrors the insert within-batch duplicate check below.
        if (action === 'update' && student.studentId && updatedInThisBatch.has(student.studentId)) {
          results[index] = {
            success: false,
            studentId: student.studentId,
            initials: initialsNormalized,
            action: 'error',
            error: `Duplicate in import: student "${initialsNormalized}" appears multiple times`
          };
          errorCount++;
          continue;
        }

        const duplicateKey = buildStudentDedupKey(initialsNormalized, student.gradeLevel);

        // For inserts, check for duplicates (against existing DB rows and earlier
        // rows in this same batch) - O(1) instead of a database query.
        if (action === 'insert') {
          if (existingStudentMap.has(duplicateKey)) {
            results[index] = {
              success: false,
              initials: initialsNormalized,
              action: 'error',
              error: `Student with initials "${initialsNormalized}" in grade ${student.gradeLevel} already exists`
            };
            errorCount++;
            continue;
          }

          if (addedInThisBatch.has(duplicateKey)) {
            results[index] = {
              success: false,
              initials: initialsNormalized,
              action: 'error',
              error: `Duplicate in import: "${initialsNormalized}" in grade ${student.gradeLevel} appears multiple times`
            };
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
            results[index] = {
              success: false,
              initials: initialsNormalized,
              action: 'error',
              error: 'Failed to validate school access'
            };
            errorCount++;
            continue;
          }

          if (!accessibleSchoolSet.has(requestedSchoolId)) {
            log.error('User does not have access to requested school', null, {
              userId,
              requestedSchoolId,
              studentInitials: initialsNormalized
            });
            results[index] = {
              success: false,
              initials: initialsNormalized,
              action: 'error',
              error: `User does not have access to school ${requestedSchoolId}`
            };
            errorCount++;
            continue;
          }
        }

        const schoolSite = student.schoolSite || userProfile?.school_site || null;
        const schoolId = requestedSchoolId;
        const districtId = student.districtId || userProfile?.district_id || null;
        const stateId = student.stateId || userProfile?.state_id || null;

        log.info(`${action === 'update' ? 'Queuing update for' : 'Queuing insert for'} student`, {
          userId,
          studentInitials: initialsNormalized,
          action,
          schoolId,
          schoolSite
        });

        // Queue the write. The single upsert_students_atomic call below handles
        // insert vs update per element (each in its own subtransaction) and
        // creates the unscheduled sessions for inserts. Updates still need their
        // sessions synced afterward (the RPC deliberately leaves that to the API),
        // so we capture the new requirements now.
        if (action === 'update') {
          updatedInThisBatch.add(student.studentId as string);
          const updatePayload: Record<string, unknown> = {
            action: 'update',
            studentId: student.studentId,
            initials: initialsNormalized,
            gradeLevel: student.gradeLevel,
            goals: student.goals,
            sessionsPerWeek: student.sessionsPerWeek ?? null,
            minutesPerSession: student.minutesPerSession ?? null
          };
          // Roster-template rows carry no names. The RPC COALESCEs first/last
          // name, so sending '' would overwrite an existing student's real name
          // (e.g. set by an earlier SEIS import) with blank. Omit blank names so
          // the existing ones are preserved; SEIS rows still carry real names.
          if (student.firstName) updatePayload.firstName = student.firstName;
          if (student.lastName) updatePayload.lastName = student.lastName;
          // Only touch the teacher link when the import actually resolved a
          // teacher_id. upsert_students_atomic keys off the *presence* of the
          // teacherId/teacherName fields (`v_student ? 'teacherId'`), setting the
          // column even to null — so always sending them made a teacher-less
          // update (a SEIS goals-only re-import, or a roster row whose teacher
          // name didn't match) wipe the student's existing teacher. Omitting the
          // keys leaves the existing teacher untouched.
          if (student.teacherId) {
            updatePayload.teacherId = student.teacherId;
            updatePayload.teacherName = student.teacherName ?? null;
          }
          batchPayload.push(updatePayload);
        } else {
          // Insert. Set `teacher_name` alongside `teacher_id` when a teacher
          // resolved. The Students list (and teacher-name-based checks) still
          // read the deprecated `teacher_name` column for display, so a matched
          // teacher that set only `teacher_id` would otherwise render as "Not
          // assigned" (SPE-251). Left null when no teacher matched — the student
          // is then genuinely unassigned. Mirrors the update branch above.
          batchPayload.push({
            action: 'insert',
            initials: initialsNormalized,
            gradeLevel: student.gradeLevel,
            schoolSite,
            schoolId,
            districtId,
            stateId,
            sessionsPerWeek: student.sessionsPerWeek ?? null,
            minutesPerSession: student.minutesPerSession ?? null,
            teacherId: student.teacherId || null,
            teacherName: student.teacherId ? (student.teacherName ?? null) : null,
            firstName: student.firstName,
            lastName: student.lastName,
            goals: student.goals
          });
          addedInThisBatch.add(duplicateKey);
        }

        batchPending.push({
          index,
          student,
          initials: initialsNormalized,
          gradeLevel: student.gradeLevel,
          action,
          studentId: student.studentId,
          newRequirements: {
            sessions_per_week: student.sessionsPerWeek ?? null,
            minutes_per_session: student.minutesPerSession ?? null
          }
        });
      } catch (error: any) {
        const errorInitials = (student.initials || '').toUpperCase().replace(/[^A-Z]/g, '') ||
                             `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`.toUpperCase();

        log.error('Error importing student', error, {
          userId,
          studentInitials: errorInitials
        });

        results[index] = {
          success: false,
          initials: errorInitials,
          action: 'error',
          error: error.message || 'Unknown error occurred'
        };
        errorCount++;
      }
    }

    // Phase 2: fetch current requirements for all queued UPDATES in one query
    // (needed to sync sessions after the batched write).
    const oldRequirementsById = new Map<string, { sessions_per_week: number | null; minutes_per_session: number | null }>();
    const updateIds = batchPending
      .filter((p) => p.action === 'update' && p.studentId)
      .map((p) => p.studentId as string);
    if (updateIds.length > 0) {
      const { data: currentStudents } = await supabase
        .from('students')
        .select('id, sessions_per_week, minutes_per_session')
        .in('id', updateIds);
      for (const s of currentStudents || []) {
        oldRequirementsById.set(s.id, {
          sessions_per_week: s.sessions_per_week ?? null,
          minutes_per_session: s.minutes_per_session ?? null
        });
      }
    }

    // Phase 3 + 4: one batched write, then map the per-element results back to
    // per-student outcomes and sync sessions for the updated students.
    if (batchPending.length > 0) {
      const { data: upsertData, error: upsertError } = await supabase.rpc('upsert_students_atomic', {
        p_provider_id: userId,
        p_students: batchPayload
      });

      if (upsertError) {
        // A hard RPC failure rolls back the whole batch — surface an error for
        // every queued student (the previous path failed one student at a time).
        log.error('Failed to call upsert_students_atomic (batch)', upsertError, {
          userId,
          batchSize: batchPending.length
        });
        for (const p of batchPending) {
          results[p.index] = {
            success: false,
            studentId: p.action === 'update' ? p.studentId : undefined,
            initials: p.initials,
            action: 'error',
            error: p.action === 'update' ? 'Failed to update student' : 'Failed to import student'
          };
          errorCount++;
        }
      } else {
        const rpcResults =
          (upsertData as { results?: Array<{ action?: string; studentId?: string; initials?: string; success?: boolean; error?: string }> })
            ?.results || [];
        const mapped = mapUpsertResults(batchPending, rpcResults);

        for (let i = 0; i < mapped.length; i++) {
          const { result, outcome } = mapped[i];
          const p = batchPending[i];
          results[p.index] = result;

          if (outcome === 'error') {
            errorCount++;
            continue;
          }

          if (outcome === 'updated') {
            updatedCount++;

            // The RPC updates the student row only; sync sessions here to match
            // manual UI updates. Only sync when schedule requirements were sent.
            const requirementsChanged =
              p.student.sessionsPerWeek !== undefined ||
              p.student.minutesPerSession !== undefined;
            if (requirementsChanged) {
              try {
                // IMPORTANT: Pass the server Supabase client to avoid RLS issues.
                const syncResult = await updateExistingSessionsForStudent(
                  p.studentId!,
                  oldRequirementsById.get(p.studentId!) ?? { sessions_per_week: null, minutes_per_session: null },
                  p.newRequirements,
                  supabase
                );

                if (!syncResult.success) {
                  log.warn('Session sync had issues after student update', {
                    userId,
                    studentId: p.studentId,
                    studentInitials: p.initials,
                    syncError: syncResult.error
                  });
                }
              } catch (syncError) {
                log.error('Failed to sync sessions after update', syncError instanceof Error ? syncError : null, {
                  userId,
                  studentId: p.studentId,
                  studentInitials: p.initials
                });
                // Don't fail the update - just log the sync error
              }
            }
          } else {
            // inserted: upsert_students_atomic already created the unscheduled
            // sessions for the new student, so there is nothing to sync here.
            insertedCount++;
          }
        }
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
