/**
 * Role mapping utilities for normalizing user roles to delivered_by values
 *
 * This ensures consistency across the application when determining who delivers a service.
 * The mapping aligns with how scheduling-coordinator.ts assigns delivered_by values.
 */

export type DeliveredByRole = 'provider' | 'sea' | 'specialist';

/**
 * Centralized list of roles that map to 'specialist' delivered_by value
 * Export this to avoid duplication across the codebase
 */
export const SPECIALIST_SOURCE_ROLES = ['resource', 'specialist', 'speech', 'ot', 'counseling'] as const;

/**
 * Normalizes a user role to the corresponding delivered_by value
 *
 * @param role - The user's role from the profiles table
 * @returns The normalized delivered_by value
 *
 * Mapping:
 * - 'sea' → 'sea'
 * - 'resource', 'speech', 'ot', 'counseling', 'specialist' → 'specialist'
 * - 'provider', 'admin', etc. → 'provider'
 */
export function normalizeDeliveredBy(role: string): DeliveredByRole {
  const normalizedRole = (role || '').toLowerCase().trim();

  if (normalizedRole === 'sea') {
    return 'sea';
  }

  if (SPECIALIST_SOURCE_ROLES.includes(normalizedRole as any)) {
    return 'specialist';
  }

  // Default to 'provider' for 'provider', 'admin', and any other roles
  return 'provider';
}
