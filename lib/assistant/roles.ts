import { SPECIALIST_SOURCE_ROLES } from '@/lib/auth/role-utils';

/**
 * Who can use the Speddy Assistant (SPE-450).
 *
 * v1 is service providers only — exactly the specialist-source roles: SEA is
 * deliberately excluded (lesson view-only role), and teacher/admin roles wait
 * for a later phase. Derived from SPECIALIST_SOURCE_ROLES so a new provider
 * role can't be added in one place and missed here. Shared between the navbar
 * (shows the "Ask AI" button) and the API route (enforces the gate) so the two
 * can't drift.
 */
export const ASSISTANT_PROVIDER_ROLES: ReadonlySet<string> = new Set(SPECIALIST_SOURCE_ROLES);

export function canUseAssistant(role: string | null | undefined): boolean {
  return !!role && ASSISTANT_PROVIDER_ROLES.has(role);
}
