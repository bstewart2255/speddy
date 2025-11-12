/**
 * Session Requirement Synchronization
 *
 * Automatically updates existing scheduled sessions when student requirements change
 * (e.g., minutes_per_session or sessions_per_week).
 */

import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type SessionUpdate = Database['public']['Tables']['schedule_sessions']['Update'];

interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflictingSessions: Array<{
    sessionId: string;
    reason: string;
  }>;
}

/**
 * Main function to synchronize existing sessions with updated student requirements
 */
export async function updateExistingSessionsForStudent(
  studentId: string,
  oldRequirements: {
    minutes_per_session?: number | null;
    sessions_per_week?: number | null;
  },
  newRequirements: {
    minutes_per_session?: number | null;
    sessions_per_week?: number | null;
  }
): Promise<{ success: boolean; error?: string; conflictCount?: number }> {
  const supabase = createClient<Database>();

  try {
    const durationChanged =
      oldRequirements.minutes_per_session !== newRequirements.minutes_per_session;
    const countChanged =
      oldRequirements.sessions_per_week !== newRequirements.sessions_per_week;

    // Get all existing sessions for this student
    const { data: existingSessions, error: fetchError } = await supabase
      .from('schedule_sessions')
      .select('*')
      .eq('student_id', studentId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (fetchError) {
      console.error('Error fetching existing sessions:', fetchError);
      return { success: false, error: fetchError.message };
    }

    if (!existingSessions || existingSessions.length === 0) {
      // No existing sessions - might need to create initial unscheduled sessions
      // This handles the case where a student was created without scheduling requirements
      // and is now being updated to add them
      if (newRequirements.sessions_per_week && newRequirements.sessions_per_week > 0) {
        // Need to get the provider_id and student info to create sessions
        const { data: student, error: studentErr } = await supabase
          .from('students')
          .select('provider_id')
          .eq('id', studentId)
          .single();

        if (studentErr || !student) {
          console.error('Error fetching student for session creation:', studentErr);
          return { success: false, error: studentErr?.message || 'Student not found' };
        }

        // Create initial unscheduled sessions
        console.log(`Creating ${newRequirements.sessions_per_week} initial unscheduled sessions for student ${studentId}`);

        const newUnscheduledSessions = Array.from(
          { length: newRequirements.sessions_per_week },
          () => ({
            student_id: studentId,
            provider_id: student.provider_id,
            day_of_week: null,
            start_time: null,
            end_time: null,
            service_type: 'resource',
            status: 'active' as const,
            delivered_by: 'provider' as const,
          })
        );

        const { error: insertErr } = await supabase
          .from('schedule_sessions')
          .insert(newUnscheduledSessions);

        if (insertErr) {
          console.error('Failed to create initial unscheduled sessions:', insertErr);
          return { success: false, error: insertErr.message };
        }

        console.log(`Successfully created ${newRequirements.sessions_per_week} initial unscheduled sessions`);
      }

      return { success: true };
    }

    // Step 1: Reset all sessions to 'active' before processing
    // This ensures stale conflict flags are cleared
    await resetSessionsToActive(supabase, studentId);

    // Step 2: Update session durations if minutes_per_session changed
    if (durationChanged && newRequirements.minutes_per_session != null) {
      await updateSessionDurations(
        supabase,
        existingSessions,
        newRequirements.minutes_per_session
      );
    }

    // Step 3: Adjust session count if sessions_per_week changed
    if (countChanged && newRequirements.sessions_per_week != null) {
      // Get provider_id from any existing session (they all have the same provider)
      const providerId = existingSessions[0]?.provider_id ?? undefined;

      // Only count non-completed sessions to match the invariant
      const activeSessionCount = existingSessions.filter(s => !s.is_completed).length;

      await adjustSessionCount(
        supabase,
        studentId,
        providerId,
        activeSessionCount,
        newRequirements.sessions_per_week
      );
    }

    // Step 4: Detect conflicts in updated sessions
    const conflictResult = await detectSessionConflicts(supabase, studentId);

    // Step 5: Mark conflicting sessions
    if (conflictResult.hasConflicts) {
      await markConflictingSessions(supabase, conflictResult.conflictingSessions);
    }

    return {
      success: true,
      conflictCount: conflictResult.conflictingSessions.length,
    };
  } catch (error) {
    console.error('Error updating sessions for student:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Resets all sessions for a student to 'active' status
 * This clears any stale conflict flags before re-running conflict detection
 */
async function resetSessionsToActive(
  supabase: ReturnType<typeof createClient<Database>>,
  studentId: string
): Promise<void> {
  const { error } = await supabase
    .from('schedule_sessions')
    .update({
      status: 'active',
      conflict_reason: null,
    })
    .eq('student_id', studentId)
    .neq('status', 'active'); // Only update non-active sessions

  if (error) {
    throw new Error(`Failed to reset session statuses: ${error.message}`);
  }
}

/**
 * Updates end_time for all sessions based on new duration
 */
async function updateSessionDurations(
  supabase: ReturnType<typeof createClient<Database>>,
  sessions: ScheduleSession[],
  newMinutesPerSession: number
): Promise<void> {
  // Filter to only include sessions with start times (scheduled sessions)
  const scheduledSessions = sessions.filter(
    (s): s is ScheduleSession & { start_time: string } => s.start_time !== null
  );

  // Update each session's end_time
  const updates = scheduledSessions.map(async (session) => {
    const newEndTime = addMinutesToTime(session.start_time, newMinutesPerSession);

    const update: SessionUpdate = {
      end_time: newEndTime,
      status: 'active', // Reset to active, conflicts will be detected next
      conflict_reason: null,
    };

    return supabase
      .from('schedule_sessions')
      .update(update)
      .eq('id', session.id);
  });

  const results = await Promise.all(updates);
  const firstError = results.find(r => r.error)?.error;
  if (firstError) {
    throw new Error(`Failed to update session duration: ${firstError.message}`);
  }
}

/**
 * Adjusts the number of sessions by deleting excess ones or creating missing ones
 */
async function adjustSessionCount(
  supabase: ReturnType<typeof createClient<Database>>,
  studentId: string,
  providerId: string | undefined,
  currentCount: number,
  targetCount: number
): Promise<void> {
  if (currentCount === targetCount) {
    // Count is already correct
    return;
  }

  if (currentCount > targetCount) {
    // Need to delete excess sessions
    console.log(`Deleting ${currentCount - targetCount} excess sessions for student ${studentId}`);

    // Get ALL sessions (including completed ones) to handle edge cases
    // where orphaned completed unscheduled sessions exist
    const { data: sessions, error: listErr } = await supabase
      .from('schedule_sessions')
      .select('id, day_of_week, start_time, created_at, is_completed')
      .eq('student_id', studentId);

    if (listErr) {
      throw new Error(`Failed to fetch sessions for count adjustment: ${listErr.message}`);
    }

    if (!sessions) return;

    // Sort sessions to prioritize deletion:
    // 1. Completed unscheduled sessions first (these are orphans that shouldn't exist)
    // 2. Active unscheduled sessions next
    // 3. Active scheduled sessions (by day/time to preserve earlier slots)
    // Note: We preserve completed scheduled sessions (valid history)
    const sortedSessions = [...sessions].sort((a, b) => {
      const aIsUnscheduled = a.day_of_week === null;
      const bIsUnscheduled = b.day_of_week === null;

      // Priority 1: Completed unscheduled sessions (orphans) - delete these first
      if (aIsUnscheduled && a.is_completed && !(bIsUnscheduled && b.is_completed)) return -1;
      if (bIsUnscheduled && b.is_completed && !(aIsUnscheduled && a.is_completed)) return 1;

      // Priority 2: Active unscheduled sessions - delete these next
      if (aIsUnscheduled && !a.is_completed && !(bIsUnscheduled && !b.is_completed)) return -1;
      if (bIsUnscheduled && !b.is_completed && !(aIsUnscheduled && !a.is_completed)) return 1;

      // Priority 3: Active scheduled sessions - delete later days/times first
      // Skip completed scheduled sessions (they're preserved)
      const aIsActiveScheduled = !aIsUnscheduled && !a.is_completed;
      const bIsActiveScheduled = !bIsUnscheduled && !b.is_completed;

      if (aIsActiveScheduled && !bIsActiveScheduled) return -1;
      if (bIsActiveScheduled && !aIsActiveScheduled) return 1;

      // Among active scheduled sessions, prioritize deleting later days
      if (a.day_of_week !== b.day_of_week) {
        if (a.day_of_week === null) return 1;
        if (b.day_of_week === null) return -1;
        return b.day_of_week - a.day_of_week;
      }

      // Among same day, prioritize deleting later times
      if (a.start_time !== b.start_time) {
        if (a.start_time === null) return 1;
        if (b.start_time === null) return -1;
        return b.start_time.localeCompare(a.start_time);
      }

      // Finally, by creation date (newer first)
      if (a.created_at === null && b.created_at === null) return 0;
      if (a.created_at === null) return 1;
      if (b.created_at === null) return -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Build deletion list: remove orphaned completed sessions + exactly excessCount active sessions
    const excessCount = currentCount - targetCount;
    const sessionsToDelete: typeof sortedSessions = [];
    let remainingActiveToRemove = excessCount;

    for (const session of sortedSessions) {
      const isCompletedOrphan = session.day_of_week === null && session.is_completed;

      // Stop if we've removed enough active sessions and there are no more orphans
      if (remainingActiveToRemove <= 0 && !isCompletedOrphan) {
        break;
      }

      sessionsToDelete.push(session);

      // Decrement counter only for active sessions
      if (!session.is_completed) {
        remainingActiveToRemove -= 1;
      }
    }

    // Verify we found enough active sessions to remove
    if (remainingActiveToRemove > 0) {
      throw new Error(
        `Expected to remove ${excessCount} active sessions but only found ${excessCount - remainingActiveToRemove}. ` +
        `This indicates a data inconsistency for student ${studentId}.`
      );
    }

    if (sessionsToDelete.length > 0) {
      const deleteIds = sessionsToDelete.map(s => s.id);
      const { error: delErr } = await supabase
        .from('schedule_sessions')
        .delete()
        .in('id', deleteIds);

      if (delErr) {
        throw new Error(`Failed to delete excess sessions: ${delErr.message}`);
      }

      console.log(`Successfully deleted ${sessionsToDelete.length} excess sessions`);
    }
  } else {
    // Need to create additional unscheduled sessions
    const sessionsToCreate = targetCount - currentCount;
    console.log(`Creating ${sessionsToCreate} new unscheduled sessions for student ${studentId}`);

    if (!providerId) {
      throw new Error('Cannot create new sessions without provider_id');
    }

    // Create unscheduled session records (with null day/time fields)
    const newUnscheduledSessions = Array.from({ length: sessionsToCreate }, () => ({
      student_id: studentId,
      provider_id: providerId,
      day_of_week: null,
      start_time: null,
      end_time: null,
      service_type: 'resource',
      status: 'active' as const,
      delivered_by: 'provider' as const,
    }));

    const { error: insertErr } = await supabase
      .from('schedule_sessions')
      .insert(newUnscheduledSessions);

    if (insertErr) {
      throw new Error(`Failed to create new unscheduled sessions: ${insertErr.message}`);
    }

    console.log(`Successfully created ${sessionsToCreate} new unscheduled sessions`);
  }
}

/**
 * Detects conflicts in sessions after updates
 */
async function detectSessionConflicts(
  supabase: ReturnType<typeof createClient<Database>>,
  studentId: string
): Promise<ConflictDetectionResult> {
  const conflictingSessions: Array<{ sessionId: string; reason: string }> = [];

  // Get all sessions for this student with student data
  const { data: sessions, error } = await supabase
    .from('schedule_sessions')
    .select(`
      *,
      student:students!schedule_sessions_student_id_fkey(
        teacher_name
      )
    `)
    .eq('student_id', studentId);

  if (error || !sessions) {
    console.error('Error fetching sessions for conflict detection:', error);
    return { hasConflicts: false, conflictingSessions: [] };
  }

  // Check each session for conflicts
  for (const session of sessions) {
    const conflicts: string[] = [];

    // Skip unscheduled sessions (no day/time set)
    if (!session.day_of_week || !session.start_time || !session.end_time) {
      continue;
    }

    // Conflict 1: Session extends beyond 5 PM
    if (session.end_time > '17:00:00') {
      conflicts.push('Session extends beyond 5:00 PM');
    }

    // Conflict 2: Overlaps with another session for the same student
    const overlappingSessions = sessions.filter(other =>
      other.id !== session.id &&
      other.day_of_week === session.day_of_week &&
      other.start_time && other.end_time && // Ensure other session is scheduled
      timesOverlap(session.start_time!, session.end_time!, other.start_time, other.end_time)
    );

    if (overlappingSessions.length > 0) {
      conflicts.push('Overlaps with another session for this student');
    }

    // Note: We do NOT check for "teacher scheduling conflicts" because it's normal
    // for multiple students from the same classroom teacher to have sessions at the same time
    // (that's when they're pulled out of class). This is not a conflict.

    // Add to conflicting sessions if any conflicts found
    if (conflicts.length > 0) {
      conflictingSessions.push({
        sessionId: session.id,
        reason: conflicts.join(' AND '),
      });
    }
  }

  return {
    hasConflicts: conflictingSessions.length > 0,
    conflictingSessions,
  };
}

/**
 * Marks sessions as needing attention
 */
async function markConflictingSessions(
  supabase: ReturnType<typeof createClient<Database>>,
  conflicts: Array<{ sessionId: string; reason: string }>
): Promise<void> {
  const updates = conflicts.map(conflict =>
    supabase
      .from('schedule_sessions')
      .update({
        status: 'needs_attention',
        conflict_reason: conflict.reason,
      })
      .eq('id', conflict.sessionId)
  );

  await Promise.all(updates);
}

/**
 * Helper: Add minutes to a time string (HH:MM:SS format)
 */
function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;

  // Handle wrap-around (cap at 23:59:59)
  const cappedMinutes = Math.min(totalMinutes, 24 * 60 - 1);

  const newHours = Math.floor(cappedMinutes / 60);
  const newMinutes = cappedMinutes % 60;

  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}:00`;
}

/**
 * Helper: Check if two time ranges overlap
 */
function timesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return start1 < end2 && end1 > start2;
}
