import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../src/types/database';

type Student = Database['public']['Tables']['students']['Row'];
type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

interface ScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface SchedulingResult {
  success: boolean;
  scheduledSessions: Omit<ScheduleSession, 'id' | 'created_at'>[];
  unscheduledStudents: Student[];
  errors: string[];
}

export class AutoScheduler {
  private supabase;
  private providerId: string;
  private providerRole: string;

  constructor(providerId: string, providerRole: string) {
    this.supabase = createClientComponentClient<Database>();
    this.providerId = providerId;
    this.providerRole = providerRole;
  }

  // Main scheduling function for a single student
  async scheduleStudent(
    student: Student,
    existingSessions: ScheduleSession[],
    bellSchedules: BellSchedule[],
    specialActivities: SpecialActivity[]
  ): Promise<SchedulingResult> {
    const result: SchedulingResult = {
      success: false,
      scheduledSessions: [],
      unscheduledStudents: [],
      errors: []
    };

    try {
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
          service_type: this.providerRole
        });
      }

      result.success = result.scheduledSessions.length === sessionsNeeded;
    } catch (error) {
      result.errors.push(`Error scheduling ${student.initials}: ${error.message}`);
    }

    return result;
  }

  // Find available time slots for a student
  private async findAvailableSlots(
    student: Student,
    duration: number,
    slotsNeeded: number,
    existingSessions: ScheduleSession[],
    bellSchedules: BellSchedule[],
    specialActivities: SpecialActivity[]
  ): Promise<ScheduleSlot[]> {
    const availableSlots: ScheduleSlot[] = [];
    const days = [1, 2, 3, 4, 5]; // Monday through Friday
    const timeSlots = this.generateTimeSlots(); // 8:00 AM to 3:00 PM in 30-min increments

    // Try to distribute sessions across days evenly
    const sessionsByDay = this.countSessionsByDay(existingSessions);
    const sortedDays = days.sort((a, b) => (sessionsByDay[a] || 0) - (sessionsByDay[b] || 0));

    for (const day of sortedDays) {
      for (const startTime of timeSlots) {
        if (availableSlots.length >= slotsNeeded) break;

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
          specialActivities
        );

        if (validation.valid) {
          availableSlots.push({
            dayOfWeek: day,
            startTime,
            endTime
          });
        }
      }
    }

    return availableSlots;
  }

  // Validate if a time slot is available
  private async validateSlot(
    student: Student,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    duration: number,
    existingSessions: ScheduleSession[],
    bellSchedules: BellSchedule[],
    specialActivities: SpecialActivity[]
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check if session fits within school hours (before 3:00 PM)
    if (this.timeToMinutes(endTime) > this.timeToMinutes('15:00')) {
      return { valid: false, reason: 'Extends beyond school hours' };
    }

    // Check bell schedule conflicts
    const bellConflicts = bellSchedules.filter(bell => {
      const grades = bell.grade_level.split(',').map(g => g.trim());
      return grades.includes(student.grade_level) &&
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
      return { valid: false, reason: 'Student already scheduled' };
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

    // Check daily limits (120 minutes max)
    const dailyMinutes = existingSessions
      .filter(s => s.day_of_week === dayOfWeek && s.student_id === student.id)
      .reduce((total, s) => {
        const sessionDuration = this.timeToMinutes(s.end_time) - this.timeToMinutes(s.start_time);
        return total + sessionDuration;
      }, 0);

    if (dailyMinutes + duration > 120) {
      return { valid: false, reason: 'Exceeds daily limit' };
    }

    // Check consecutive minutes limit (60 max)
    const consecutiveCheck = this.checkConsecutiveLimit(
      student.id,
      dayOfWeek,
      startTime,
      duration,
      existingSessions
    );

    if (!consecutiveCheck) {
      return { valid: false, reason: 'Exceeds consecutive minutes limit' };
    }

    return { valid: true };
  }

  // Utility functions
  private generateTimeSlots(): string[] {
    const slots: string[] = [];
    for (let hour = 8; hour <= 14; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === 14 && minute > 30) break; // Stop at 2:30 PM
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private addMinutesToTime(time: string, minutesToAdd: number): string {
    const totalMinutes = this.timeToMinutes(time) + minutesToAdd;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  }

  private hasTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const start1Min = this.timeToMinutes(start1);
    const end1Min = this.timeToMinutes(end1);
    const start2Min = this.timeToMinutes(start2);
    const end2Min = this.timeToMinutes(end2);

    return !(end1Min <= start2Min || start1Min >= end2Min);
  }

  private countSessionsByDay(sessions: ScheduleSession[]): Record<number, number> {
    const counts: Record<number, number> = {};
    sessions.forEach(session => {
      counts[session.day_of_week] = (counts[session.day_of_week] || 0) + 1;
    });
    return counts;
  }

  private checkConsecutiveLimit(
    studentId: string,
    day: number,
    startTime: string,
    duration: number,
    existingSessions: ScheduleSession[]
  ): boolean {
    const studentDaySessions = existingSessions.filter(
      s => s.student_id === studentId && s.day_of_week === day
    );

    const allSessions = [...studentDaySessions, {
      start_time: startTime,
      end_time: this.addMinutesToTime(startTime, duration)
    }];

    allSessions.sort((a, b) => this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time));

    for (let i = 0; i < allSessions.length; i++) {
      let consecutiveMinutes = this.timeToMinutes(allSessions[i].end_time) - this.timeToMinutes(allSessions[i].start_time);
      let currentEndTime = this.timeToMinutes(allSessions[i].end_time);

      for (let j = i + 1; j < allSessions.length; j++) {
        const nextStartTime = this.timeToMinutes(allSessions[j].start_time);

        if (nextStartTime === currentEndTime) {
          const sessionDuration = this.timeToMinutes(allSessions[j].end_time) - this.timeToMinutes(allSessions[j].start_time);
          consecutiveMinutes += sessionDuration;
          currentEndTime = this.timeToMinutes(allSessions[j].end_time);

          if (consecutiveMinutes > 60) {
            return false;
          }
        } else {
          break;
        }
      }
    }

    return true;
  }
}