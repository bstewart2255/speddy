import { createClient } from '@/lib/supabase/client';
import { ScheduleSession, BellSchedule, SpecialActivity } from '@/src/types';
import { DEFAULT_SCHEDULING_CONFIG } from '@/lib/scheduling/scheduling-config';
import { requireNonNull } from '@/lib/types/utils';
import { formatDateLocal } from '@/lib/utils/date-helpers';
import { formatRoleLabel } from '@/lib/utils/role-utils';

// Helper functions for time conversion
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const addMinutesToTime = (time: string, minutesToAdd: number): string => {
  const totalMinutes = timeToMinutes(time) + minutesToAdd;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
};

/** SPE-255: a matched other-provider session (shape from find_matching_provider_sessions). */
export interface OtherProviderSessionLite {
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  provider_role: string | null;
}

/**
 * SPE-255: the first other-provider session that overlaps [startTime, endTime) on
 * `day`, else null. Pure (no I/O) so the cross-provider double-book rule is
 * unit-testable without a Supabase mock. Half-open overlap, matching
 * SessionUpdateService.hasTimeOverlap.
 */
export function findOverlappingOtherProviderSession(
  sessions: OtherProviderSessionLite[],
  day: number,
  startTime: string,
  endTime: string,
): OtherProviderSessionLite | null {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  for (const s of sessions) {
    if (s.day_of_week !== day || !s.start_time || !s.end_time) continue;
    if (start < timeToMinutes(s.end_time) && end > timeToMinutes(s.start_time)) {
      return s;
    }
  }
  return null;
}

export interface SessionUpdateParams {
  sessionId: string;
  newDay: number;
  newStartTime: string;
  newEndTime: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  conflicts?: {
    type: 'bell_schedule' | 'special_activity' | 'session' | 'rule_violation';
    description: string;
    conflictingItem?: any;
  }[];
}

export interface SessionMoveValidation {
  session: ScheduleSession;
  targetDay: number;
  targetStartTime: string;
  targetEndTime: string;
  studentMinutes: number;
}

export class SessionUpdateService {
  private supabase = createClient();

  /**
   * Validates a session move without updating the database
   * Used for drag preview and pre-drop validation
   */
  async validateOnly(
    sessionId: string,
    newDay: number,
    newStartTime: string,
    newEndTime: string
  ): Promise<ValidationResult> {
    try {
      // Fetch the current session
      const { data: session, error: sessionError } = await this.supabase
        .from('schedule_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        return { valid: false, error: 'Session not found' };
      }

      // Validate the move
      const validation = await this.validateSessionMove({
        session,
        targetDay: newDay,
        targetStartTime: newStartTime,
        targetEndTime: newEndTime,
        studentMinutes: Math.floor((timeToMinutes(newEndTime) - timeToMinutes(newStartTime)))
      });

      return validation;
    } catch (error) {
      console.error('Validation error:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Updates a session's schedule time
   */
  async updateSessionTime(
    sessionId: string,
    newDay: number,
    newStartTime: string,
    newEndTime: string,
    forceUpdate: boolean = false
  ): Promise<{ 
    success: boolean; 
    error?: string; 
    session?: ScheduleSession;
    conflicts?: ValidationResult['conflicts'];
    hasConflicts?: boolean;
    requiresConfirmation?: boolean;
  }> {
    try {
      // Get current user
      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        return { success: false, error: 'Authentication required' };
      }

      // Fetch the current session
      const { data: session, error: sessionError } = await this.supabase
        .from('schedule_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        return { success: false, error: 'Session not found' };
      }

      // Validate the move before updating. This is the commit path, so include the
      // cross-provider double-book check (SPE-255) — the per-student RPC it runs is
      // skipped on the higher-frequency drag-preview / batch-marking paths.
      const validation = await this.validateSessionMove({
        session,
        targetDay: newDay,
        targetStartTime: newStartTime,
        targetEndTime: newEndTime,
        studentMinutes: Math.floor((timeToMinutes(newEndTime) - timeToMinutes(newStartTime)))
      }, { checkCrossProvider: true });

      // If validation fails and force update is not set, return without updating
      if (!validation.valid && validation.conflicts && !forceUpdate) {
        console.log('Session move has conflicts, requiring confirmation:', validation.conflicts);
        return {
          success: false,
          conflicts: validation.conflicts,
          hasConflicts: true,
          requiresConfirmation: true,
          error: validation.error
        };
      }

      // Perform the update (either valid or forced)
      const updateData: any = {
        day_of_week: newDay,
        start_time: newStartTime,
        end_time: newEndTime,
        updated_at: new Date().toISOString()
      };

      // Update conflict status based on validation
      if (validation.valid) {
        // Valid move - clear any existing conflicts
        updateData.status = 'active';
        updateData.has_conflict = false;
        updateData.conflict_reason = null;
      } else if (forceUpdate && validation.conflicts && validation.conflicts.length > 0) {
        // Forced move with conflicts - mark as needs attention
        updateData.status = 'needs_attention';
        updateData.has_conflict = true;
        updateData.conflict_reason = validation.conflicts.map(c => c.description).join(' AND ');
      }

      const { data: updatedSession, error: updateError } = await this.supabase
        .from('schedule_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single();

      if (updateError) {
        console.error('Database update error:', updateError);
        return { success: false, error: 'Failed to update session' };
      }

      console.log('Session updated successfully:', sessionId, {
        newDay,
        newStartTime,
        newEndTime
      });

      // Clear stale conflicts on OTHER sessions that may have been resolved by this
      // move. Exclude the just-moved session (sessionId): its conflict state was set
      // above from the full validation, which includes the cross-provider double-book
      // check (SPE-255); the same-provider-only cleanup must not overwrite it.
      if (session.student_id && session.provider_id) {
        // Always check the new day for stale conflicts
        await this.clearStaleConflictsForStudent(session.student_id, session.provider_id, newDay, sessionId);

        // If the day changed, also check the old day
        if (session.day_of_week !== null && session.day_of_week !== newDay) {
          await this.clearStaleConflictsForStudent(session.student_id, session.provider_id, session.day_of_week, sessionId);
        }
      }

      // ORPHAN CLEANUP: When a template's time/day changes, delete future orphaned instances
      // This prevents old instances from showing up in Day view/Today's Schedule
      if (session.session_date === null) {
        const timeChanged = session.start_time !== newStartTime || session.day_of_week !== newDay;

        if (timeChanged && session.start_time && session.day_of_week !== null) {
          const today = formatDateLocal(new Date());

          console.log('Cleaning up orphaned instances:', {
            studentId: session.student_id,
            oldDay: session.day_of_week,
            oldStartTime: session.start_time,
            newDay,
            newStartTime
          });

          // Delete future non-completed instances at the OLD time
          const { error: cleanupError, count } = await this.supabase
            .from('schedule_sessions')
            .delete()
            .eq('student_id', session.student_id)
            .eq('provider_id', session.provider_id)
            .eq('day_of_week', session.day_of_week)
            .eq('start_time', session.start_time)
            .gte('session_date', today)
            .is('completed_at', null);

          if (cleanupError) {
            console.error('Error cleaning up orphaned instances:', cleanupError);
          } else {
            console.log(`Deleted ${count || 0} orphaned instances`);
          }
        }
      }

      // Generate instances if this is a template session being scheduled
      // Only create instances if:
      // 1. Session has no session_date (it's a template)
      // 2. Session now has valid schedule (day_of_week, start_time, end_time)
      // 3. Session wasn't already scheduled (changed from unscheduled to scheduled)
      if (updatedSession.session_date === null &&
          updatedSession.day_of_week !== null &&
          updatedSession.start_time !== null &&
          updatedSession.end_time !== null) {

        // Check if this session was previously unscheduled
        const wasUnscheduled = session.day_of_week === null ||
                              session.start_time === null ||
                              session.end_time === null;

        if (wasUnscheduled) {
          // This is a newly scheduled session - create instances via API
          // Instances are generated through school year end (June 30) by default
          console.log('Creating instances for newly scheduled template through school year end:', sessionId);

          // Create instances asynchronously (don't block the response)
          // Pass useSchoolYearEnd: true to generate through June 30
          fetch('/api/sessions/generate-instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, useSchoolYearEnd: true })
          })
            .then(async (response) => {
              if (response.ok) {
                const data = await response.json();
                console.log(`Created ${data.instancesCreated} instances for session ${sessionId} through ${data.endDate || 'school year end'}`);
              } else {
                const error = await response.json();
                console.error(`Failed to create instances for session ${sessionId}:`, error.error);
              }
            })
            .catch(err => {
              console.error('Instance generation error:', err);
            });
        }
      }

      // The database update will automatically trigger real-time events
      // No need to manually broadcast

      const result: {
        success: boolean;
        session?: ScheduleSession;
        conflicts?: ValidationResult['conflicts'];
        hasConflicts?: boolean;
      } = { success: true, session: updatedSession };
      
      if (!validation.valid && validation.conflicts) {
        result.conflicts = validation.conflicts;
        result.hasConflicts = true;
      }
      
      return result;
    } catch (error) {
      console.error('Session update error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  /**
   * Validates if a session can be moved to a new time slot
   */
  async validateSessionMove(
    params: SessionMoveValidation,
    opts?: { checkCrossProvider?: boolean },
  ): Promise<ValidationResult> {
    const { session, targetDay, targetStartTime, targetEndTime, studentMinutes } = params;
    const conflicts: ValidationResult['conflicts'] = [];

    // Skip validation for temporary sessions
    if (session.id.startsWith('temp-')) {
      return { valid: true };
    }

    // Validate required fields
    const providerId = requireNonNull(session.provider_id, 'session.provider_id');
    const studentId = requireNonNull(session.student_id, 'session.student_id');

    // Validate time range
    if (timeToMinutes(targetStartTime) >= timeToMinutes(targetEndTime)) {
      return {
        valid: false,
        error: 'Invalid time range: start time must be before end time'
      };
    }

    // Check if the date is in the past (for instance sessions)
    if (session.session_date) {
      const sessionDate = new Date(session.session_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (sessionDate < today) {
        return {
          valid: false,
          error: 'Cannot modify sessions in the past'
        };
      }
    }

    // Run the independent conflict checks concurrently. Order is preserved so
    // conflict priority (the conflicts[0] surfaced as `error`) is unchanged.
    const checks: Array<Promise<NonNullable<ValidationResult['conflicts']>[0] | null>> = [
      this.checkBellScheduleConflicts(providerId, studentId, targetDay, targetStartTime, targetEndTime),
      this.checkSpecialActivityConflicts(providerId, studentId, targetDay, targetStartTime, targetEndTime),
      this.checkConcurrentSessionLimit(providerId, targetDay, targetStartTime, targetEndTime, session.id),
      this.checkConsecutiveSessionRules(providerId, studentId, targetDay, targetStartTime, targetEndTime, session.id),
      this.checkBreakRequirements(providerId, studentId, targetDay, targetStartTime, targetEndTime, session.id),
      this.checkStudentSessionOverlap(studentId, targetDay, targetStartTime, targetEndTime, session.id),
    ];

    // SPE-255: the cross-provider double-book check hits a per-student RPC, so it
    // runs ONLY on an actual commit (updateSessionTime passes checkCrossProvider).
    // Drag-preview (validateOnly) and the per-session batch conflict-marking loops
    // call validateSessionMove many times and must not fire one RPC each.
    if (opts?.checkCrossProvider) {
      checks.push(this.checkCrossProviderStudentOverlap(studentId, targetDay, targetStartTime, targetEndTime));
    }

    for (const conflict of await Promise.all(checks)) {
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    if (conflicts.length > 0) {
      return {
        valid: false,
        error: conflicts[0].description,
        conflicts
      };
    }

    return { valid: true };
  }

  /**
   * Broadcasts real-time updates to all connected clients
   * Note: This is typically not needed as Supabase automatically
   * broadcasts database changes through real-time subscriptions
   */
  async broadcastUpdate(sessionId: string): Promise<void> {
    // Removed manual broadcast as Supabase handles this automatically
    // when subscribed to postgres_changes
  }

  /**
   * Check for bell schedule conflicts
   */
  private async checkBellScheduleConflicts(
    providerId: string,
    studentId: string,
    day: number,
    startTime: string,
    endTime: string
  ): Promise<NonNullable<ValidationResult['conflicts']>[0] | null> {
    // Get student information to determine grade level and school
    const { data: student } = await this.supabase
      .from('students')
      .select('grade_level, school_id')
      .eq('id', studentId)
      .single();

    if (!student || !student.school_id) {
      return null;
    }

    // Check if session overlaps with bell schedule periods
    // Note: Bell schedules can have comma-separated grade levels like "1,2,3"
    // Only check bell schedules from the same school as the student
    const { data: bellSchedules } = await this.supabase
      .from('bell_schedules')
      .select('*')
      .eq('provider_id', providerId)
      .eq('day_of_week', day)
      .eq('school_id', student.school_id);

    if (bellSchedules) {
      for (const schedule of bellSchedules) {
        // Parse comma-separated grade levels from bell schedule
        const bellGrades = schedule.grade_level.split(',').map((g: string) => g.trim());
        
        // Check if student's grade is in the bell schedule's grade list
        if (bellGrades.includes(student.grade_level.trim())) {
          if (this.hasTimeOverlap(startTime, endTime, schedule.start_time, schedule.end_time)) {
            return {
              type: 'bell_schedule',
              description: `Conflicts with bell schedule period "${schedule.period_name}" (${schedule.start_time} - ${schedule.end_time})`,
              conflictingItem: schedule
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Check for special activity conflicts
   */
  private async checkSpecialActivityConflicts(
    providerId: string,
    studentId: string,
    day: number,
    startTime: string,
    endTime: string
  ): Promise<NonNullable<ValidationResult['conflicts']>[0] | null> {
    // Get student's teacher and school information
    const { data: student } = await this.supabase
      .from('students')
      .select('teacher_name, school_id')
      .eq('id', studentId)
      .single();

    if (!student || !student.teacher_name || !student.school_id) {
      return null;
    }

    // Only check special activities for this student's teacher and school
    const { data: activities } = await this.supabase
      .from('special_activities')
      .select('*')
      .eq('provider_id', providerId)
      .eq('teacher_name', student.teacher_name)
      .eq('day_of_week', day)
      .eq('school_id', student.school_id);

    if (activities) {
      for (const activity of activities) {
        if (this.hasTimeOverlap(startTime, endTime, activity.start_time, activity.end_time)) {
          return {
            type: 'special_activity',
            description: `Conflicts with special activity "${activity.activity_name}" with ${activity.teacher_name} (${activity.start_time} - ${activity.end_time})`,
            conflictingItem: activity
          };
        }
      }
    }

    return null;
  }

  /**
   * Check concurrent session limit (max 8)
   */
  private async checkConcurrentSessionLimit(
    providerId: string,
    day: number,
    startTime: string,
    endTime: string,
    excludeSessionId: string
  ): Promise<NonNullable<ValidationResult['conflicts']>[0] | null> {
    const { data: sessions } = await this.supabase
      .from('schedule_sessions')
      .select('*')
      .eq('provider_id', providerId)
      .eq('day_of_week', day)
      .neq('id', excludeSessionId)
      .is('session_date', null) // Only check template sessions
      .is('deleted_at', null)
      .not('start_time', 'is', null) // Only check scheduled sessions
      .not('end_time', 'is', null);

    if (!sessions) {
      return null;
    }

    // Count concurrent sessions at any point during the target time
    const targetStart = timeToMinutes(startTime);
    const targetEnd = timeToMinutes(endTime);
    let maxConcurrent = 0;

    for (let minute = targetStart; minute < targetEnd; minute++) {
      let concurrent = 0;
      const currentTime = addMinutesToTime('00:00', minute);

      for (const session of sessions) {
        if (this.timeIsWithinSession(currentTime, session.start_time, session.end_time)) {
          concurrent++;
        }
      }

      maxConcurrent = Math.max(maxConcurrent, concurrent);
    }

    const limit = DEFAULT_SCHEDULING_CONFIG.maxConcurrentSessions;
    if (maxConcurrent >= limit) {
      return {
        type: 'rule_violation',
        description: `Maximum concurrent session limit (${limit}) would be exceeded`,
        conflictingItem: { maxConcurrent: maxConcurrent + 1 }
      };
    }

    return null;
  }

  /**
   * Check consecutive session rules (max 60 minutes)
   */
  private async checkConsecutiveSessionRules(
    providerId: string,
    studentId: string,
    day: number,
    startTime: string,
    endTime: string,
    excludeSessionId: string
  ): Promise<NonNullable<ValidationResult['conflicts']>[0] | null> {
    const { data: sessions } = await this.supabase
      .from('schedule_sessions')
      .select('*')
      .eq('provider_id', providerId)
      .eq('student_id', studentId)
      .eq('day_of_week', day)
      .neq('id', excludeSessionId)
      .is('session_date', null) // Only check template sessions
      .is('deleted_at', null)
      .not('start_time', 'is', null) // Only check scheduled sessions
      .not('end_time', 'is', null)
      .order('start_time');

    if (!sessions || sessions.length === 0) {
      return null;
    }

    const targetStart = timeToMinutes(startTime);
    const targetEnd = timeToMinutes(endTime);
    const targetDuration = targetEnd - targetStart;

    // Check if this session would create a consecutive block > 60 minutes
    for (const session of sessions) {
      const sessionStart = timeToMinutes(session.start_time);
      const sessionEnd = timeToMinutes(session.end_time);

      // Check if sessions are consecutive (no gap)
      if (sessionEnd === targetStart || targetEnd === sessionStart) {
        const totalConsecutive = targetDuration + (sessionEnd - sessionStart);
        if (totalConsecutive > 60) {
          return {
            type: 'rule_violation',
            description: `Would create consecutive sessions longer than 60 minutes (${totalConsecutive} minutes total)`,
            conflictingItem: { totalMinutes: totalConsecutive }
          };
        }
      }
    }

    return null;
  }

  /**
   * Check break requirements (30 minutes between non-consecutive sessions)
   */
  private async checkBreakRequirements(
    providerId: string,
    studentId: string,
    day: number,
    startTime: string,
    endTime: string,
    excludeSessionId: string
  ): Promise<NonNullable<ValidationResult['conflicts']>[0] | null> {
    const { data: sessions } = await this.supabase
      .from('schedule_sessions')
      .select('*')
      .eq('provider_id', providerId)
      .eq('student_id', studentId)
      .eq('day_of_week', day)
      .neq('id', excludeSessionId)
      .is('session_date', null) // Only check template sessions
      .is('deleted_at', null)
      .not('start_time', 'is', null) // Only check scheduled sessions
      .not('end_time', 'is', null)
      .order('start_time');

    if (!sessions || sessions.length === 0) {
      return null;
    }

    const targetStart = timeToMinutes(startTime);
    const targetEnd = timeToMinutes(endTime);

    for (const session of sessions) {
      const sessionStart = timeToMinutes(session.start_time);
      const sessionEnd = timeToMinutes(session.end_time);

      // Check gap between sessions
      const gapBefore = targetStart - sessionEnd;
      const gapAfter = sessionStart - targetEnd;

      // If there's a gap but it's less than 30 minutes
      if ((gapBefore > 0 && gapBefore < 30) || (gapAfter > 0 && gapAfter < 30)) {
        const actualGap = gapBefore > 0 ? gapBefore : gapAfter;
        return {
          type: 'rule_violation',
          description: `Requires at least 30 minutes break between non-consecutive sessions (only ${actualGap} minutes gap)`,
          conflictingItem: { 
            conflictingSession: session,
            gapMinutes: actualGap 
          }
        };
      }
    }

    return null;
  }

  /**
   * Check for overlapping sessions for the same student
   */
  private async checkStudentSessionOverlap(
    studentId: string,
    day: number,
    startTime: string,
    endTime: string,
    excludeSessionId: string
  ): Promise<NonNullable<ValidationResult['conflicts']>[0] | null> {
    const { data: sessions } = await this.supabase
      .from('schedule_sessions')
      .select('*')
      .eq('student_id', studentId)
      .eq('day_of_week', day)
      .neq('id', excludeSessionId)
      .is('session_date', null) // Only check template sessions
      .is('deleted_at', null)
      .not('start_time', 'is', null) // Only check scheduled sessions
      .not('end_time', 'is', null);

    if (sessions) {
      for (const session of sessions) {
        if (this.hasTimeOverlap(startTime, endTime, session.start_time, session.end_time)) {
          return {
            type: 'session',
            description: `Student already has a session scheduled at ${session.start_time} - ${session.end_time}`,
            conflictingItem: session
          };
        }
      }
    }

    return null;
  }

  /**
   * SPE-255: warn when placing this session would overlap a session the SAME
   * student has with ANOTHER provider (a shared elementary student — e.g. RSP +
   * Speech). checkStudentSessionOverlap catches own-provider overlaps; RLS hides
   * the other provider's rows from a direct query, so we resolve the shared
   * student via the SECURITY DEFINER find_matching_provider_sessions RPC (the same
   * matched sessions already drawn as grey "other provider" bands on the grid).
   *
   * Surfaced as an override-able warning like every other conflict here — the
   * cross-provider identity match is a best-guess (initials+grade+school+teacher),
   * so a wrong guess must be dismissable, never a hard block. Fails open: a
   * warning we couldn't compute must not turn into a false block.
   *
   * Limitation: the RPC only returns data when the caller OWNS the student, so a
   * non-owning viewer (SEA/specialist moving an assigned session) gets no warning.
   * That's fail-safe (never a false block) and matches the grey-bands display,
   * which uses the same RPC; the owning provider still sees the warning.
   */
  private async checkCrossProviderStudentOverlap(
    studentId: string,
    day: number,
    startTime: string,
    endTime: string,
  ): Promise<NonNullable<ValidationResult['conflicts']>[0] | null> {
    try {
      const { data, error } = await this.supabase.rpc('find_matching_provider_sessions', {
        p_student_id: studentId,
      });
      if (error) {
        console.error('Cross-provider overlap check failed:', error);
        return null;
      }
      if (!Array.isArray(data)) return null;
      const hit = findOverlappingOtherProviderSession(data, day, startTime, endTime);
      if (!hit || !hit.start_time || !hit.end_time) return null;
      return {
        type: 'session',
        description: `This student is also scheduled with ${formatRoleLabel(hit.provider_role)} at ${hit.start_time.slice(0, 5)} - ${hit.end_time.slice(0, 5)} — placing here would double-book them`,
        conflictingItem: hit,
      };
    } catch (e) {
      console.error('Cross-provider overlap check threw:', e);
      return null;
    }
  }

  /**
   * Check if two time periods overlap
   */
  private hasTimeOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): boolean {
    const start1Min = timeToMinutes(start1);
    const end1Min = timeToMinutes(end1);
    const start2Min = timeToMinutes(start2);
    const end2Min = timeToMinutes(end2);

    return start1Min < end2Min && end1Min > start2Min;
  }

  /**
   * Check if a time falls within a session
   */
  private timeIsWithinSession(
    time: string,
    sessionStart: string,
    sessionEnd: string
  ): boolean {
    const timeMin = timeToMinutes(time);
    const startMin = timeToMinutes(sessionStart);
    const endMin = timeToMinutes(sessionEnd);

    return timeMin >= startMin && timeMin < endMin;
  }

  /**
   * Clears stale conflict flags on other sessions for the same student
   * This should be called after moving or unscheduling a session, as the move
   * may have resolved conflicts on OTHER sessions that were conflicting with it
   */
  private async clearStaleConflictsForStudent(
    studentId: string,
    providerId: string,
    day: number,
    excludeSessionId?: string
  ): Promise<void> {
    try {
      // Find all sessions for this student/provider/day that have conflict flags
      const { data: flaggedSessions, error: fetchError } = await this.supabase
        .from('schedule_sessions')
        .select('*')
        .eq('student_id', studentId)
        .eq('provider_id', providerId)
        .eq('day_of_week', day)
        .eq('has_conflict', true)
        .is('session_date', null) // Only templates
        .is('deleted_at', null);

      if (fetchError || !flaggedSessions || flaggedSessions.length === 0) {
        return;
      }

      // Get all scheduled sessions for this student/provider/day to check overlaps
      const { data: allSessions } = await this.supabase
        .from('schedule_sessions')
        .select('*')
        .eq('student_id', studentId)
        .eq('provider_id', providerId)
        .eq('day_of_week', day)
        .is('session_date', null)
        .is('deleted_at', null)
        .not('start_time', 'is', null)
        .not('end_time', 'is', null);

      if (!allSessions) {
        return;
      }

      // For each flagged session, check if it still has an actual overlap
      for (const flaggedSession of flaggedSessions) {
        // Skip the session that was just moved: its conflict state was set
        // authoritatively by validateSessionMove, which includes the
        // cross-provider double-book check (SPE-255). The same-provider-only
        // overlap logic below can't see cross-provider conflicts, so
        // re-evaluating it here would erase a legitimate cross-provider flag.
        // Other flagged sessions are still re-checked and cleared as normal.
        if (excludeSessionId && flaggedSession.id === excludeSessionId) {
          continue;
        }
        if (!flaggedSession.start_time || !flaggedSession.end_time) {
          continue;
        }

        let stillHasOverlap = false;

        for (const otherSession of allSessions) {
          if (otherSession.id === flaggedSession.id) {
            continue;
          }

          if (this.hasTimeOverlap(
            flaggedSession.start_time,
            flaggedSession.end_time,
            otherSession.start_time,
            otherSession.end_time
          )) {
            stillHasOverlap = true;
            break;
          }
        }

        // If no longer overlapping, clear the conflict flag
        if (!stillHasOverlap) {
          console.log('Clearing stale conflict on session:', flaggedSession.id);
          await this.supabase
            .from('schedule_sessions')
            .update({
              status: 'active',
              has_conflict: false,
              conflict_reason: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', flaggedSession.id);
        }
      }
    } catch (error) {
      console.error('Error clearing stale conflicts:', error);
      // Don't throw - this is a cleanup operation, not critical
    }
  }

  /**
   * Unschedules a session by setting day_of_week, start_time, and end_time to NULL
   * Status is set to 'active' since unscheduled sessions can't have conflicts or need attention
   * (those statuses only apply to scheduled sessions)
   */
  async unscheduleSession(sessionId: string): Promise<{
    success: boolean;
    error?: string;
    session?: ScheduleSession;
  }> {
    try {
      // First fetch the session to get the original day (needed for stale conflict cleanup)
      const { data: originalSession, error: fetchError } = await this.supabase
        .from('schedule_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (fetchError || !originalSession) {
        console.error('Error fetching session for unschedule:', fetchError);
        return { success: false, error: 'Session not found' };
      }

      const { data: updatedSession, error: updateError } = await this.supabase
        .from('schedule_sessions')
        .update({
          day_of_week: null,
          start_time: null,
          end_time: null,
          status: 'active', // Unscheduled sessions are active by default (conflicts/attention only apply to scheduled sessions)
          has_conflict: false, // Unscheduled sessions have no conflicts
          conflict_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (updateError) {
        console.error('Error unscheduling session:', updateError);
        return { success: false, error: 'Failed to unschedule session' };
      }

      console.log('Session unscheduled successfully:', sessionId);

      // Clear stale conflicts on other sessions that may have been resolved by this unschedule
      if (originalSession.student_id && originalSession.provider_id && originalSession.day_of_week !== null) {
        await this.clearStaleConflictsForStudent(
          originalSession.student_id,
          originalSession.provider_id,
          originalSession.day_of_week
        );
      }

      return { success: true, session: updatedSession };
    } catch (error) {
      console.error('Unschedule session error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  /**
   * Unschedules all sessions for a specific day
   */
  async unscheduleDaySessions(providerId: string, dayOfWeek: number): Promise<{
    success: boolean;
    error?: string;
    count?: number;
  }> {
    try {
      const { data: updatedSessions, error: updateError } = await this.supabase
        .from('schedule_sessions')
        .update({
          day_of_week: null,
          start_time: null,
          end_time: null,
          status: 'active',
          has_conflict: false, // Unscheduled sessions have no conflicts
          conflict_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq('provider_id', providerId)
        .eq('day_of_week', dayOfWeek)
        .select();

      if (updateError) {
        console.error('Error unscheduling day sessions:', updateError);
        return { success: false, error: 'Failed to unschedule sessions' };
      }

      console.log(`Unscheduled ${updatedSessions?.length || 0} sessions from day ${dayOfWeek}`);
      return { success: true, count: updatedSessions?.length || 0 };
    } catch (error) {
      console.error('Unschedule day sessions error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
}

// Export a singleton instance
export const sessionUpdateService = new SessionUpdateService();