/**
 * Role mapping utilities for normalizing user roles to delivered_by values
 *
 * This ensures consistency across the application when determining who delivers a service.
 * The mapping aligns with how scheduling-coordinator.ts assigns delivered_by values.
 */

export type DeliveredByRole = 'provider' | 'sea' | 'specialist';

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
  if (role === 'sea') {
    return 'sea';
  }

  if (['resource', 'specialist', 'speech', 'ot', 'counseling'].includes(role)) {
    return 'specialist';
  }

  // Default to 'provider' for 'provider', 'admin', and any other roles
  return 'provider';
}
