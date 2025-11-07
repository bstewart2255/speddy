/**
 * Get the current day of the week as an integer for working days schedule matching.
 *
 * @returns {number} 0 for weekends, 1-5 for Monday-Friday
 *
 * Map:
 * - 0: Weekend (Saturday/Sunday)
 * - 1: Monday
 * - 2: Tuesday
 * - 3: Wednesday
 * - 4: Thursday
 * - 5: Friday
 */
export function getCurrentDayOfWeek(): number {
  const today = new Date();
  const jsDay = today.getDay(); // JavaScript: 0=Sunday, 1=Monday, ..., 6=Saturday

  // Convert to our schema: 1=Monday, 2=Tuesday, ..., 5=Friday, 0=Weekend
  if (jsDay === 0 || jsDay === 6) {
    // Sunday (0) or Saturday (6)
    return 0;
  }

  // Monday (1) -> 1, Tuesday (2) -> 2, ..., Friday (5) -> 5
  return jsDay;
}

/**
 * Get a specific day of week as an integer.
 * Useful for testing or specific date calculations.
 *
 * @param {Date} date - The date to get the day of week for
 * @returns {number} 0 for weekends, 1-5 for Monday-Friday
 */
export function getDayOfWeek(date: Date): number {
  const jsDay = date.getDay();

  if (jsDay === 0 || jsDay === 6) {
    return 0;
  }

  return jsDay;
}
