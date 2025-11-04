import type {
  TimeSlot,
  SchedulingContext,
  AvailabilitySlot
} from './types/scheduling-types';
import type {
  Student,
  ScheduleSession,
  BellSchedule,
  SpecialActivity
} from './types/scheduling-data';
import type { ScheduledSession } from '../utils/session-helpers';
import type { 
  ValidationResult, 
  ValidationError, 
  ConstraintType,
  ValidationContext 
} from './types/validation-result';

export class ConstraintValidator {
  private performanceMetrics = {
    validationCount: 0,
    cacheHits: 0,
    totalValidationTime: 0
  };

  /**
   * Validate all constraints for a given time slot and student
   */
  validateAllConstraints(
    slot: TimeSlot,
    student: Student,
    context: SchedulingContext
  ): ValidationResult {
    const startTime = performance.now();
    const errors: ValidationError[] = [];
    const checkedConstraints: string[] = [];

    // Create validation context
    const validationContext: ValidationContext = {
      providerId: '', // Will be passed from coordinator
      schoolSite: context.schoolSite,
      day: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime
    };

    // Check school hours first (most likely to fail)
    const schoolHoursResult = this.validateSchoolHours(
      slot,
      student,
      context.schoolHours
    );
    checkedConstraints.push('school_hours');
    if (!schoolHoursResult.isValid) {
      errors.push(...schoolHoursResult.errors);
    }

    // Check bell schedule conflicts
    const bellResult = this.validateBellScheduleConflicts(
      slot,
      student,
      context.bellSchedulesByGrade
    );
    checkedConstraints.push('bell_schedule');
    if (!bellResult.isValid) {
      errors.push(...bellResult.errors);
    }

    // Check special activity conflicts
    const activityResult = this.validateSpecialActivityConflicts(
      slot,
      student,
      context.specialActivitiesByTeacher
    );
    checkedConstraints.push('special_activity');
    if (!activityResult.isValid) {
      errors.push(...activityResult.errors);
    }

    // Check concurrent session limits
    const concurrentResult = this.validateConcurrentSessionLimits(
      slot,
      context.existingSessions,
      8 // Default max concurrent sessions
    );
    checkedConstraints.push('concurrent_sessions');
    if (!concurrentResult.isValid) {
      errors.push(...concurrentResult.errors);
    }

    // Check consecutive session limits
    const consecutiveResult = this.validateConsecutiveSessionLimits(
      slot,
      context.existingSessions.filter(s => s.student_id === student.id),
      student
    );
    checkedConstraints.push('consecutive_sessions');
    if (!consecutiveResult.isValid) {
      errors.push(...consecutiveResult.errors);
    }

    // Check break requirements
    const breakResult = this.validateBreakRequirements(
      slot,
      context.existingSessions.filter(s => s.student_id === student.id),
      student
    );
    checkedConstraints.push('break_requirement');
    if (!breakResult.isValid) {
      errors.push(...breakResult.errors);
    }

    const executionTime = performance.now() - startTime;
    this.performanceMetrics.validationCount++;
    this.performanceMetrics.totalValidationTime += executionTime;

    return {
      isValid: errors.length === 0,
      errors,
      metadata: {
        checkedConstraints,
        executionTime
      }
    };
  }

  /**
   * Validate work location constraints
   */
  validateWorkLocationConstraints(
    slot: TimeSlot,
    student: Student,
    providerAvailability: Map<string, Map<number, AvailabilitySlot[]>>
  ): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Check if provider works at this location on this day
    const availabilityKey = `provider-${student.school_site}`;
    const dayAvailability = providerAvailability.get(availabilityKey)?.get(slot.dayOfWeek);
    
    if (!dayAvailability || dayAvailability.length === 0) {
      errors.push({
        type: 'work_location',
        message: `Provider does not work at ${student.school_site} on day ${slot.dayOfWeek}`,
        severity: 'error'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate consecutive session limits (max 60 minutes without break)
   */
  validateConsecutiveSessionLimits(
    slot: TimeSlot,
    existingSessions: ScheduledSession[],
    student: Student
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const maxConsecutiveMinutes = 60;

    // Get all sessions for this student on this day
    const studentDaySessions = existingSessions
      .filter(s => s.day_of_week === slot.dayOfWeek)
      .map(s => ({
        startMinutes: this.timeToMinutes(s.start_time),
        endMinutes: this.timeToMinutes(s.end_time)
      }));

    // Add the proposed slot
    const newSession = {
      startMinutes: this.timeToMinutes(slot.startTime),
      endMinutes: this.timeToMinutes(slot.endTime)
    };
    
    const allSessions = [...studentDaySessions, newSession].sort(
      (a, b) => a.startMinutes - b.startMinutes
    );

    // Check for consecutive blocks exceeding limit
    let currentBlockDuration = 0;
    let lastEndTime = -1;

    for (const session of allSessions) {
      if (lastEndTime === session.startMinutes) {
        // Consecutive session
        currentBlockDuration += (session.endMinutes - session.startMinutes);
      } else {
        // New block
        currentBlockDuration = session.endMinutes - session.startMinutes;
      }

      if (currentBlockDuration > maxConsecutiveMinutes) {
        errors.push({
          type: 'consecutive_sessions',
          message: `Consecutive sessions exceed ${maxConsecutiveMinutes} minutes limit`,
          severity: 'error',
          details: {
            timeRange: {
              start: this.minutesToTime(session.startMinutes - currentBlockDuration + (session.endMinutes - session.startMinutes)),
              end: this.minutesToTime(session.endMinutes)
            },
            suggestion: 'Add a break between sessions'
          }
        });
        break;
      }

      lastEndTime = session.endMinutes;
    }

    this.performanceMetrics.cacheHits++;
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate break requirements (30-minute break between non-consecutive sessions)
   */
  validateBreakRequirements(
    slot: TimeSlot,
    existingSessions: ScheduledSession[],
    student: Student
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const minBreakMinutes = 30;

    // Get all sessions for this student on this day
    const studentDaySessions = existingSessions
      .filter(s => s.day_of_week === slot.dayOfWeek)
      .map(s => ({
        startMinutes: this.timeToMinutes(s.start_time),
        endMinutes: this.timeToMinutes(s.end_time)
      }));

    // Add the proposed slot
    const newSession = {
      startMinutes: this.timeToMinutes(slot.startTime),
      endMinutes: this.timeToMinutes(slot.endTime)
    };
    
    const allSessions = [...studentDaySessions, newSession].sort(
      (a, b) => a.startMinutes - b.startMinutes
    );

    // Check gaps between non-consecutive sessions
    for (let i = 0; i < allSessions.length - 1; i++) {
      const current = allSessions[i];
      const next = allSessions[i + 1];
      
      const gap = next.startMinutes - current.endMinutes;
      
      if (gap > 0 && gap < minBreakMinutes) {
        errors.push({
          type: 'break_requirement',
          message: `Insufficient break time: ${gap} minutes (minimum ${minBreakMinutes} required)`,
          severity: 'error',
          details: {
            timeRange: {
              start: this.minutesToTime(current.endMinutes),
              end: this.minutesToTime(next.startMinutes)
            },
            suggestion: `Increase gap to at least ${minBreakMinutes} minutes`
          }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate bell schedule conflicts
   */
  validateBellScheduleConflicts(
    slot: TimeSlot,
    student: Student,
    bellSchedulesByGrade: Map<string, Map<number, BellSchedule[]>>
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const studentGrade = student.grade_level.trim();
    
    // Use cached index for O(1) lookup
    const gradeBellSchedules = bellSchedulesByGrade.get(studentGrade)?.get(slot.dayOfWeek) || [];
    
    for (const bell of gradeBellSchedules) {
      if (this.hasTimeOverlap(
        slot.startTime,
        slot.endTime,
        bell.start_time,
        bell.end_time
      )) {
        errors.push({
          type: 'bell_schedule',
          message: `Conflicts with ${bell.period_name} for grade ${studentGrade}`,
          severity: 'error',
          details: {
            conflictingItem: bell,
            timeRange: {
              start: bell.start_time,
              end: bell.end_time
            }
          }
        });
        this.performanceMetrics.cacheHits++;
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate special activity conflicts
   */
  validateSpecialActivityConflicts(
    slot: TimeSlot,
    student: Student,
    specialActivitiesByTeacher: Map<string, Map<number, SpecialActivity[]>>
  ): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Use cached index for O(1) lookup
    const teacherActivities = student.teacher_name 
      ? specialActivitiesByTeacher.get(student.teacher_name)?.get(slot.dayOfWeek) || []
      : [];
    
    for (const activity of teacherActivities) {
      if (this.hasTimeOverlap(
        slot.startTime,
        slot.endTime,
        activity.start_time,
        activity.end_time
      )) {
        errors.push({
          type: 'special_activity',
          message: `Conflicts with ${activity.activity_name} for teacher ${student.teacher_name}`,
          severity: 'error',
          details: {
            conflictingItem: activity,
            timeRange: {
              start: activity.start_time,
              end: activity.end_time
            }
          }
        });
        this.performanceMetrics.cacheHits++;
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate school hours
   */
  validateSchoolHours(
    slot: TimeSlot,
    student: Student,
    schoolHours: Array<{
      day_of_week: number;
      grade_level: string;
      start_time: string;
      end_time: string;
    }>
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const grade = student.grade_level.trim();
    
    // Handle K/TK AM/PM schedules
    let targetGrade = grade;
    if ((grade === 'K' || grade === 'TK') && slot.startTime) {
      const sessionHour = parseInt(slot.startTime.split(':')[0]);
      const isAM = sessionHour < 12;
      const amPmGrade = `${grade}-${isAM ? 'AM' : 'PM'}`;
      
      // Check for AM/PM specific schedule
      const hasAmPmSchedule = schoolHours.some(h => 
        h.day_of_week === slot.dayOfWeek && h.grade_level === amPmGrade
      );
      
      if (hasAmPmSchedule) {
        targetGrade = amPmGrade;
      }
    }
    
    // Find school hours for the grade and day
    const hours = schoolHours.find(h => 
      h.day_of_week === slot.dayOfWeek && 
      (h.grade_level === targetGrade || 
       (h.grade_level === 'default' && !['TK', 'K', 'TK-AM', 'TK-PM', 'K-AM', 'K-PM'].includes(targetGrade)))
    );
    
    if (!hours) {
      // Use default if no specific hours found
      const defaultStart = '08:00';
      const defaultEnd = '15:00';
      
      if (this.timeToMinutes(slot.startTime) < this.timeToMinutes(defaultStart) ||
          this.timeToMinutes(slot.endTime) > this.timeToMinutes(defaultEnd)) {
        errors.push({
          type: 'school_hours',
          message: `Session outside default school hours (${defaultStart} - ${defaultEnd})`,
          severity: 'error'
        });
      }
    } else {
      const schoolStart = this.timeToMinutes(hours.start_time.substring(0, 5));
      const schoolEnd = this.timeToMinutes(hours.end_time.substring(0, 5));
      const sessionStart = this.timeToMinutes(slot.startTime);
      const sessionEnd = this.timeToMinutes(slot.endTime);
      
      if (sessionStart < schoolStart || sessionEnd > schoolEnd) {
        errors.push({
          type: 'school_hours',
          message: `Session outside school hours for grade ${targetGrade} (${hours.start_time.substring(0, 5)} - ${hours.end_time.substring(0, 5)})`,
          severity: 'error',
          details: {
            timeRange: {
              start: hours.start_time.substring(0, 5),
              end: hours.end_time.substring(0, 5)
            }
          }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate concurrent session limits
   */
  validateConcurrentSessionLimits(
    slot: TimeSlot,
    existingSessions: ScheduledSession[],
    maxConcurrent: number
  ): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Count overlapping sessions
    const overlappingSessions = existingSessions.filter(session =>
      session.day_of_week === slot.dayOfWeek &&
      this.hasTimeOverlap(
        slot.startTime,
        slot.endTime,
        session.start_time,
        session.end_time
      )
    );
    
    if (overlappingSessions.length >= maxConcurrent) {
      errors.push({
        type: 'concurrent_sessions',
        message: `Slot at capacity: ${overlappingSessions.length}/${maxConcurrent} concurrent sessions`,
        severity: 'error',
        details: {
          suggestion: 'Find a different time slot'
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check for session overlap
   */
  validateSessionOverlap(
    slot: TimeSlot,
    student: Student,
    existingSessions: ScheduledSession[]
  ): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Check for overlaps with student's existing sessions
    const studentSessions = existingSessions.filter(
      s => s.student_id === student.id && s.day_of_week === slot.dayOfWeek
    );
    
    for (const session of studentSessions) {
      if (this.hasTimeOverlap(
        slot.startTime,
        slot.endTime,
        session.start_time,
        session.end_time
      )) {
        errors.push({
          type: 'session_overlap',
          message: `Overlaps with existing session ${session.start_time} - ${session.end_time}`,
          severity: 'critical',
          details: {
            conflictingItem: session,
            timeRange: {
              start: session.start_time,
              end: session.end_time
            }
          }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Utility methods
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  private hasTimeOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): boolean {
    const start1Min = this.timeToMinutes(start1);
    const end1Min = this.timeToMinutes(end1);
    const start2Min = this.timeToMinutes(start2);
    const end2Min = this.timeToMinutes(end2);
    return !(end1Min <= start2Min || start1Min >= end2Min);
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.performanceMetrics,
      averageValidationTime: this.performanceMetrics.validationCount > 0
        ? this.performanceMetrics.totalValidationTime / this.performanceMetrics.validationCount
        : 0
    };
  }
}