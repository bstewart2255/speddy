import {
  buildPlanRequests,
  type CaseloadStudent,
  type PlanningData,
} from '@/lib/supabase/queries/iep-meetings';
import type { BusyBlock } from '@/lib/iep-meetings/availability';

function student(overrides: Partial<CaseloadStudent>): CaseloadStudent {
  return {
    id: 's1',
    initials: 'A.B.',
    grade_level: '3',
    teacher_id: null,
    teacherName: null,
    teacherProfileId: null,
    teacherEmail: null,
    dueDate: '2026-10-01',
    meetingType: 'annual',
    hasUpcomingMeeting: false,
    ...overrides,
  };
}

function planningData(overrides: Partial<PlanningData> = {}): PlanningData {
  return {
    caseload: [],
    site: { windows: [], blackouts: [], maxMeetingsPerDay: null },
    hasSiteRules: false,
    organizerBusy: [
      { day_of_week: 1, start_minutes: 540, end_minutes: 570, source: 'session' },
    ],
    teacherConstraints: new Map(),
    existingMeetings: [],
    leaRep: null,
    ...overrides,
  };
}

const googleBlock = (label: string): BusyBlock => ({
  date: '2026-09-20',
  start_minutes: 600,
  end_minutes: 660,
  source: 'google',
  label,
});

describe('buildPlanRequests', () => {
  it('merges Google primary busy into the organizer constraint', () => {
    const googleBusy = new Map<string, BusyBlock[]>([
      ['primary', [googleBlock('mine')]],
    ]);
    const [request] = buildPlanRequests(
      [student({})],
      planningData(),
      googleBusy
    );
    const organizer = request.attendees[0];
    expect(organizer.key).toBe('organizer');
    expect(organizer.busy).toHaveLength(2);
    expect(organizer.busy.map(b => b.source).sort()).toEqual([
      'google',
      'session',
    ]);
  });

  it('keys teacher constraints by profile id, merging prefs and Google busy', () => {
    const planning = planningData({
      teacherConstraints: new Map([
        [
          't-profile',
          {
            key: 't-profile',
            busy: [],
            availableWindows: [{ start_minutes: 720, end_minutes: 780 }],
          },
        ],
      ]),
    });
    const googleBusy = new Map<string, BusyBlock[]>([
      ['teacher@d.org', [googleBlock('teacher')]],
    ]);
    const [request] = buildPlanRequests(
      [student({ teacherProfileId: 't-profile', teacherEmail: 'teacher@d.org' })],
      planning,
      googleBusy
    );
    expect(request.attendees).toHaveLength(2);
    const teacher = request.attendees[1];
    expect(teacher.key).toBe('t-profile');
    expect(teacher.busy).toHaveLength(1);
    expect(teacher.availableWindows).toEqual([
      { start_minutes: 720, end_minutes: 780 },
    ]);
  });

  it('falls back to an email key for teachers without accounts', () => {
    const googleBusy = new Map<string, BusyBlock[]>([
      ['noacct@d.org', [googleBlock('teacher')]],
    ]);
    const [request] = buildPlanRequests(
      [student({ teacherEmail: 'noacct@d.org' })],
      planningData(),
      googleBusy
    );
    expect(request.attendees[1].key).toBe('email:noacct@d.org');
  });

  it('reuses one merged constraint object for students sharing a teacher', () => {
    const googleBusy = new Map<string, BusyBlock[]>([
      ['teacher@d.org', [googleBlock('teacher')]],
    ]);
    const requests = buildPlanRequests(
      [
        student({ id: 's1', teacherEmail: 'teacher@d.org' }),
        student({ id: 's2', teacherEmail: 'teacher@d.org' }),
      ],
      planningData(),
      googleBusy
    );
    expect(requests[0].attendees[1]).toBe(requests[1].attendees[1]);
  });

  it('omits the teacher constraint when there is nothing to constrain', () => {
    const [request] = buildPlanRequests(
      [student({ teacherEmail: 'quiet@d.org' })],
      planningData(),
      null
    );
    expect(request.attendees).toHaveLength(1);
  });
});
