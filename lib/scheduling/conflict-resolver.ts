import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../src/types/database';
import { AutoScheduler } from './auto-scheduler';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
type Student = Database['public']['Tables']['students']['Row'];

export class ConflictResolver {
  private supabase;
  private providerId: string;

  constructor(providerId: string) {
    this.supabase = createClientComponentClient<Database>();
    this.providerId = providerId;
  }

  // Check and resolve conflicts after bell schedule changes
  async resolveBellScheduleConflicts(newBellSchedule: BellSchedule) {
    try {
      // Find all sessions that conflict with the new bell schedule
      const { data: allSessions } = await this.supabase
        .from('schedule_sessions')
        .select('*, students!inner(*)')
        .eq('provider_id', this.providerId);

      if (!allSessions) return { resolved: 0, failed: 0 };

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

      return await this.rescheduleConflictingSessions(conflictingSessions);
    } catch (error) {
      console.error('Error resolving bell schedule conflicts:', error);
      return { resolved: 0, failed: 0, error: error.message };
    }
  }

  // Check and resolve conflicts after special activity changes
  async resolveSpecialActivityConflicts(newActivity: SpecialActivity) {
    try {
      // Find all sessions that conflict with the new special activity
      const { data: allSessions } = await this.supabase
        .from('schedule_sessions')
        .select('*, students!inner(*)')
        .eq('provider_id', this.providerId);

      if (!allSessions) return { resolved: 0, failed: 0 };

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

      return await this.rescheduleConflictingSessions(conflictingSessions);
    } catch (error) {
      console.error('Error resolving special activity conflicts:', error);
      return { resolved: 0, failed: 0, error: error.message };
    }
  }

  // Reschedule conflicting sessions
  private async rescheduleConflictingSessions(conflictingSessions: any[]) {
    let resolved = 0;
    let failed = 0;

    // Get provider role
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('role')
      .eq('id', this.providerId)
      .single();

    if (!profile) throw new Error('Profile not found');

    const scheduler = new AutoScheduler(this.providerId, profile.role);

    for (const session of conflictingSessions) {
      try {
        // Delete the conflicting session
        await this.supabase
          .from('schedule_sessions')
          .delete()
          .eq('id', session.id);

        // Try to reschedule using the AutoScheduler which handles all the complexity
        const student = session.students;
        const result = await scheduler.scheduleStudent(student);

        if (result.scheduledSessions.length > 0) {
          // Save the new session
          await this.supabase
            .from('schedule_sessions')
            .insert(result.scheduledSessions[0]);
          resolved++;
        } else {
          failed++;
          console.warn(`Could not reschedule session for ${student.initials}`);
        }
      } catch (error) {
        failed++;
        console.error(`Error rescheduling session:`, error);
      }
    }

    return { resolved, failed };
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