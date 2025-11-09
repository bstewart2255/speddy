/**
 * Formats a Date object as YYYY-MM-DD in local timezone
 * This avoids UTC conversion issues when using toISOString()
 *
 * @param date - The date to format
 * @returns String in YYYY-MM-DD format using local timezone
 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
