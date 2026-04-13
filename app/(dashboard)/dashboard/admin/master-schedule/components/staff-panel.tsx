'use client';

import React, { useMemo } from 'react';
import { SidebarSection } from './sidebar-section';
import type { StaffWithHours } from '../../../../../../lib/supabase/queries/staff';
import type { YardDutyAssignment } from '@/src/types/database';

interface StaffPanelProps {
  staffMembers: StaffWithHours[];
  selectedStaffIds: Set<string>;
  onToggleStaff: (staffId: string) => void;
  yardDutyAssignments?: YardDutyAssignment[];
}

const ROLE_LABELS: Record<string, string> = {
  instructional_assistant: 'IA',
  supervisor: 'Supervisor',
  office: 'Office',
};

export function StaffPanel({
  staffMembers,
  selectedStaffIds,
  onToggleStaff,
  yardDutyAssignments = [],
}: StaffPanelProps) {
  const yardDutyMinutesByStaff = useMemo(() => {
    const map = new Map<string, number>();
    for (const yd of yardDutyAssignments) {
      if (!yd.staff_id) continue;
      const [sh, sm] = yd.start_time.split(':').map(Number);
      const [eh, em] = yd.end_time.split(':').map(Number);
      const minutes = (eh * 60 + em) - (sh * 60 + sm);
      if (minutes > 0) {
        map.set(yd.staff_id, (map.get(yd.staff_id) || 0) + minutes);
      }
    }
    return map;
  }, [yardDutyAssignments]);
  return (
    <SidebarSection title="Staff" count={staffMembers.length}>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {staffMembers.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-2">
            No staff found
          </p>
        ) : (
          staffMembers.map((staff) => (
            <label
              key={staff.id}
              className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedStaffIds.has(staff.id)}
                onChange={() => onToggleStaff(staff.id)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                aria-label={`${staff.first_name} ${staff.last_name}`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 truncate">
                  {staff.first_name} {staff.last_name}
                </div>
                <div className="text-xs text-gray-500">
                  {ROLE_LABELS[staff.role] || staff.role}
                </div>
              </div>
              {yardDutyMinutesByStaff.has(staff.id) && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 flex-shrink-0">
                  {yardDutyMinutesByStaff.get(staff.id)}
                </span>
              )}
            </label>
          ))
        )}
      </div>
    </SidebarSection>
  );
}
