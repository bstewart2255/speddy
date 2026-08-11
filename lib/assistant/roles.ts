/**
 * Who can use the Speddy Assistant (SPE-450).
 *
 * v1 is service providers only: SEA is deliberately excluded (lesson view-only
 * role), and teacher/admin roles wait for a later phase. Shared between the
 * navbar (shows the "Ask AI" button) and the API route (enforces the gate) so
 * the two can't drift.
 */
export const ASSISTANT_PROVIDER_ROLES: ReadonlySet<string> = new Set([
  'resource',
  'speech',
  'ot',
  'counseling',
  'specialist',
  'psychologist',
  'intervention',
]);

export function canUseAssistant(role: string | null | undefined): boolean {
  return !!role && ASSISTANT_PROVIDER_ROLES.has(role);
}
