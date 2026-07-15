import { classifyRosterChange } from '@/lib/import/roster-preview';

// SPE-225: the roster preview's create-vs-merge decision. The load-bearing rule
// is that an unmatched teacher name must never clear an existing teacher link.

const existing = (over: Partial<{ sessions_per_week: number | null; minutes_per_session: number | null; teacher_id: string | null }> = {}) => ({
  sessions_per_week: 2,
  minutes_per_session: 30,
  teacher_id: 'T1' as string | null,
  ...over,
});

const schedule = { sessionsPerWeek: 2, minutesPerSession: 30 };

describe('classifyRosterChange (SPE-225)', () => {
  it('inserts when there is no existing student', () => {
    expect(classifyRosterChange(undefined, 'T1', schedule)).toEqual({
      action: 'insert',
      scheduleChanged: false,
      teacherChanged: false,
    });
  });

  it('skips when schedule and teacher are unchanged', () => {
    expect(classifyRosterChange(existing(), 'T1', schedule)).toEqual({
      action: 'skip',
      scheduleChanged: false,
      teacherChanged: false,
    });
  });

  it('updates when the schedule differs', () => {
    const r = classifyRosterChange(existing(), 'T1', { sessionsPerWeek: 3, minutesPerSession: 30 });
    expect(r).toEqual({ action: 'update', scheduleChanged: true, teacherChanged: false });
  });

  it('updates when a resolved teacher differs', () => {
    expect(classifyRosterChange(existing(), 'T2', schedule)).toEqual({
      action: 'update',
      scheduleChanged: false,
      teacherChanged: true,
    });
  });

  it('does NOT treat an unmatched (null) teacher as a change — never clears the existing teacher', () => {
    const r = classifyRosterChange(existing({ teacher_id: 'T1' }), null, schedule);
    expect(r.teacherChanged).toBe(false);
    expect(r.action).toBe('skip');
  });

  it('assigns a resolved teacher to a student that had none', () => {
    expect(classifyRosterChange(existing({ teacher_id: null }), 'T2', schedule)).toEqual({
      action: 'update',
      scheduleChanged: false,
      teacherChanged: true,
    });
  });

  it('ignores an absent roster schedule (does not clear the existing one)', () => {
    const r = classifyRosterChange(existing(), 'T1', undefined);
    expect(r.scheduleChanged).toBe(false);
    expect(r.action).toBe('skip');
  });
});
