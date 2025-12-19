import { createClient } from '@/lib/supabase/client';
import { Database } from '../../src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
type Student = Database['public']['Tables']['students']['Row'];

// Subset of fields needed for conflict resolution
type BellScheduleConflictData = Pick<BellSchedule, 'grade_level' | 'day_of_week' | 'start_time' | 'end_time' | 'period_name' | 'school_id'>;
type SpecialActivityConflictData = Pick<SpecialActivity, 'teacher_name' | 'day_of_week' | 'start_time' | 'end_time' | 'school_id'> & {
  activity_name?: string;
};

export class ConflictResolver {
  private supabase;
  private providerId: string;

  constructor(providerId: string) {
    this.supabase = createClient();
    this.providerId = providerId;
  }

  // Check and mark conflicts after bell schedule changes
  async resolveBellScheduleConflicts(newBellSchedule: BellScheduleConflictData) {
    try {
      // Validate school_id is present to prevent cross-school conflicts
      if (!newBellSchedule.school_id) {
        console.warn('resolveBellScheduleConflicts called without school_id - skipping conflict resolution');
        return { marked: 0, failed: 0 };
      }

      // Find all sessions that conflict with the new bell schedule
      // Only check sessions for students from the same school
      const { data: allSessions } = await this.supabase
        .from('schedule_sessions')
        .select('*, students!inner(*)')
        .eq('provider_id', this.providerId)
        .eq('students.school_id', newBellSchedule.school_id);

      if (!allSessions) return { marked: 0, failed: 0 };

      const conflictingSessions = allSessions.filter(session => {
        const student = session.students;
        const grades = newBellSchedule.grade_level.split(',').map(g => g.trim());

        return grades.includes(student.grade_level.trim()) &&
               session.day_of_week === newBellSchedule.day_of_week &&
               this.hasTimeOverlap(
                 session.start_time,
                 session.end_time,
                 newBellSchedule.start_time,
                 newBellSchedule.end_time
               );
      });

      const conflictReason = `Conflicts with ${newBellSchedule.period_name} (${newBellSchedule.start_time.slice(0, 5)}-${newBellSchedule.end_time.slice(0, 5)})`;
      return await this.markSessionsAsConflicted(conflictingSessions, conflictReason);
    } catch (error) {
      console.error('Error resolving bell schedule conflicts:', error);
      return { marked: 0, failed: 0, error: (error as Error).message };
    }
  }

  // Check and mark conflicts after special activity changes
  async resolveSpecialActivityConflicts(newActivity: SpecialActivityConflictData) {
    try {
      // Validate school_id is present to prevent cross-school conflicts
      if (!newActivity.school_id) {
        console.warn('resolveSpecialActivityConflicts called without school_id - skipping conflict resolution');
        return { marked: 0, failed: 0 };
      }

      // Find all sessions that conflict with the new special activity
      // Only check sessions for students from the same school
      const { data: allSessions } = await this.supabase
        .from('schedule_sessions')
        .select('*, students!inner(*)')
        .eq('provider_id', this.providerId)
        .eq('students.school_id', newActivity.school_id);

      if (!allSessions) return { marked: 0, failed: 0 };

      const conflictingSessions = allSessions.filter(session => {
        const student = session.students;

        return student.teacher_name === newActivity.teacher_name &&
               session.day_of_week === newActivity.day_of_week &&
               this.hasTimeOverlap(
                 session.start_time,
                 session.end_time,
                 newActivity.start_time,
                 newActivity.end_time
               );
      });

      const activityName = newActivity.activity_name || 'special activity';
      const conflictReason = `Conflicts with ${activityName} (${newActivity.start_time.slice(0, 5)}-${newActivity.end_time.slice(0, 5)})`;
      return await this.markSessionsAsConflicted(conflictingSessions, conflictReason);
    } catch (error) {
      console.error('Error resolving special activity conflicts:', error);
      return { marked: 0, failed: 0, error: (error as Error).message };
    }
  }

  // Mark sessions as conflicted instead of deleting/rescheduling them
  private async markSessionsAsConflicted(conflictingSessions: any[], conflictReason: string) {
    let marked = 0;
    let failed = 0;

    for (const session of conflictingSessions) {
      try {
        // Update the session to mark it as conflicted
        // Using 'needs_attention' status to preserve grade color while showing alert icon
        const { error } = await this.supabase
          .from('schedule_sessions')
          .update({
            has_conflict: true,
            conflict_reason: conflictReason,
            status: 'needs_attention'
          })
          .eq('id', session.id);

        if (error) {
          failed++;
          console.error(`Error marking session as conflicted:`, error);
        } else {
          marked++;
        }
      } catch (error) {
        failed++;
        console.error(`Error marking session as conflicted:`, error);
      }
    }

    return { marked, failed };
  }

  private hasTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const timeToMinutes = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const start1Min = timeToMinutes(start1);
    const end1Min = timeToMinutes(end1);
    const start2Min = timeToMinutes(start2);
    const end2Min = timeToMinutes(end2);

    return !(end1Min <= start2Min || start1Min >= end2Min);
  }

  /**
   * Check if a student has sessions with other providers at the same time
   */
  async checkCrossProviderConflicts(
    studentId: string,
    schoolSite: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeSessionId?: string
  ): Promise<{ hasConflict: boolean; conflictDetails?: string }> {
    try {
      // Get all sessions for this student from ALL providers at this school
      const { data: otherSessions } = await this.supabase
        .from('schedule_sessions')
        .select(`
          *,
          profiles!provider_id (
            full_name,
            role
          )
        `)
        .eq('student_id', studentId)
        .eq('day_of_week', dayOfWeek)
        .neq('provider_id', this.providerId);

      if (!otherSessions || otherSessions.length === 0) {
        return { hasConflict: false };
      }

      // Check for time overlaps
      for (const session of otherSessions) {
        if (excludeSessionId && session.id === excludeSessionId) continue;

        if (this.hasTimeOverlap(
          startTime,
          endTime,
          session.start_time,
          session.end_time
        )) {
          const providerInfo = session.profiles;
          const roleDisplay = this.getRoleDisplayName(providerInfo.role);

          return {
            hasConflict: true,
            conflictDetails: `Student has ${session.service_type} with ${providerInfo.full_name} (${roleDisplay}) at this time`
          };
        }
      }

      return { hasConflict: false };
    } catch (error) {
      console.error('Error checking cross-provider conflicts:', error);
      return { hasConflict: false };
    }
  }

  private getRoleDisplayName(role: string): string {
    const roleMap: { [key: string]: string } = {
      resource: "Resource Specialist",
      speech: "Speech Therapist",
      ot: "Occupational Therapist",
      counseling: "Counselor",
      specialist: "Program Specialist",
    };
    return roleMap[role] || "Provider";
  }
}