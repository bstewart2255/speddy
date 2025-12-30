'use client';

import { UsersIcon } from '@heroicons/react/24/outline';

interface SharedStudentBadgeProps {
  roles: string[];
}

/**
 * Format role code to display label
 */
function formatRoleLabel(role: string): string {
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

/**
 * Badge showing which other provider types also have this student.
 * Displays "Also seen by: Speech, OT" in the student details modal header.
 */
export function SharedStudentBadge({ roles }: SharedStudentBadgeProps) {
  if (!roles || roles.length === 0) {
    return null;
  }

  const roleLabels = roles.map(formatRoleLabel);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-sm">
      <UsersIcon className="w-4 h-4 flex-shrink-0" />
      <span>Also seen by: {roleLabels.join(', ')}</span>
    </div>
  );
}
