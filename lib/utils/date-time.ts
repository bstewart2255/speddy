/**
 * Utilities for date and time formatting
 */

/**
 * Convert a Date to a local date key (YYYY-MM-DD) to avoid timezone issues
 */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a time slot range (e.g., "08:15-08:45" to "8:15 AM - 8:45 AM")
 * Handles both range format and single time format for backward compatibility
 */
export function formatTimeSlot(timeSlot: string): string {
  // Handle time range format (e.g., "08:15-08:45")
  if (timeSlot.includes('-')) {
    const parts = timeSlot.split('-').map(p => p.trim());
    if (parts.length !== 2) return timeSlot;
    
    const formatSingleTime = (time: string) => {
      // Handle HH:MM or HH:MM:SS format
      const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
      if (!match) return time;
      
      const hour = parseInt(match[1], 10);
      const minutes = match[2];
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${displayHour}:${minutes} ${period}`;
    };
    
    return `${formatSingleTime(parts[0])} - ${formatSingleTime(parts[1])}`;
  }
  
  // Handle single time format (legacy)
  const [hours, minutes] = timeSlot.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minutes} ${period}`;
}

/**
 * Calculate duration in minutes from a time slot range
 */
export function calculateDurationFromTimeSlot(timeSlot: string): number {
  if (!timeSlot.includes('-')) {
    return 30; // Default duration for legacy format
  }
  
  const [startTime, endTime] = timeSlot.split('-').map(t => t.trim());
  
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  };
  
  const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
  return Math.max(0, duration);
}