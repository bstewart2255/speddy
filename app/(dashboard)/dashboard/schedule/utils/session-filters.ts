import type { ScheduleSession } from '@/src/types/database';

export type SessionFilter = 'all' | 'mine' | 'sea' | 'specialist' | 'assigned';

interface FilterOptions {
  sessions: ScheduleSession[];
  sessionFilter: SessionFilter;
  providerRole: string;
  currentUserId: string | null;
  selectedSeaId: string | null;
  selectedSpecialistId: string | null;
}

export function filterScheduleSessions({
  sessions,
  sessionFilter,
  providerRole,
  currentUserId,
  selectedSeaId,
  selectedSpecialistId,
}: FilterOptions): ScheduleSession[] {
  if (providerRole === 'sea' && currentUserId) {
    return sessions.filter(s => s.assigned_to_sea_id === currentUserId);
  }

  if (sessionFilter === 'assigned' && currentUserId) {
    return sessions.filter(s => s.assigned_to_specialist_id === currentUserId);
  }

  if (
    ['speech', 'ot', 'counseling', 'specialist', 'resource'].includes(providerRole) &&
    currentUserId &&
    sessionFilter === 'mine'
  ) {
    return sessions.filter(s =>
      s.assigned_to_specialist_id === currentUserId ||
      (s.delivered_by === 'provider' && !s.assigned_to_sea_id && !s.assigned_to_specialist_id)
    );
  }

  switch (sessionFilter) {
    case 'mine':
      return sessions.filter(s => s.delivered_by === 'provider');
    case 'sea': {
      const filtered = sessions.filter(s => s.delivered_by === 'sea');
      return selectedSeaId ? filtered.filter(s => s.assigned_to_sea_id === selectedSeaId) : filtered;
    }
    case 'specialist': {
      const filtered = sessions.filter(s => s.delivered_by === 'specialist');
      return selectedSpecialistId
        ? filtered.filter(s => s.assigned_to_specialist_id === selectedSpecialistId)
        : filtered;
    }
    default:
      return sessions;
  }
}
