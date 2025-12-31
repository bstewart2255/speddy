/**
 * Format provider role code to display label.
 * @param role - The role code (e.g., 'speech', 'ot', 'resource')
 * @returns The display label (e.g., 'Speech', 'OT', 'Resource')
 */
export function formatRoleLabel(role: string | null): string {
  if (!role || role.trim() === '') return 'Unknown';

  switch (role.toLowerCase()) {
    case 'speech':
      return 'Speech';
    case 'ot':
      return 'OT';
    case 'counseling':
      return 'Counseling';
    case 'resource':
      return 'Resource';
    case 'psychologist':
      return 'Psych';
    case 'specialist':
      return 'Specialist';
    default:
      // Capitalize first letter for unknown roles
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}
