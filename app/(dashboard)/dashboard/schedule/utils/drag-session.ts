import type { ScheduleSession } from '@/src/types/database';

type SessionFilter = 'all' | 'mine' | 'sea' | 'specialist' | 'assigned';

export type AssignmentUpdate = {
  delivered_by?: ScheduleSession['delivered_by'];
  assigned_to_sea_id?: string | null;
  assigned_to_specialist_id?: string | null;
};

const formatTimeSegment = (value: number) => value.toString().padStart(2, '0');

export const buildSessionTimes = (time: string, minutesPerSession: number) => {
  const [hours, minutes] = time.split(':').map(Number);
  const endDate = new Date();
  endDate.setHours(hours, minutes + minutesPerSession, 0, 0);

  return {
    startTime: `${time}:00`,
    endTime: `${formatTimeSegment(endDate.getHours())}:${formatTimeSegment(endDate.getMinutes())}:00`,
  };
};

export const buildAssignmentUpdate = (
  sessionFilter: SessionFilter,
  selectedSeaId: string | null,
  selectedSpecialistId: string | null
): AssignmentUpdate => {
  if (sessionFilter === 'sea' && selectedSeaId) {
    return {
      delivered_by: 'sea',
      assigned_to_sea_id: selectedSeaId,
      assigned_to_specialist_id: null,
    };
  }

  if (sessionFilter === 'specialist' && selectedSpecialistId) {
    return {
      delivered_by: 'specialist',
      assigned_to_specialist_id: selectedSpecialistId,
      assigned_to_sea_id: null,
    };
  }

  return {};
};
