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
  maxConcurrentSessions: number;  // Max sessions at same time (default: 4)
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  gridStartHour: 8,
  gridEndHour: 15,
  snapInterval: 5,
  preferredTimeDistribution: 'spread',
  maxSessionsPerDay: 1,
  minTimeBetweenSessions: 60,
  pixelsPerHour: 120,
  maxConcurrentSessions: 4,
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