import type { ScheduleSession } from '@/src/types/database';

/**
 * Determines if a session is scheduled (has all required time/day fields)
 * A session is considered scheduled if it has:
 * - day_of_week (not null)
 * - start_time (not null)
 * - end_time (not null)
 */
export function isScheduledSession(session: ScheduleSession): boolean {
  return (
    session.day_of_week !== null &&
    session.start_time !== null &&
    session.end_time !== null
  );
}

/**
 * Determines if a session is unscheduled (missing any required time/day fields)
 * A session is considered unscheduled if ANY of the required fields are null
 */
export function isUnscheduledSession(session: ScheduleSession): boolean {
  return !isScheduledSession(session);
}
