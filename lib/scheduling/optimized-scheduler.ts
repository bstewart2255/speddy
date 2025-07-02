import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../src/types/database';

type Student = Database['public']['Tables']['students']['Row'];
type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];

interface TimeSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  available: boolean;
  capacity: number;
  conflicts: string[];
}

interface SchedulingContext {
  schoolSite: string;
  workDays: number[];
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  existingSessions: ScheduleSession[];
  validSlots: Map<string, TimeSlot>; // key: "day-startTime"
}

interface SchedulingResult {
  success: boolean;
  scheduledSessions: Omit<ScheduleSession, 'id' | 'created_at' | 'updated_at'>[];
  unscheduledStudents: Student[];
  errors: string[];
}

export class OptimizedScheduler {
  private supabase = createClientComponentClient<Database>();
  private context: SchedulingContext | null = null;

  constructor(
    private providerId: string,
    private providerRole: string
  ) {}

  /**
   * Pre-compute all valid time slots for the school
   * This runs ONCE per scheduling session, not per student
   */
  async initializeContext(schoolSite: string): Promise<SchedulingContext> {
    console.log(`Initializing scheduling context for ${schoolSite}...`);

    // 1. Get work days for this school
    const { data: workSchedule } = await this.supabase
      .from('user_site_schedules')
      .select(`
        day_of_week,
        provider_schools!inner(
          school_site
        )
      `)
      .eq('user_id', this.providerId)
      .eq('provider_schools.school_site', schoolSite);

    const workDays = workSchedule?.map(s => s.day_of_week) || [];

    // If no work schedule defined, assume all weekdays (backwards compatibility)
    if (workDays.length === 0) {
      const { data: anySchedule } = await this.supabase
        .from('user_site_schedules')
        .select('id')
        .eq('user_id', this.providerId)
        .limit(1);

      if (!anySchedule || anySchedule.length === 0) {
        workDays.push(1, 2, 3, 4, 5);
      }
    }

    console.log(`Work days at ${schoolSite}: ${workDays.join(', ')}`);

    // 2. Get all bell schedules and special activities
    const [bellData, activitiesData, sessionsData] = await Promise.all([
      this.supabase
        .from('bell_schedules')
        .select('*')
        .eq('provider_id', this.providerId)
        .eq('school_site', schoolSite),
      this.supabase
        .from('special_activities')
        .select('*')
        .eq('provider_id', this.providerId)
        .eq('school_site', schoolSite),
      this.supabase
        .from('schedule_sessions')
        .select('*')
        .eq('provider_id', this.providerId)
    ]);

    const context: SchedulingContext = {
      schoolSite,
      workDays,
      bellSchedules: bellData.data || [],
      specialActivities: activitiesData.data || [],
      existingSessions: sessionsData.data || [],
      validSlots: new Map()
    };

    // 3. Pre-compute all valid time slots
    this.buildValidSlotsMap(context);

    this.context = context;
    return context;
  }

  /**
   * Build a map of all possible time slots and their availability
   */
  private buildValidSlotsMap(context: SchedulingContext) {
    console.log('Building valid slots map...');

    const timeSlots = this.generateTimeSlots();
    let totalSlots = 0;
    let validSlots = 0;

    // Only check days when provider works at this school
    for (const day of context.workDays) {
      for (const startTime of timeSlots) {
        totalSlots++;
        const slot: TimeSlot = {
          dayOfWeek: day,
          startTime,
          endTime: '', // Will be set based on session duration
          available: true,
          capacity: 4, // Max students per slot
          conflicts: []
        };

        // Check existing sessions to determine current capacity
        const overlappingSessions = context.existingSessions.filter(session => 
          session.day_of_week === day &&
          this.timesOverlap(startTime, session.start_time, session.end_time)
        );

        slot.capacity -= overlappingSessions.length;

        if (slot.capacity > 0) {
          validSlots++;
          context.validSlots.set(`${day}-${startTime}`, slot);
        }
      }
    }

    console.log(`Valid slots: ${validSlots}/${totalSlots} (${Math.round(validSlots/totalSlots*100)}% available)`);
  }

  /**
   * Schedule multiple students efficiently
   */
  async scheduleBatch(students: Student[]): Promise<{
    totalScheduled: number;
    totalFailed: number;
    errors: string[];
  }> {
    if (!this.context) {
      throw new Error('Context not initialized. Call initializeContext first.');
    }

    console.log(`\nScheduling ${students.length} students at ${this.context.schoolSite}`);
    console.log(`Available days: ${this.context.workDays.join(', ')}`);

    const results = {
      totalScheduled: 0,
      totalFailed: 0,
      errors: [] as string[]
    };

    // Sort students by sessions needed (descending) to handle harder cases first
    const sortedStudents = [...students].sort((a, b) => 
      b.sessions_per_week - a.sessions_per_week
    );

    const allScheduledSessions: Omit<ScheduleSession, 'id' | 'created_at' | 'updated_at'>[] = [];

    for (const student of sortedStudents) {
      console.log(`\nScheduling ${student.initials}: ${student.sessions_per_week} sessions x ${student.minutes_per_session}min`);

      const result = this.scheduleStudent(student);

      if (result.success) {
        results.totalScheduled++;
        allScheduledSessions.push(...result.scheduledSessions);

        // Update context with newly scheduled sessions
        this.updateContextWithSessions(result.scheduledSessions);
      } else {
        results.totalFailed++;
        results.errors.push(...result.errors);
      }
    }

    // Save all sessions at once
    if (allScheduledSessions.length > 0) {
      const { error } = await this.supabase
        .from('schedule_sessions')
        .insert(allScheduledSessions);

      if (error) {
        results.errors.push(`Failed to save sessions: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Schedule a single student using pre-computed valid slots
   */
  private scheduleStudent(student: Student): SchedulingResult {
    const result: SchedulingResult = {
      success: false,
      scheduledSessions: [],
      unscheduledStudents: [],
      errors: []
    };

    const sessionsNeeded = student.sessions_per_week;
    const duration = student.minutes_per_session;

    // Find available slots for this student
    const availableSlots = this.findStudentSlots(student, duration, sessionsNeeded);

    if (availableSlots.length < sessionsNeeded) {
      result.unscheduledStudents.push(student);
      result.errors.push(
        `${student.initials}: Only found ${availableSlots.length} of ${sessionsNeeded} required slots`
      );
    }

    // Create sessions for available slots
    for (let i = 0; i < Math.min(availableSlots.length, sessionsNeeded); i++) {
      const slot = availableSlots[i];
      result.scheduledSessions.push({
        student_id: student.id,
        provider_id: this.providerId,
        day_of_week: slot.dayOfWeek,
        start_time: slot.startTime,
        end_time: slot.endTime,
        service_type: this.providerRole,
        assigned_to_sea_id: this.providerRole === 'sea' ? this.providerId : null,
        delivered_by: this.providerRole === 'sea' ? 'sea' : 'provider'
      });
    }

    result.success = result.scheduledSessions.length === sessionsNeeded;
    console.log(`Scheduled ${result.scheduledSessions.length}/${sessionsNeeded} sessions for ${student.initials}`);

    return result;
  }

  /**
   * Find available slots for a specific student
   */
  private findStudentSlots(
    student: Student,
    duration: number,
    slotsNeeded: number
  ): TimeSlot[] {
    const foundSlots: TimeSlot[] = [];
    const scheduledDays = new Set<number>();

    // Sort days to distribute sessions evenly
    const sortedDays = [...this.context!.workDays].sort((a, b) => {
      const aCount = this.context!.existingSessions.filter(s => s.day_of_week === a).length;
      const bCount = this.context!.existingSessions.filter(s => s.day_of_week === b).length;
      return aCount - bCount;
    });

    // Try to find slots
    for (const day of sortedDays) {
      if (foundSlots.length >= slotsNeeded) break;
      if (scheduledDays.has(day)) continue; // One session per day rule

      // Get all valid slots for this day
      const daySlots = Array.from(this.context!.validSlots.entries())
        .filter(([key, slot]) => slot.dayOfWeek === day && slot.capacity > 0)
        .map(([key, slot]) => ({ key, ...slot }));

      // Check each slot for student-specific constraints
      for (const slotInfo of daySlots) {
        const slot = slotInfo;
        const endTime = this.addMinutesToTime(slot.startTime, duration);

        // Check bell schedule conflicts for this student's grade
        const hasBellConflict = this.context!.bellSchedules.some(bell => {
          const grades = bell.grade_level.split(',').map(g => g.trim());
          return grades.includes(student.grade_level.trim()) &&
                 bell.day_of_week === day &&
                 this.hasTimeOverlap(slot.startTime, endTime, bell.start_time, bell.end_time);
        });

        if (hasBellConflict) continue;

        // Check special activities for this student's teacher
        const hasActivityConflict = this.context!.specialActivities.some(activity =>
          activity.teacher_name === student.teacher_name &&
          activity.day_of_week === day &&
          this.hasTimeOverlap(slot.startTime, endTime, activity.start_time, activity.end_time)
        );

        if (hasActivityConflict) continue;

        // Check if session extends beyond school hours
        if (this.timeToMinutes(endTime) > this.timeToMinutes('15:00')) continue;

        // Valid slot found!
        foundSlots.push({
          ...slot,
          endTime
        });
        scheduledDays.add(day);
        break; // Move to next day
      }
    }

    return foundSlots;
  }

  /**
   * Update context after scheduling sessions
   */
  private updateContextWithSessions(
    sessions: Omit<ScheduleSession, 'id' | 'created_at' | 'updated_at'>[]
  ) {
    for (const session of sessions) {
      const key = `${session.day_of_week}-${session.start_time}`;
      const slot = this.context!.validSlots.get(key);
      if (slot) {
        slot.capacity--;
        if (slot.capacity <= 0) {
          this.context!.validSlots.delete(key);
        }
      }
    }
  }

  // Utility methods
  private generateTimeSlots(): string[] {
    const slots: string[] = [];
    for (let hour = 8; hour <= 14; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        if (hour === 14 && minute > 30) break;
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

  private timesOverlap(time: string, sessionStart: string, sessionEnd: string): boolean {
    const timeMin = this.timeToMinutes(time);
    const startMin = this.timeToMinutes(sessionStart);
    const endMin = this.timeToMinutes(sessionEnd);
    return timeMin >= startMin && timeMin < endMin;
  }
}