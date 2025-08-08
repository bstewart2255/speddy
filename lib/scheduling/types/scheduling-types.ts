import type { Student, ScheduleSession, BellSchedule, SpecialActivity } from './scheduling-data';

export interface TimeSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  available: boolean;
  capacity: number;
  conflicts: string[];
}

export interface SchedulingContext {
  schoolSite: string;
  workDays: number[];
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  existingSessions: ScheduleSession[];
  validSlots: Map<string, TimeSlot>;
  schoolHours: Array<{
    day_of_week: number;
    grade_level: string;
    start_time: string;
    end_time: string;
  }>;
  studentGradeMap: Map<string, string>;
  
  // Enhanced caching structures for O(1) lookups
  providerAvailability: Map<string, Map<number, AvailabilitySlot[]>>;
  bellSchedulesByGrade: Map<string, Map<number, BellSchedule[]>>;
  specialActivitiesByTeacher: Map<string, Map<number, SpecialActivity[]>>;
  
  // Cache metadata
  cacheMetadata: {
    lastFetched: Date;
    isStale: boolean;
    fetchErrors: string[];
    queryCount: number;
  };
}

export interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  schoolSite: string;
}

export interface SchedulingResult {
  success: boolean;
  scheduledSessions: Omit<
    ScheduleSession,
    "id" | "created_at" | "updated_at"
  >[];
  unscheduledStudents: Student[];
  errors: string[];
}

export interface StudentSchedule {
  studentId: string;
  sessions: Array<{
    day: number;
    startTime: string;
    endTime: string;
  }>;
}

export interface SchedulingConstraints {
  maxConcurrentSessions: number;
  maxConsecutiveMinutes: number;
  minBreakMinutes: number;
  schoolEndTime: string;
  maxSessionsPerDay: number;
  requireGradeGrouping: boolean;
}