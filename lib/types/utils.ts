/**
 * Type utilities for handling nullable database fields
 *
 * Provides consistent patterns for transforming nullable types from the database
 * into non-nullable types for application use.
 */

/**
 * Makes all properties of T non-nullable
 * Useful for transforming database Row types into application types
 */
export type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

/**
 * Makes specific fields of T non-nullable
 * Useful when only certain fields should be required
 */
export type RequireFields<T, K extends keyof T> = T & {
  [P in K]-?: NonNullable<T[P]>;
};

/**
 * Validates that a value is not null or undefined
 * Throws an error with a descriptive message if the value is null/undefined
 *
 * @param value - The value to check
 * @param fieldName - Name of the field for error messages
 * @returns The value as a non-nullable type
 * @throws Error if value is null or undefined
 */
export function requireNonNull<T>(value: T | null | undefined, fieldName: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Required field '${fieldName}' is null or undefined`);
  }
  return value;
}

/**
 * Provides a default value if the input is null or undefined
 *
 * @param value - The potentially nullable value
 * @param defaultValue - The default to use if value is null/undefined
 * @returns The value or default
 */
export function withDefault<T>(value: T | null | undefined, defaultValue: T): T {
  return value ?? defaultValue;
}

/**
 * Transforms an object with nullable fields into one with defaults applied
 *
 * @param data - Object with potentially nullable fields
 * @param defaults - Default values for nullable fields
 * @returns Object with defaults applied to null/undefined fields
 */
export function withDefaults<T extends Record<string, any>>(
  data: T,
  defaults: Partial<NonNullableFields<T>>
): T {
  const result = { ...data };
  for (const key in defaults) {
    if (result[key] === null || result[key] === undefined) {
      result[key] = defaults[key] as T[typeof key];
    }
  }
  return result;
}

/**
 * Type guard to check if a value is not null or undefined
 *
 * @param value - Value to check
 * @returns true if value is not null/undefined
 */
export function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Filters an array to remove null and undefined values
 *
 * @param array - Array potentially containing nulls
 * @returns Array with nulls removed
 */
export function filterNulls<T>(array: (T | null | undefined)[]): T[] {
  return array.filter(isNonNull);
}

/**
 * Safely parses a date string or returns null
 *
 * @param dateString - Potentially null date string
 * @returns Date object or null if invalid
 */
export function parseDateOrNull(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Safely parses a date string or throws an error
 *
 * @param dateString - Date string to parse
 * @param fieldName - Field name for error message
 * @returns Valid Date object
 * @throws Error if date is invalid or null
 */
export function requireDate(dateString: string | null | undefined, fieldName: string): Date {
  if (!dateString) {
    throw new Error(`Required date field '${fieldName}' is null or undefined`);
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date value for field '${fieldName}': ${dateString}`);
  }
  return date;
}

/**
 * Safely converts a nullable string to a number
 *
 * @param value - Potentially null number or string
 * @param defaultValue - Default if value is null/invalid
 * @returns Parsed number or default
 */
export function parseNumberOrDefault(
  value: number | string | null | undefined,
  defaultValue: number
): number {
  if (value === null || value === undefined) return defaultValue;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? defaultValue : num;
}

/**
 * Ensures a string field is non-empty, trimming whitespace
 *
 * @param value - Potentially null/empty string
 * @param fieldName - Field name for error message
 * @returns Non-empty trimmed string
 * @throws Error if string is null, undefined, or empty after trimming
 */
export function requireNonEmptyString(
  value: string | null | undefined,
  fieldName: string
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Required string field '${fieldName}' is empty or whitespace`);
  }
  return trimmed;
}
