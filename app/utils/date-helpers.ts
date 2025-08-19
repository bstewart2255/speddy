/**
 * Convert a Date to a local date key string (YYYY-MM-DD)
 * This ensures consistent date comparisons regardless of timezone
 */
export function toDateKeyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a time string (HH:mm or HH:mm:ss) to hours and minutes
 */
export function parseTime(timeString: string): { hours: number; minutes: number } | null {
  if (!timeString) return null;
  
  const parts = timeString.split(':');
  if (parts.length < 2) return null;
  
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  
  if (isNaN(hours) || isNaN(minutes)) return null;
  
  return { hours, minutes };
}

/**
 * Get minutes until the first upcoming session from a list of sessions
 */
export function getMinutesUntilFirstSession(sessions: Array<{ start_time: string }>, currentTime: Date): number | null {
  if (!sessions.length) return null;

  const now = currentTime;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Find all upcoming sessions today
  const upcomingSessions = sessions
    .map(session => {
      const parsed = parseTime(session.start_time);
      if (!parsed) return null;
      return {
        ...session,
        sessionMinutes: parsed.hours * 60 + parsed.minutes
      };
    })
    .filter(session => session && session.sessionMinutes > currentMinutes)
    .sort((a, b) => a!.sessionMinutes - b!.sessionMinutes);

  if (!upcomingSessions.length) return null;

  const nextSession = upcomingSessions[0]!;
  return nextSession.sessionMinutes - currentMinutes;
}