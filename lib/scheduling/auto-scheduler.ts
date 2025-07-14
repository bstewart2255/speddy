import { createClient } from '@/lib/supabase/client';
import { Database } from '../../src/types/database';
import { getSchoolHours } from '../supabase/queries/school-hours';

/**
 * Utility class used to automatically generate schedule sessions for students.
 *
 * The scheduler creates 5 minute time slots between 8:00 AM and 2:30 PM and
 * iterates through them trying to place each required session. Every slot is
 * validated against bell schedules, special activities and existing sessions to
 * ensure there are no conflicts and that only one session occurs per student
 * each day.
 */

type Student = Database['public']['Tables']['students']['Row'];
type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type ScheduleSessionInsert = Database['public']['Tables']['schedule_sessions']['Insert'];

interface ScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface SchedulingResult {
  success: boolean;
  scheduledSessions: ScheduleSessionInsert[];
  unscheduledStudents: Student[];
  errors: string[];
}

export class AutoScheduler {
  private supabase;
  private providerId: string;
  private providerRole: string;
  private schoolHours: Array<{  // Add this
    day_of_week: number;
    grade_level: string;
    start_time: string;
    end_time: string;
  }> = [];

  constructor(providerId: string, providerRole: string) {
    this.supabase = createClient();
    this.providerId = providerId;
    this.providerRole = providerRole;
  }

  /**
   * Get school hours for a specific grade and day
   */
  private getSchoolHoursForGrade(day: number, grade: string): { start: string; end: string } {
    const hours = this.schoolHours.find(h => 
      h.day_of_week === day && 
      (h.grade_level === grade || (h.grade_level === 'default' && !['TK', 'K'].includes(grade)))
    );

    if (!hours) {
      return { start: '08:00', end: '15:00' }; // Default fallback
    }

    return {
      start: hours.start_time.substring(0, 5),
      end: hours.end_time.substring(0, 5)
    };
  }

  /**
   * Attempts to schedule all required sessions for a single student.
   *
   * The method first calls {@link findAvailableSlots} to collect candidate time
   * slots and then creates `schedule_sessions` rows for each valid slot until
   * the student's weekly requirement is met.
   */
    async scheduleStudent(student: Student): Promise<SchedulingResult> {
      // Fetch school hours if not already loaded
      if (this.schoolHours.length === 0 && student.school_site) {
        const hours = await getSchoolHours(student.school_site);
        this.schoolHours = hours;
      }

      const result: SchedulingResult = {
        success: false,
        scheduledSessions: [],
        unscheduledStudents: [],
        errors: []
      };

      try {
        // Get current data
        const [bellSchedules, specialActivities, existingSessions] = await Promise.all([
          this.getBellSchedules(),
          this.getSpecialActivities(),
          this.getExistingSessions()
        ]);

        const sessionsNeeded = student.sessions_per_week;
        const sessionDuration = student.minutes_per_session;

        // Find the best slots for this student
        const availableSlots = await this.findAvailableSlots(
          student,
          sessionDuration,
          sessionsNeeded,
          existingSessions,
          bellSchedules,
          specialActivities
        );

        if (availableSlots.length < sessionsNeeded) {
          result.unscheduledStudents.push(student);
          result.errors.push(`Could only find ${availableSlots.length} of ${sessionsNeeded} required slots for ${student.initials}`);
        }

        // Create session objects for the available slots
        for (let i = 0; i < Math.min(availableSlots.length, sessionsNeeded); i++) {
          const slot = availableSlots[i];
          result.scheduledSessions.push({
            student_id: student.id,
            provider_id: this.providerId,
            day_of_week: slot.dayOfWeek,
            start_time: slot.startTime,
            end_time: slot.endTime,
            service_type: this.providerRole,
            assigned_to_sea_id: this.providerRole === "sea" ? this.providerId : null,
            delivered_by: this.providerRole === "sea" ? "sea" : "provider",
            completed_at: null,
            completed_by: null,
            session_notes: null,
            session_date: null
          });
        }

        console.log(`Created ${result.scheduledSessions.length} sessions for ${student.initials}`);

        result.success = result.scheduledSessions.length === sessionsNeeded;
      } catch (error: any) {
        result.errors.push(`Error scheduling ${student.initials}: ${error.message}`);
      }

      return result;
    }

    /**
     * Helper methods to fetch data
     */
    private async getBellSchedules(): Promise<BellSchedule[]> {
      const { data } = await this.supabase
        .from('bell_schedules')
        .select('*')
        .eq('provider_id', this.providerId);
      return data || [];
    }

    private async getSpecialActivities(): Promise<SpecialActivity[]> {
      const { data } = await this.supabase
        .from('special_activities')
        .select('*')
        .eq('provider_id', this.providerId);
      return data || [];
    }

    private async getExistingSessions(): Promise<ScheduleSession[]> {
      const { data } = await this.supabase
        .from('schedule_sessions')
        .select('*')
        .eq('provider_id', this.providerId);
      return data || [];
    }

  /**
   * Check if provider is available at a specific school on a given day
   */
  private async isProviderAvailableAt(
    dayOfWeek: number,
    schoolSite: string
  ): Promise<boolean> {
    // Get provider's site schedules
    const { data: siteSchedules, error } = await this.supabase
      .from('user_site_schedules')
      .select(`
        day_of_week,
        provider_schools!inner(
          school_site,
          school_district
        )
      `)
      .eq('user_id', this.providerId)
      .eq('day_of_week', dayOfWeek);

    if (error) {
      console.error('Error checking provider availability:', error);
      return false;
    }

    // If no schedules defined, check if any schedules exist for this provider
    const { data: anySchedules } = await this.supabase
      .from('user_site_schedules')
      .select('id')
      .eq('user_id', this.providerId)
      .limit(1);

    // If provider has defined any schedules, they must have one for this day/site
    if (anySchedules && anySchedules.length > 0) {
      // Check if provider is scheduled at this specific school on this day
      return siteSchedules?.some(schedule => 
        schedule.provider_schools.school_site === schoolSite
      ) || false;
    }

    // Only allow backwards compatibility if no schedules are defined at all
    return true;
  }

  /**
   * Generates a set of potential schedule slots for a student.
   *
   * This method iterates over each weekday and possible start time produced by
   * {@link generateTimeSlots}. Slots are validated using
   * {@link validateSlot} and returned in the order they are found.
   */
  private async findAvailableSlots(
    student: Student,
    duration: number,
    slotsNeeded: number,
    existingSessions: ScheduleSession[],
    bellSchedules: BellSchedule[],
    specialActivities: SpecialActivity[]
  ): Promise<ScheduleSlot[]> {
    console.log(`Finding ${slotsNeeded} slots of ${duration} minutes for student ${student.initials}`);

    const availableSlots: ScheduleSlot[] = [];
    const days = [1, 2, 3, 4, 5]; // Monday through Friday
    const timeSlots = this.generateTimeSlots();
    const scheduledForThisStudent: ScheduleSlot[] = [];

    // Try to distribute sessions across days evenly
    const sessionsByDay = this.countSessionsByDay(existingSessions);
    const sortedDays = days.sort((a, b) => (sessionsByDay[a] || 0) - (sessionsByDay[b] || 0));

    // NEW: Rotate through different starting times to distribute throughout the day
    let timeSlotStartIndex = existingSessions.length % timeSlots.length;

    // Simple single pass - one session per day rule makes this much simpler
    for (const day of sortedDays) {
      if (availableSlots.length >= slotsNeeded) break;

      // Check if we already scheduled this student today
      const alreadyScheduledToday = scheduledForThisStudent.some(slot => slot.dayOfWeek === day);
      if (alreadyScheduledToday) {
        console.log(`Already scheduled on day ${day}, skipping`);
        continue;
      }

      // Start from different time slots to distribute throughout the day
      for (let i = 0; i < timeSlots.length; i++) {
        const timeIndex = (timeSlotStartIndex + i) % timeSlots.length;
        const startTime = timeSlots[timeIndex];
        const endTime = this.addMinutesToTime(startTime, duration);

        // Check if this slot is valid
        const validation = await this.validateSlot(
          student,
          day,
          startTime,
          endTime,
          duration,
          existingSessions,
          bellSchedules,
          specialActivities,
          scheduledForThisStudent
        );

        if (validation.valid) {
          const newSlot = {
            dayOfWeek: day,
            startTime,
            endTime
          };
          availableSlots.push(newSlot);
          scheduledForThisStudent.push(newSlot);
          console.log(`Found valid slot: Day ${day}, ${startTime}-${endTime}`);
          break; // Move to next day after finding one slot
        } else {
          console.log(`Invalid slot: Day ${day}, ${startTime}-${endTime} - Reason: ${validation.reason}`);
        }
      }
    }

    if (availableSlots.length < slotsNeeded) {
      console.log(`Only found ${availableSlots.length} of ${slotsNeeded} required slots`);
    }

    return availableSlots;
  }

  // Utility functions

  /**
   * Returns a list of start times from 8:00 AM to 2:30 PM in 5 minute
   * increments. These serve as the potential beginning of a session.
   */
  private generateTimeSlots(): string[] {
    const slots: string[] = [];
    // Generate slots every 5 minutes for maximum flexibility
    for (let hour = 8; hour <= 14; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        // Don't go past 2:30 PM to leave buffer before 3 PM
        if (hour === 14 && minute > 30) break;
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }

  /** Converts a HH:MM string into minutes since midnight. */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /** Adds minutes to a time string and returns a HH:MM:SS value. */
  private addMinutesToTime(time: string, minutesToAdd: number): string {
    const totalMinutes = this.timeToMinutes(time) + minutesToAdd;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  }

  /**
   * Checks if two time ranges overlap.
   */
  private hasTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const start1Min = this.timeToMinutes(start1);
    const end1Min = this.timeToMinutes(end1);
    const start2Min = this.timeToMinutes(start2);
    const end2Min = this.timeToMinutes(end2);

    return !(end1Min <= start2Min || start1Min >= end2Min);
  }

  /** Returns a map of day_of_week to count of sessions. */
  private countSessionsByDay(sessions: ScheduleSession[]): Record<number, number> {
    const counts: Record<number, number> = {};
    sessions.forEach(session => {
      counts[session.day_of_week] = (counts[session.day_of_week] || 0) + 1;
    });
    return counts;
  }

  /**
   * Checks if a potential slot violates any scheduling rules.
   *
   * Validates against bell schedules, teacher activities, existing sessions,
   * the one-session-per-day rule and slot capacity. Returns a flag and optional
   * reason when the slot is invalid.
   */
  private async validateSlot(
    student: Student,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    duration: number,
    existingSessions: ScheduleSession[],
    bellSchedules: BellSchedule[],
    specialActivities: SpecialActivity[],
    scheduledForThisStudent: ScheduleSlot[] = []
  ): Promise<{ valid: boolean; reason?: string }> {
    console.log(`Validating slot for ${student.initials}: Day ${dayOfWeek}, ${startTime}-${endTime} (${duration} min)`);

    // Check provider availability at student's school
    if (!student.school_site) {
      return { 
        valid: false, 
        reason: 'Student has no school site assigned' 
      };
    }

    const isAvailable = await this.isProviderAvailableAt(
      dayOfWeek, 
      student.school_site
    );

    if (!isAvailable) {
      return { 
        valid: false, 
        reason: `Not scheduled at ${student.school_site} on this day` 
      };
    }

    // Check if session fits within school hours for this grade
    const schoolHours = this.getSchoolHoursForGrade(dayOfWeek, student.grade_level.trim());
    const schoolStartMinutes = this.timeToMinutes(schoolHours.start);
    const schoolEndMinutes = this.timeToMinutes(schoolHours.end);
    const sessionStartMinutes = this.timeToMinutes(startTime);
    const sessionEndMinutes = this.timeToMinutes(endTime);

    if (sessionStartMinutes < schoolStartMinutes || sessionEndMinutes > schoolEndMinutes) {
      return { 
        valid: false, 
        reason: `Outside school hours (${schoolHours.start} - ${schoolHours.end})` 
      };
    }

    // Check bell schedule conflicts
    const bellConflicts = bellSchedules.filter(bell => {
      const grades = bell.grade_level.split(',').map(g => g.trim());
      return grades.includes(student.grade_level.trim()) &&
             bell.day_of_week === dayOfWeek &&
             this.hasTimeOverlap(startTime, endTime, bell.start_time, bell.end_time);
    });

    if (bellConflicts.length > 0) {
      return { valid: false, reason: `Conflicts with ${bellConflicts[0].period_name}` };
    }

    // Check special activity conflicts
    const activityConflicts = specialActivities.filter(activity =>
      activity.teacher_name === student.teacher_name &&
      activity.day_of_week === dayOfWeek &&
      this.hasTimeOverlap(startTime, endTime, activity.start_time, activity.end_time)
    );

    if (activityConflicts.length > 0) {
      return { valid: false, reason: `Teacher has ${activityConflicts[0].activity_name}` };
    }

    // Check for same student conflicts
    const studentConflicts = existingSessions.filter(session =>
      session.student_id === student.id &&
      session.day_of_week === dayOfWeek &&
      this.hasTimeOverlap(startTime, endTime, session.start_time, session.end_time)
    );

    if (studentConflicts.length > 0) {
      return { valid: false, reason: 'Student already has a session at this time' };
    }

    // NEW: One session per day rule
    const alreadyScheduledToday = [
      ...existingSessions.filter(s => s.student_id === student.id && s.day_of_week === dayOfWeek),
      ...scheduledForThisStudent.filter(s => s.dayOfWeek === dayOfWeek)
    ].length > 0;

    if (alreadyScheduledToday) {
      return { valid: false, reason: 'Student already scheduled today (one session per day rule)' };
    }

    // Check slot capacity (max 4 for auto-scheduling)
    const slotOccupancy = existingSessions.filter(session =>
      session.day_of_week === dayOfWeek &&
      session.student_id !== student.id &&
      this.hasTimeOverlap(startTime, endTime, session.start_time, session.end_time)
    ).length;

    if (slotOccupancy >= 4) {
      return { valid: false, reason: 'Time slot full' };
    }

    return { valid: true };
  }
}