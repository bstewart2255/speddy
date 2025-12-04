/**
 * Student Name Utilities
 * Shared utilities for normalizing and matching student names across different file formats
 */

/**
 * Normalize a student name from "LastName, FirstName" format to a consistent key
 * Used for matching students across SEIS Goals, Deliveries, and Aeries Class List files
 *
 * @param name - Name in "LastName, FirstName" format
 * @returns Normalized key like "lastname_firstname" (lowercase, underscores)
 */
export function normalizeStudentName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  // Clean up the name - remove extra whitespace and quotes
  const cleaned = name.replace(/^["']|["']$/g, '').trim();

  // Split on comma (LastName, FirstName format)
  const parts = cleaned.split(',').map((p) => p.trim());

  if (parts.length < 2) {
    // If no comma, try to handle "FirstName LastName" format
    const spaceParts = cleaned.split(/\s+/);
    if (spaceParts.length >= 2) {
      const firstName = spaceParts[0];
      const lastName = spaceParts.slice(1).join(' ');
      return `${lastName.toLowerCase().replace(/\s+/g, '')}_${firstName.toLowerCase().replace(/\s+/g, '')}`;
    }
    // Single name - just normalize it
    return cleaned.toLowerCase().replace(/\s+/g, '_');
  }

  const lastName = parts[0];
  const firstName = parts[1];

  // Normalize: lowercase, remove extra spaces, join with underscore
  const normalizedLast = lastName.toLowerCase().replace(/\s+/g, '');
  const normalizedFirst = firstName.toLowerCase().replace(/\s+/g, '');

  return `${normalizedLast}_${normalizedFirst}`;
}

/**
 * Parse a name string into first and last name components
 *
 * @param name - Name in "LastName, FirstName" format
 * @returns Object with firstName and lastName
 */
export function parseStudentName(name: string): { firstName: string; lastName: string } {
  if (!name || typeof name !== 'string') {
    return { firstName: '', lastName: '' };
  }

  // Clean up the name - remove extra whitespace and quotes
  const cleaned = name.replace(/^["']|["']$/g, '').trim();

  // Split on comma (LastName, FirstName format)
  const parts = cleaned.split(',').map((p) => p.trim());

  if (parts.length < 2) {
    // If no comma, try to handle "FirstName LastName" format
    const spaceParts = cleaned.split(/\s+/);
    if (spaceParts.length >= 2) {
      return {
        firstName: spaceParts[0],
        lastName: spaceParts.slice(1).join(' ')
      };
    }
    // Single name - treat as last name
    return { firstName: '', lastName: cleaned };
  }

  return {
    lastName: parts[0],
    firstName: parts[1]
  };
}

/**
 * Create a normalized key from first and last name
 * Alternative to normalizeStudentName when names are already parsed
 *
 * @param firstName - Student's first name
 * @param lastName - Student's last name
 * @returns Normalized key like "lastname_firstname"
 */
export function createNormalizedKey(firstName: string, lastName: string): string {
  const normalizedLast = (lastName || '').toLowerCase().replace(/\s+/g, '');
  const normalizedFirst = (firstName || '').toLowerCase().replace(/\s+/g, '');
  return `${normalizedLast}_${normalizedFirst}`;
}
