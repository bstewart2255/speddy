import { sessionUpdateService } from '../services/session-update-service';

interface ConflictCheckResult {
  hasConflict: boolean;
  reason?: string;
}

/**
 * Simple, synchronous conflict checker for schedule sessions
 * Replaces the complex async conflict detection services
 */
export async function checkSlotConflict(
  sessionId: string,
  day: number,
  timeStr: string,
  duration: number
): Promise<ConflictCheckResult> {
  try {
    // Convert time string to proper format with seconds
    const [hours, minutes] = timeStr.split(':').map(Number);
    const startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    
    // Calculate end time
    const endMinutes = hours * 60 + minutes + duration;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}:00`;
    
    // Check if session would exceed grid bounds (6pm)
    if (endMinutes > 18 * 60) {
      return { hasConflict: true, reason: 'Exceeds schedule hours' };
    }
    
    // Use existing validation service for comprehensive checks
    const validation = await sessionUpdateService.validateOnly(
      sessionId,
      day,
      startTime,
      endTime
    );
    
    if (!validation.valid) {
      return { 
        hasConflict: true, 
        reason: validation.conflicts?.[0]?.description || validation.error || 'Schedule conflict'
      };
    }
    
    return { hasConflict: false };
  } catch (error) {
    // Log the error for debugging
    console.error('Error in checkSlotConflict:', error);
    // If error has a message, include it in the reason
    const reason = error && typeof error === 'object' && 'message' in error
      ? `Unable to validate: ${(error as Error).message}`
      : 'Unable to validate';
    return { hasConflict: true, reason };
  }
}

/**
 * Get all conflicted slots for a session being dragged
 * Returns a Set of slot keys (e.g., "1-09:00") that have conflicts
 */
export async function getAllConflictsForSession(
  sessionId: string,
  studentMinutes: number,
  currentDay?: number,
  currentTime?: string
): Promise<Set<string>> {
  const conflicts = new Set<string>();
  const snapInterval = 15;
  const startHour = 7;
  const endHour = 18;
  
  // Check all possible slots in parallel for better performance
  const checks: Promise<void>[] = [];
  
  for (let day = 1; day <= 5; day++) {
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += snapInterval) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const slotKey = `${day}-${timeStr}`;
        
        // Skip current session position
        if (day === currentDay && timeStr === currentTime) {
          continue;
        }
        
        // Add async check to array
        checks.push(
          checkSlotConflict(sessionId, day, timeStr, studentMinutes).then(result => {
            if (result.hasConflict) {
              conflicts.add(slotKey);
            }
          })
        );
      }
    }
  }
  
  // Wait for all checks to complete
  await Promise.all(checks);
  
  return conflicts;
}