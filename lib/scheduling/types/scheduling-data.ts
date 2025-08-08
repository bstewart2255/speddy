import type { Database } from '@/src/types/database';

export type Student = Database['public']['Tables']['students']['Row'];
export type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];
export type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
export type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];

export interface TimeRange {
  startTime: string;
  endTime: string;
}

export interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  schoolSite: string;
}

export interface SchedulingSnapshot {
  sessions: ScheduleSession[];
  timestamp: string;
  version: number;
  metadata: {
    providerId: string;
    schoolSite: string;
    totalSessions: number;
  };
}

export interface SchedulingDataVersion {
  lastModified: string;
  version: number;
  modifiedBy: string;
}

export interface VersionedSchedulingData {
  data: {
    providerAvailability: Map<string, Map<number, AvailabilitySlot[]>>;
    bellSchedules: Map<string, Map<number, BellSchedule[]>>;
    specialActivities: Map<string, Map<number, SpecialActivity[]>>;
    existingSessions: Map<number, Map<string, ScheduleSession[]>>;
    schoolHours: Array<{
      day_of_week: number;
      grade_level: string;
      start_time: string;
      end_time: string;
    }>;
  };
  version: SchedulingDataVersion;
}

export interface CacheMetadata {
  lastFetched: Date;
  isStale: boolean;
  fetchErrors: string[];
  queryCount: number;
}

export interface DataManagerConfig {
  maxCacheAge?: number; // in milliseconds, default 15 minutes
  enableConflictDetection?: boolean;
  retryAttempts?: number;
  retryDelay?: number; // in milliseconds
}

export interface SchedulingConflict {
  type: 'bell_schedule' | 'special_activity' | 'capacity' | 'availability';
  description: string;
  conflictingItem?: BellSchedule | SpecialActivity | ScheduleSession;
  day: number;
  timeRange: TimeRange;
}

export interface SchedulingDataManagerInterface {
  // Initialization
  initialize(providerId: string, schoolSite: string, schoolId?: string): Promise<void>;
  isInitialized(): boolean;
  
  // Provider availability  
  isProviderAvailable(day: number, schoolSite: string): boolean;
  getProviderWorkDays(schoolSite: string): number[];
  
  // Schedule constraints
  getBellScheduleConflicts(grade: string, day: number, startTime: string, endTime: string): BellSchedule[];
  getSpecialActivityConflicts(teacherName: string, day: number, startTime: string, endTime: string): SpecialActivity[];
  
  // Existing sessions (work with existing 15-minute intervals)
  getExistingSessions(day?: number, timeRange?: TimeRange): ScheduleSession[];
  getSessionsByStudent(studentId: string): ScheduleSession[];
  
  // Slot availability (respect existing 6 concurrent session limit)
  isSlotAvailable(day: number, startTime: string, endTime: string, schoolSite: string): boolean;
  getSlotCapacity(day: number, startTime: string): number;
  
  // Integration with existing snapshot system
  prepareForSnapshot(): SchedulingSnapshot;
  restoreFromSnapshot(snapshot: SchedulingSnapshot): void;
  
  // Cache management
  refresh(): Promise<void>;
  clearCache(): void;
  
  // Version tracking for conflict resolution
  getVersion(): SchedulingDataVersion;
  checkForConflicts(): SchedulingConflict[];
  
  // Performance metrics
  getMetrics(): {
    cacheHits: number;
    cacheMisses: number;
    totalQueries: number;
    averageQueryTime: number;
  };
}