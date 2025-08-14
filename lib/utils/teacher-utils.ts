/**
 * Utility functions for teacher-related operations
 */

/**
 * Format teacher name from first and last name components
 * @param teacher Object containing optional first_name and last_name
 * @returns Formatted full name string
 */
export function formatTeacherName(teacher: { first_name?: string | null; last_name?: string | null }): string {
  const firstName = teacher.first_name || '';
  const lastName = teacher.last_name || '';
  return `${firstName} ${lastName}`.trim();
}

/**
 * Parse a full name into first and last name components
 * @param fullName The complete name string
 * @returns Object with first_name and last_name
 */
export function parseTeacherName(fullName: string): { first_name: string; last_name: string } {
  const nameParts = fullName.trim().split(' ');
  const lastName = nameParts[nameParts.length - 1] || '';
  const firstName = nameParts.slice(0, -1).join(' ') || '';
  return { first_name: firstName, last_name: lastName };
}