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
      // No sessions to update
      return { success: true };
    }

    // Step 1: Update session durations if minutes_per_session changed
    if (durationChanged && newRequirements.minutes_per_session) {
      await updateSessionDurations(
        supabase,
        existingSessions,
        newRequirements.minutes_per_session
      );
    }

    // Step 2: Adjust session count if sessions_per_week changed
    if (countChanged && newRequirements.sessions_per_week) {
      await adjustSessionCount(
        supabase,
        studentId,
        existingSessions.length,
        newRequirements.sessions_per_week
      );
    }

    // Step 3: Detect conflicts in updated sessions
    const conflictResult = await detectSessionConflicts(supabase, studentId);

    // Step 4: Mark conflicting sessions
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
 * Updates end_time for all sessions based on new duration
 */
async function updateSessionDurations(
  supabase: ReturnType<typeof createClient<Database>>,
  sessions: ScheduleSession[],
  newMinutesPerSession: number
): Promise<void> {
  // Update each session's end_time
  const updates = sessions.map(async (session) => {
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

  await Promise.all(updates);
}

/**
 * Adjusts the number of sessions by deleting excess ones
 */
async function adjustSessionCount(
  supabase: ReturnType<typeof createClient<Database>>,
  studentId: string,
  currentCount: number,
  targetCount: number
): Promise<void> {
  if (currentCount <= targetCount) {
    // Nothing to delete (either same or need more sessions)
    return;
  }

  // Need to delete excess sessions
  const excessCount = currentCount - targetCount;

  // Get sessions sorted by day and time
  const { data: sessions } = await supabase
    .from('schedule_sessions')
    .select('id')
    .eq('student_id', studentId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (!sessions) return;

  // Keep the earliest sessions, delete the rest
  const sessionsToDelete = sessions.slice(targetCount);

  if (sessionsToDelete.length > 0) {
    const deleteIds = sessionsToDelete.map(s => s.id);
    await supabase
      .from('schedule_sessions')
      .delete()
      .in('id', deleteIds);
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

    // Conflict 1: Session extends beyond 5 PM
    if (session.end_time > '17:00:00') {
      conflicts.push('Session extends beyond 5:00 PM');
    }

    // Conflict 2: Overlaps with another session for the same student
    const overlappingSessions = sessions.filter(other =>
      other.id !== session.id &&
      other.day_of_week === session.day_of_week &&
      timesOverlap(session.start_time, session.end_time, other.start_time, other.end_time)
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
