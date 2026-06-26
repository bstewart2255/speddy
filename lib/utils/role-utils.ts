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
    case 'sea':
      return 'SEA';
    case 'site_admin':
      return 'Site Admin';
    case 'district_admin':
      return 'District Admin';
    default:
      // Title-case each word, splitting snake_case/kebab-case so codes like
      // "site_admin" render as "Site Admin" rather than "Site_admin".
      return role
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
  }
}
