'use client';

import { UsersIcon } from '@heroicons/react/24/outline';
import { formatRoleLabel } from '@/lib/utils/role-utils';

interface SharedStudentBadgeProps {
  roles: string[];
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
