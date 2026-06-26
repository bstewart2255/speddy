'use client';

import { formatRoleLabel } from '@/lib/utils/role-utils';
import type { ChatParticipant } from '@/lib/supabase/queries/chat';

interface ChatParticipantsHeaderProps {
  studentInitials: string;
  participants: ChatParticipant[];
}

export function ChatParticipantsHeader({
  studentInitials,
  participants,
}: ChatParticipantsHeaderProps) {
  return (
    <div className="border-b border-gray-200 px-4 py-3">
      <div className="text-sm font-semibold text-gray-900">Team chat · {studentInitials}</div>
      <div className="text-xs text-gray-500">
        {participants.length} {participants.length === 1 ? 'member' : 'members'} with a Speddy account
      </div>

      {participants.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {participants.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
            >
              {p.fullName ?? 'Unknown'}
              {p.role ? ` · ${formatRoleLabel(p.role)}` : ''}
            </span>
          ))}
        </div>
      )}

      <p className="mt-1 text-[11px] text-gray-400">
        Only team members with a Speddy account appear here.
      </p>
    </div>
  );
}
