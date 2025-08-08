import type { TimeSlot } from '../types/scheduling-types';
import type { Student } from './scheduling-data';

export type DistributionStrategy = 
  | 'even'           // Distribute sessions evenly across available days
  | 'grade-grouped'  // Group students by grade level
  | 'two-pass'       // Two-pass distribution (3 max first, then 6)
  | 'compact'        // Group sessions together
  | 'spread';        // Maximize gaps between sessions

export interface DistributionConfig {
  strategy: DistributionStrategy;
  maxSessionsPerSlot: number;
  maxSessionsPerDay: number;
  preferMorning?: boolean;
  preferAfternoon?: boolean;
  gradeGroupingEnabled?: boolean;
  twoPassEnabled?: boolean;
  firstPassLimit?: number;
  secondPassLimit?: number;
}

export interface DistributionResult {
  slots: TimeSlot[];
  distribution: Map<number, TimeSlot[]>; // day -> slots
  metrics: {
    averageSessionsPerDay: number;
    maxSessionsOnAnyDay: number;
    gradeGroupingScore?: number; // 0-1, higher is better
    distributionBalance: number; // 0-1, higher is more balanced
  };
}

export interface SlotScore {
  slot: TimeSlot;
  score: number;
  factors: {
    capacity: number;
    gradeAlignment: number;
    timePreference: number;
    distribution: number;
  };
}

export interface DistributionContext {
  student: Student;
  availableSlots: TimeSlot[];
  existingSessions: Map<string, any[]>; // studentId -> sessions
  studentGradeMap: Map<string, string>;
  targetGrade: string;
  workDays: number[];
}

export const DEFAULT_DISTRIBUTION_CONFIG: DistributionConfig = {
  strategy: 'two-pass',
  maxSessionsPerSlot: 6,
  maxSessionsPerDay: 2,
  gradeGroupingEnabled: true,
  twoPassEnabled: true,
  firstPassLimit: 3,
  secondPassLimit: 6
};