import { createClient } from '@/lib/supabase/client';
import { ScheduleSession, BellSchedule, SpecialActivity } from '@/src/types/database';
import { DEFAULT_SCHEDULING_CONFIG } from '@/lib/scheduling/scheduling-config';

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

      // Validate the move before updating
      const validation = await this.validateSessionMove({
        session,
        targetDay: newDay,
        targetStartTime: newStartTime,
        targetEndTime: newEndTime,
        studentMinutes: Math.floor((timeToMinutes(newEndTime) - timeToMinutes(newStartTime)))
      });

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
        updateData.conflict_reason = null;
      } else if (forceUpdate && validation.conflicts && validation.conflicts.length > 0) {
        // Forced move with conflicts - mark as needs attention
        updateData.status = 'needs_attention';
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
  async validateSessionMove(params: SessionMoveValidation): Promise<ValidationResult> {
    const { session, targetDay, targetStartTime, targetEndTime, studentMinutes } = params;
    const conflicts: ValidationResult['conflicts'] = [];

    // Skip validation for temporary sessions
    if (session.id.startsWith('temp-')) {
      return { valid: true };
    }

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

    // Check bell schedule conflicts
    const bellScheduleConflict = await this.checkBellScheduleConflicts(
      session.provider_id,
      session.student_id,
      targetDay,
      targetStartTime,
      targetEndTime
    );
    if (bellScheduleConflict) {
      conflicts.push(bellScheduleConflict);
    }

    // Check special activity conflicts
    const specialActivityConflict = await this.checkSpecialActivityConflicts(
      session.provider_id,
      session.student_id,
      targetDay,
      targetStartTime,
      targetEndTime
    );
    if (specialActivityConflict) {
      conflicts.push(specialActivityConflict);
    }

    // Check concurrent session limits
    const concurrentConflict = await this.checkConcurrentSessionLimit(
      session.provider_id,
      targetDay,
      targetStartTime,
      targetEndTime,
      session.id
    );
    if (concurrentConflict) {
      conflicts.push(concurrentConflict);
    }

    // Check consecutive session rules
    const consecutiveConflict = await this.checkConsecutiveSessionRules(
      session.provider_id,
      session.student_id,
      targetDay,
      targetStartTime,
      targetEndTime,
      session.id
    );
    if (consecutiveConflict) {
      conflicts.push(consecutiveConflict);
    }

    // Check break requirements
    const breakConflict = await this.checkBreakRequirements(
      session.provider_id,
      session.student_id,
      targetDay,
      targetStartTime,
      targetEndTime,
      session.id
    );
    if (breakConflict) {
      conflicts.push(breakConflict);
    }

    // Check for overlapping sessions for the same student
    const overlapConflict = await this.checkStudentSessionOverlap(
      session.student_id,
      targetDay,
      targetStartTime,
      targetEndTime,
      session.id
    );
    if (overlapConflict) {
      conflicts.push(overlapConflict);
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
      const { data: updatedSession, error: updateError } = await this.supabase
        .from('schedule_sessions')
        .update({
          day_of_week: null,
          start_time: null,
          end_time: null,
          status: 'active', // Unscheduled sessions are active by default (conflicts/attention only apply to scheduled sessions)
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