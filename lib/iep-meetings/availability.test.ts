import {
  addDays,
  findSlots,
  getSlotConflicts,
  isoDayOfWeek,
  minutesToTime,
  planMeetings,
  timeToMinutes,
  type AttendeeConstraints,
  type FindSlotsParams,
  type SiteConstraints,
} from './availability';

// Tue + Thu afternoons; Wednesday 2027-03-10 through Fri 2027-03-12 blacked out
const SITE: SiteConstraints = {
  windows: [
    { day_of_week: 2, start_time: '14:45', end_time: '16:00' },
    { day_of_week: 4, start_time: '07:30', end_time: '08:15' },
  ],
  blackouts: [
    { start_date: '2027-03-08', end_date: '2027-03-12', label: 'Testing' },
  ],
  maxMeetingsPerDay: 1,
};

const FREE_ATTENDEE: AttendeeConstraints = { key: 'organizer', busy: [] };

function baseParams(overrides: Partial<FindSlotsParams> = {}): FindSlotsParams {
  return {
    from: '2027-03-01', // a Monday
    to: '2027-03-19',
    durationMinutes: 60,
    site: SITE,
    attendees: [FREE_ATTENDEE],
    existingMeetings: [],
    ...overrides,
  };
}

describe('time helpers', () => {
  it('converts between HH:MM and minutes', () => {
    expect(timeToMinutes('07:30')).toBe(450);
    expect(minutesToTime(450)).toBe('07:30');
    expect(minutesToTime(885)).toBe('14:45');
  });

  it('computes ISO day of week and date arithmetic', () => {
    expect(isoDayOfWeek('2027-03-01')).toBe(1); // Monday
    expect(isoDayOfWeek('2027-03-07')).toBe(7); // Sunday
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });
});

describe('findSlots', () => {
  it('only proposes slots inside site windows on matching weekdays', () => {
    const slots = findSlots(baseParams());
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const dow = isoDayOfWeek(slot.date);
      expect([2, 4]).toContain(dow);
      if (dow === 2) {
        expect(slot.start_minutes).toBeGreaterThanOrEqual(timeToMinutes('14:45'));
        expect(slot.end_minutes).toBeLessThanOrEqual(timeToMinutes('16:00'));
      }
    }
  });

  it('skips blackout dates', () => {
    const slots = findSlots(baseParams());
    // Tue 2027-03-09 falls inside the testing blackout
    expect(slots.some(s => s.date === '2027-03-09')).toBe(false);
    // Tuesdays outside the blackout are fine
    expect(slots.some(s => s.date === '2027-03-02')).toBe(true);
    expect(slots.some(s => s.date === '2027-03-16')).toBe(true);
  });

  it('never proposes a Thursday slot longer than the morning window', () => {
    const slots = findSlots(baseParams({ durationMinutes: 60 }));
    // Thursday window is only 45 minutes — no 60-minute slot fits
    expect(slots.every(s => isoDayOfWeek(s.date) !== 4)).toBe(true);
  });

  it('respects attendee recurring busy blocks (weekly sessions)', () => {
    const busyProvider: AttendeeConstraints = {
      key: 'slp',
      busy: [
        // Sessions every Tuesday 14:30–15:30
        { day_of_week: 2, start_minutes: 870, end_minutes: 930, source: 'session' },
      ],
    };
    const slots = findSlots(baseParams({ attendees: [busyProvider] }));
    for (const slot of slots.filter(s => isoDayOfWeek(s.date) === 2)) {
      expect(slot.start_minutes).toBeGreaterThanOrEqual(930);
    }
  });

  it('respects attendee available windows (teacher prep)', () => {
    const prepTeacher: AttendeeConstraints = {
      key: 'teacher',
      busy: [],
      availableWindows: [{ start_minutes: 900, end_minutes: 960 }], // 15:00–16:00
    };
    const slots = findSlots(baseParams({ attendees: [prepTeacher] }));
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.start_minutes).toBeGreaterThanOrEqual(900);
      expect(slot.end_minutes).toBeLessThanOrEqual(960);
    }
  });

  it('blocks overlap with existing meetings and enforces daily capacity', () => {
    const existing = [
      { date: '2027-03-02', start_minutes: 885, end_minutes: 945 },
    ];
    const slots = findSlots(baseParams({ existingMeetings: existing }));
    // maxMeetingsPerDay = 1 → the whole day is consumed
    expect(slots.some(s => s.date === '2027-03-02')).toBe(false);
  });
});

describe('getSlotConflicts', () => {
  it('names the failing constraint', () => {
    const conflicts = getSlotConflicts(
      { date: '2027-03-11', start_minutes: 450, end_minutes: 510 },
      { site: SITE, attendees: [FREE_ATTENDEE], existingMeetings: [] }
    );
    expect(conflicts.map(c => c.kind)).toContain('blackout');
  });

  it('returns empty for a valid slot', () => {
    const conflicts = getSlotConflicts(
      { date: '2027-03-02', start_minutes: 885, end_minutes: 945 },
      { site: SITE, attendees: [FREE_ATTENDEE], existingMeetings: [] }
    );
    expect(conflicts).toEqual([]);
  });
});

describe('planMeetings', () => {
  const base = {
    from: '2027-03-01',
    to: '2027-05-28',
    durationMinutes: 60,
    site: SITE,
    existingMeetings: [],
  };

  it('places meetings inside the 2–6 week lead window before the due date', () => {
    const [result] = planMeetings(
      [{ key: 'student-1', dueDate: '2027-04-20', attendees: [FREE_ATTENDEE] }],
      base
    );
    expect(result.slot).not.toBeNull();
    expect(result.slot!.date >= '2027-03-09').toBe(true); // due - 42d
    expect(result.slot!.date <= '2027-04-06').toBe(true); // due - 14d
  });

  it('never double-books its own placements', () => {
    const requests = Array.from({ length: 4 }, (_, i) => ({
      key: `student-${i}`,
      dueDate: '2027-04-20',
      attendees: [FREE_ATTENDEE],
    }));
    const results = planMeetings(requests, base);
    const placed = results.filter(r => r.slot).map(r => `${r.slot!.date}`);
    // maxMeetingsPerDay = 1 → all four land on distinct dates
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed.length).toBe(4);
  });

  it('schedules earliest-due students first', () => {
    const results = planMeetings(
      [
        { key: 'late', dueDate: '2027-05-20', attendees: [FREE_ATTENDEE] },
        { key: 'soon', dueDate: '2027-03-25', attendees: [FREE_ATTENDEE] },
      ],
      base
    );
    const soon = results.find(r => r.key === 'soon')!;
    const late = results.find(r => r.key === 'late')!;
    expect(soon.slot!.date < late.slot!.date).toBe(true);
  });

  it('falls back to any pre-due slot when the ideal window is dry', () => {
    // Due date so soon that [due-42, due-14] is entirely before the range
    const [result] = planMeetings(
      [{ key: 'urgent', dueDate: '2027-03-05', attendees: [FREE_ATTENDEE] }],
      base
    );
    expect(result.slot).not.toBeNull();
    expect(result.slot!.date < '2027-03-05').toBe(true);
  });

  it('reports unplaceable and missing-due-date students', () => {
    const busyEverywhere: AttendeeConstraints = {
      key: 'teacher',
      busy: [
        { day_of_week: 2, start_minutes: 0, end_minutes: 1440, source: 'session' },
        { day_of_week: 4, start_minutes: 0, end_minutes: 1440, source: 'session' },
      ],
    };
    const results = planMeetings(
      [
        { key: 'stuck', dueDate: '2027-04-20', attendees: [busyEverywhere] },
        { key: 'no-date', dueDate: null, attendees: [FREE_ATTENDEE] },
      ],
      base
    );
    expect(results.find(r => r.key === 'stuck')!.reason).toBe('no_valid_slot');
    expect(results.find(r => r.key === 'no-date')!.reason).toBe('no_due_date');
  });
});
