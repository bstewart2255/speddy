/**
 * School year utility functions.
 *
 * A school year label looks like "2025-2026".
 * The current year flips on August 1: from Aug-Dec it's thisYear-(thisYear+1),
 * from Jan-Jul it's (thisYear-1)-thisYear.
 */

export function getCurrentSchoolYear(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-indexed

  if (month >= 8) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

export const DEFAULT_SCHOOL_YEAR = getCurrentSchoolYear();

export function getNextSchoolYear(): string {
  const current = getCurrentSchoolYear();
  const startYear = parseInt(current.split('-')[0], 10);
  return `${startYear + 1}-${startYear + 2}`;
}
