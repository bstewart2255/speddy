'use client';

import React from 'react';
import { SidebarSection } from './sidebar-section';
import type { StaffWithHours } from '../../../../../../lib/supabase/queries/staff';

interface StaffPanelProps {
  staffMembers: StaffWithHours[];
}

const ROLE_LABELS: Record<string, string> = {
  instructional_assistant: 'IA',
  supervisor: 'Supervisor',
  office: 'Office',
};

export function StaffPanel({ staffMembers }: StaffPanelProps) {
  return (
    <SidebarSection title="Staff" count={staffMembers.length}>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {staffMembers.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No staff found
          </p>
        ) : (
          staffMembers.map((staff) => (
            <div
              key={staff.id}
              className="flex items-center gap-2 p-2 rounded"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 truncate">
                  {staff.first_name} {staff.last_name}
                </div>
                <div className="text-xs text-gray-500">
                  {ROLE_LABELS[staff.role] || staff.role}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </SidebarSection>
  );
}
