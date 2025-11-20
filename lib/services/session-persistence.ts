import { SessionGenerator } from './session-generator';
import type { Database } from '@/src/types/database';

type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

/**
 * Ensures a session is persisted to the database.
 * If the session is temporary (ID starts with 'temp-'), it will be saved and the permanent version returned.
 * If the session is already permanent, it will be returned as-is.
 *
 * @param session - The session to ensure is persisted
 * @returns The permanent session with a real database ID
 * @throws Error if saving fails
 */
export async function ensureSessionPersisted(session: ScheduleSession): Promise<ScheduleSession> {
  // If already permanent, return as-is
  if (!session.id.startsWith('temp-')) {
    return session;
  }

  // Save temporary session to database
  const sessionGenerator = new SessionGenerator();
  const savedSession = await sessionGenerator.saveSessionInstance(session);

  if (!savedSession) {
    throw new Error('Failed to save temporary session to database');
  }

  return savedSession;
}

/**
 * Ensures multiple sessions are persisted to the database.
 * Filters out any sessions that fail to save.
 *
 * @param sessions - Array of sessions to ensure are persisted
 * @returns Array of permanent sessions with real database IDs
 */
export async function ensureSessionsPersisted(sessions: ScheduleSession[]): Promise<ScheduleSession[]> {
  const persistedSessions: ScheduleSession[] = [];

  for (const session of sessions) {
    try {
      const persistedSession = await ensureSessionPersisted(session);
      persistedSessions.push(persistedSession);
    } catch (error) {
      console.error(`Failed to persist session ${session.id}:`, error);
      // Continue with other sessions
    }
  }

  return persistedSessions;
}

/**
 * Checks if a session is temporary (not yet saved to database)
 *
 * @param session - The session to check
 * @returns true if session is temporary, false if permanent
 */
export function isTemporarySession(session: ScheduleSession): boolean {
  return session.id.startsWith('temp-');
}
