// lib/scheduling/scheduling-config.ts

export interface SchedulingConfig {
  // Time grid settings
  gridStartHour: number;  // Default: 8 (8 AM)
  gridEndHour: number;    // Default: 15 (3 PM)
  snapInterval: number;   // Minutes to snap to (5, 10, 15, etc.)

  // Auto-scheduler preferences
  preferredTimeDistribution: 'spread' | 'compact' | 'morning' | 'afternoon';
  maxSessionsPerDay: number;  // Maximum sessions per student per day
  minTimeBetweenSessions: number;  // Minutes between sessions for same student

  // Visual settings
  pixelsPerHour: number;  // Default: 120 (2px per minute)
  maxConcurrentSessions: number;  // Max sessions at same time (default: 6)
  
  // Scheduling constraints (Phase 3 additions)
  maxConsecutiveMinutes: number;  // Max consecutive session time without break
  minBreakMinutes: number;  // Minimum break between non-consecutive sessions
  schoolEndTime: string;  // School end time (e.g., "15:00")
  timeSlotInterval: number;  // Time slot interval in minutes
  
  // Distribution strategies (Phase 3 additions)
  distributionStrategy: 'even' | 'grade-grouped' | 'two-pass' | 'compact' | 'spread';
  priorityStrategy: 'minutes-desc' | 'sessions-desc' | 'custom';
  
  // Two-pass distribution settings
  twoPassEnabled: boolean;
  firstPassLimit: number;  // Max sessions per slot in first pass
  secondPassLimit: number;  // Max sessions per slot in second pass
  
  // Grade grouping settings
  gradeGroupingEnabled: boolean;
  gradeGroupingWeight: number;  // 0-1, weight for grade grouping in scoring
  
  // Optimization settings
  enableOptimization: boolean;
  enableParallelProcessing: boolean;
  maxRetries: number;
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  gridStartHour: 8,
  gridEndHour: 15,
  snapInterval: 5,
  preferredTimeDistribution: 'spread',
  maxSessionsPerDay: 2,
  minTimeBetweenSessions: 30,
  pixelsPerHour: 120,
  maxConcurrentSessions: 8,
  
  // Scheduling constraints
  maxConsecutiveMinutes: 60,
  minBreakMinutes: 30,
  schoolEndTime: '15:00',
  timeSlotInterval: 15,
  
  // Distribution strategies
  distributionStrategy: 'two-pass',
  priorityStrategy: 'minutes-desc',
  
  // Two-pass distribution
  twoPassEnabled: true,
  firstPassLimit: 3,
  secondPassLimit: 8,
  
  // Grade grouping
  gradeGroupingEnabled: true,
  gradeGroupingWeight: 0.3,
  
  // Optimization
  enableOptimization: true,
  enableParallelProcessing: false,
  maxRetries: 3
};

// Helper functions for scheduling
export function getTimePreferences(distribution: SchedulingConfig['preferredTimeDistribution']) {
  switch (distribution) {
    case 'morning':
      // Prefer times before 11 AM
      return (hour: number) => hour < 11 ? 1 : 0.5;
    case 'afternoon':
      // Prefer times after 11 AM
      return (hour: number) => hour >= 11 ? 1 : 0.5;
    case 'compact':
      // Try to group sessions together
      return (hour: number) => 1;
    case 'spread':
    default:
      // Evenly distribute throughout the day
      return (hour: number) => 1;
  }
}

// Validate time is within bounds
export function isTimeWithinBounds(
  time: string, 
  config: SchedulingConfig
): boolean {
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  const startMinutes = config.gridStartHour * 60;
  const endMinutes = config.gridEndHour * 60;

  return totalMinutes >= startMinutes && totalMinutes < endMinutes;
}

// Get snap intervals for UI
export function getSnapIntervals(): Array<{value: number, label: string}> {
  return [
    { value: 1, label: '1 minute' },
    { value: 5, label: '5 minutes' },
    { value: 10, label: '10 minutes' },
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
  ];
}