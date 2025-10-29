import type { ScheduleSession } from '@/src/types/database';

/**
 * Type representing a fully scheduled session with non-null scheduling fields
 */
export type ScheduledSession = ScheduleSession & {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

/**
 * Type guard that determines if a session is scheduled and narrows its type
 * A session is considered scheduled if it has:
 * - day_of_week (not null)
 * - start_time (not null)
 * - end_time (not null)
 */
export function isScheduledSession(session: ScheduleSession): session is ScheduledSession {
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

/**
 * Filters an array of sessions to only include scheduled sessions
 * Returns array typed as ScheduledSession[]
 */
export function filterScheduledSessions(sessions: ScheduleSession[]): ScheduledSession[] {
  return sessions.filter(isScheduledSession);
}
