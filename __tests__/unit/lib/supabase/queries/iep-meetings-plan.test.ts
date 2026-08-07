import {
  buildPlanRequests,
  type CaseloadStudent,
  type PlanningData,
} from '@/lib/supabase/queries/iep-meetings';
import type { LinkedTeacher } from '@/lib/supabase/queries/student-teachers';
import type { BusyBlock } from '@/lib/iep-meetings/availability';

function linkedTeacher(overrides: Partial<LinkedTeacher> = {}): LinkedTeacher {
  return { id: 't1', name: 'T One', profileId: null, email: null, ...overrides };
}

function student(overrides: Partial<CaseloadStudent>): CaseloadStudent {
  return {
    id: 's1',
    initials: 'A.B.',
    grade_level: '3',
    teachers: [],
    teacherName: null,
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
      [student({ teachers: [linkedTeacher({ profileId: 't-profile', email: 'teacher@d.org' })] })],
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
      [student({ teachers: [linkedTeacher({ email: 'noacct@d.org' })] })],
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
        student({ id: 's1', teachers: [linkedTeacher({ email: 'teacher@d.org' })] }),
        student({ id: 's2', teachers: [linkedTeacher({ id: 't2', email: 'teacher@d.org' })] }),
      ],
      planningData(),
      googleBusy
    );
    expect(requests[0].attendees[1]).toBe(requests[1].attendees[1]);
  });

  // SPE-336: co-teachers are equals and share the class, so a co-taught
  // student's meeting has to fit BOTH of them — one constraint each, not the
  // first one silently winning.
  it('constrains on every invited teacher, not just the first', () => {
    const googleBusy = new Map<string, BusyBlock[]>([
      ['davis@d.org', [googleBlock('davis')]],
      ['winbery@d.org', [googleBlock('winbery')]],
    ]);
    const [request] = buildPlanRequests(
      [
        student({
          teachers: [
            linkedTeacher({ id: 't-davis', email: 'davis@d.org' }),
            linkedTeacher({ id: 't-winbery', email: 'winbery@d.org' }),
          ],
        }),
      ],
      planningData(),
      googleBusy
    );
    expect(request.attendees).toHaveLength(3); // organizer + both teachers
    expect(request.attendees.slice(1).map(a => a.key).sort()).toEqual([
      'email:davis@d.org',
      'email:winbery@d.org',
    ]);
  });

  // A teacher with nothing to constrain must not push the OTHER co-teacher out
  // of the attendee list.
  it('keeps a constrained co-teacher when the other has no constraints', () => {
    const googleBusy = new Map<string, BusyBlock[]>([
      ['winbery@d.org', [googleBlock('winbery')]],
    ]);
    const [request] = buildPlanRequests(
      [
        student({
          teachers: [
            linkedTeacher({ id: 't-davis', email: 'quiet@d.org' }),
            linkedTeacher({ id: 't-winbery', email: 'winbery@d.org' }),
          ],
        }),
      ],
      planningData(),
      googleBusy
    );
    expect(request.attendees).toHaveLength(2);
    expect(request.attendees[1].key).toBe('email:winbery@d.org');
  });

  it('omits the teacher constraint when there is nothing to constrain', () => {
    const [request] = buildPlanRequests(
      [student({ teachers: [linkedTeacher({ email: 'quiet@d.org' })] })],
      planningData(),
      null
    );
    expect(request.attendees).toHaveLength(1);
  });
});
