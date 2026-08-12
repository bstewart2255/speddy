// Aliased with a `mock` prefix so the jest.mock factory (hoisted above imports by
// babel-plugin-jest-hoist) may reference it.
import { createMockSupabaseClient as mockCreateSupabaseClient } from '@/test-utils/supabase-test-helpers';

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateSupabaseClient(),
}));

import { OptimizedScheduler } from '@/lib/scheduling/optimized-scheduler';
import { getGroupingKey, type SchedulingStrategy } from '@/lib/scheduling/scheduling-strategy';

/**
 * SPE-473: end-to-end placement, across days.
 *
 * The sibling suite pins the ordering helpers in isolation, which is exactly how
 * the first cut of this feature shipped broken: `sortSlotsForStrategy` was
 * strategy-aware, but the enclosing day loop still picked days by "fewest
 * existing sessions". Every peer placed made its day one busier, so the next
 * peer was pushed to the next day and grouping produced the same Mon/Tue/Wed
 * spread as balanced. Testing a single fixed `day` could never see it.
 *
 * These tests place students the way `scheduleBatch` does — one at a time,
 * feeding each placement back into the context — and assert on where students
 * actually land.
 */

type TestStudent = {
  id: string;
  initials: string;
  grade_level: string;
  teacher_id: string | null;
  teacher_name: string | null;
  sessions_per_week: number;
  minutes_per_session: number;
};

function student(overrides: Partial<TestStudent> & { id: string }): TestStudent {
  return {
    initials: overrides.id.toUpperCase(),
    grade_level: '3',
    teacher_id: null,
    teacher_name: null,
    sessions_per_week: 1,
    minutes_per_session: 30,
    ...overrides,
  };
}

type Placement = { studentId: string; day: number; startTime: string };

/**
 * Runs students through the real placement path with a five-day work week and an
 * otherwise empty calendar. Mirrors `scheduleBatch`: sort, then place each
 * student and fold the result back into the context before the next one.
 */
async function place(
  strategy: SchedulingStrategy,
  students: TestStudent[],
  preScheduled: Array<{ student_id: string; day_of_week: number; start_time: string; end_time: string; provider_id?: string }> = [],
  roster: TestStudent[] = []
): Promise<Placement[]> {
  const scheduler = new OptimizedScheduler('provider-1', 'resource', false, false, strategy) as any;

  scheduler.dataManager = {
    isInitializedForSchool: () => true,
    initialize: async () => undefined,
  };
  scheduler.getDataFromManager = async () => ({
    workSchedule: [1, 2, 3, 4, 5].map(day_of_week => ({ day_of_week })),
    bellSchedules: [],
    specialActivities: [],
    existingSessions: preScheduled.map(s => ({ provider_id: 'provider-1', assigned_to_sea_id: null, assigned_to_specialist_id: null, ...s })),
    schoolHours: [],
    crossProviderSessionsByStudent: new Map(),
  });

  await scheduler.initializeContext('Rodeo Hills Elementary', 'JSUSD');

  // Seed the maps exactly as scheduleBatch does.
  for (const s of students) {
    scheduler.context.studentGradeMap.set(s.id, s.grade_level.trim());
  }
  for (const s of [...roster, ...students]) {
    const key = getGroupingKey(s, strategy);
    if (key) scheduler.context.studentGroupKeyMap.set(s.id, key);
  }

  const placements: Placement[] = [];
  for (const s of scheduler.sortStudentsForStrategy(students)) {
    const result = scheduler.scheduleStudent(s);
    for (const session of result.scheduledSessions) {
      placements.push({
        studentId: s.id,
        day: session.day_of_week,
        startTime: session.start_time,
      });
    }
    scheduler.updateContextWithSessions(result.scheduledSessions);
  }
  return placements;
}

/** Distinct (day, startTime) pairs across all placements. */
const distinctSlots = (placements: Placement[]) =>
  new Set(placements.map(p => `${p.day}-${p.startTime}`));

describe('grade-grouped placement (SPE-473)', () => {
  const third = [
    student({ id: 'a', grade_level: '3' }),
    student({ id: 'b', grade_level: '3' }),
    student({ id: 'c', grade_level: '3' }),
  ];

  it('lands a whole grade in ONE shared slot', async () => {
    const placements = await place('grade-grouped', third);
    expect(placements).toHaveLength(3);
    expect(distinctSlots(placements).size).toBe(1);
  });

  it('spreads that same grade across days under balanced', async () => {
    // The contrast that makes the test above meaningful: identical input, and
    // the default strategy still distributes. If this ever collapses to one
    // slot, the grouping assertion above has stopped proving anything.
    const placements = await place('balanced', third);
    expect(placements).toHaveLength(3);
    expect(new Set(placements.map(p => p.day)).size).toBeGreaterThan(1);
  });

  it('joins a group that is already on the calendar and not part of this run', async () => {
    // Two grade-3 students already sit on Wednesday 09:00. A new grade-3 student
    // should join them rather than seed a fourth day. This is what the roster
    // exists for — without it the scheduler cannot tell what grade those two are.
    const alreadyScheduled = [
      { student_id: 'existing-1', day_of_week: 3, start_time: '09:00', end_time: '09:30' },
      { student_id: 'existing-2', day_of_week: 3, start_time: '09:00', end_time: '09:30' },
    ];
    const roster = [
      student({ id: 'existing-1', grade_level: '3' }),
      student({ id: 'existing-2', grade_level: '3' }),
    ];
    const newcomer = student({ id: 'newcomer', grade_level: '3' });

    const placements = await place('grade-grouped', [newcomer], alreadyScheduled, roster);
    expect(placements).toEqual([{ studentId: 'newcomer', day: 3, startTime: '09:00' }]);
  });

  it('does not join a group of a different grade', async () => {
    const alreadyScheduled = [
      { student_id: 'existing-1', day_of_week: 3, start_time: '09:00', end_time: '09:30' },
      { student_id: 'existing-2', day_of_week: 3, start_time: '09:00', end_time: '09:30' },
    ];
    const roster = [
      student({ id: 'existing-1', grade_level: '5' }),
      student({ id: 'existing-2', grade_level: '5' }),
    ];
    const newcomer = student({ id: 'newcomer', grade_level: '3' });

    const placements = await place('grade-grouped', [newcomer], alreadyScheduled, roster);
    expect(placements[0]).not.toEqual({ studentId: 'newcomer', day: 3, startTime: '09:00' });
  });

  it('keeps two different grades in two different slots', async () => {
    const students = [
      student({ id: 'g3-a', grade_level: '3' }),
      student({ id: 'g5-a', grade_level: '5' }),
      student({ id: 'g3-b', grade_level: '3' }),
      student({ id: 'g5-b', grade_level: '5' }),
    ];
    const placements = await place('grade-grouped', students);

    const slotOf = (id: string) => {
      const p = placements.find(x => x.studentId === id)!;
      return `${p.day}-${p.startTime}`;
    };
    expect(slotOf('g3-a')).toBe(slotOf('g3-b'));
    expect(slotOf('g5-a')).toBe(slotOf('g5-b'));
    expect(slotOf('g3-a')).not.toBe(slotOf('g5-a'));
  });

  it('starts a second slot once a group exceeds the capacity ceiling', async () => {
    // Ten students in one grade cannot all share a slot; the cap is 8.
    const many = Array.from({ length: 10 }, (_, i) => student({ id: `s${i}`, grade_level: '3' }));
    const placements = await place('grade-grouped', many);

    expect(placements).toHaveLength(10);
    const perSlot = new Map<string, number>();
    for (const p of placements) {
      const key = `${p.day}-${p.startTime}`;
      perSlot.set(key, (perSlot.get(key) || 0) + 1);
    }
    expect(Math.max(...perSlot.values())).toBeLessThanOrEqual(8);
    expect(perSlot.size).toBeGreaterThan(1);
  });
});

describe('teacher-grouped placement (SPE-473)', () => {
  it('lands one teacher\'s students in a shared slot, across grades', async () => {
    const students = [
      student({ id: 'chen-a', teacher_id: 't-chen', grade_level: '3' }),
      student({ id: 'chen-b', teacher_id: 't-chen', grade_level: '5' }),
      student({ id: 'chen-c', teacher_id: 't-chen', grade_level: '4' }),
    ];
    const placements = await place('teacher-grouped', students);
    expect(distinctSlots(placements).size).toBe(1);
  });

  it('keeps separate classes in separate slots', async () => {
    const students = [
      student({ id: 'chen-a', teacher_id: 't-chen' }),
      student({ id: 'ruiz-a', teacher_id: 't-ruiz' }),
      student({ id: 'chen-b', teacher_id: 't-chen' }),
      student({ id: 'ruiz-b', teacher_id: 't-ruiz' }),
    ];
    const placements = await place('teacher-grouped', students);
    const slotOf = (id: string) => {
      const p = placements.find(x => x.studentId === id)!;
      return `${p.day}-${p.startTime}`;
    };
    expect(slotOf('chen-a')).toBe(slotOf('chen-b'));
    expect(slotOf('ruiz-a')).toBe(slotOf('ruiz-b'));
    expect(slotOf('chen-a')).not.toBe(slotOf('ruiz-a'));
  });

  it('does not pool students who simply have no teacher recorded', async () => {
    // Missing data is not a shared classroom. These must be placed by the
    // balanced rules, which spread them out.
    const students = [
      student({ id: 'none-a', teacher_id: null, teacher_name: null }),
      student({ id: 'none-b', teacher_id: null, teacher_name: null }),
      student({ id: 'none-c', teacher_id: null, teacher_name: null }),
    ];
    const placements = await place('teacher-grouped', students);
    expect(distinctSlots(placements).size).toBeGreaterThan(1);
  });
});

describe('morning-first placement (SPE-473)', () => {
  it('takes a busier early slot where balanced takes an emptier later one', async () => {
    // On an empty calendar both strategies start at 08:00, so a contrast test
    // there proves nothing. The strategies only diverge once an earlier slot is
    // busier than a later one: balanced ranks emptiness first and moves on,
    // morning-first ranks time first and stays early while capacity allows.
    const busyMornings = [1, 2, 3, 4, 5].flatMap(day => [
      { student_id: `other-${day}-1`, day_of_week: day, start_time: '08:00', end_time: '08:30' },
      { student_id: `other-${day}-2`, day_of_week: day, start_time: '08:00', end_time: '08:30' },
    ]);
    const students = [student({ id: 'target' })];

    const [morning] = await place('morning-first', students, busyMornings);
    const [balanced] = await place('balanced', students, busyMornings);

    expect(morning.startTime).toBe('08:00');
    expect(balanced.startTime > '08:00').toBe(true);
  });

  it('still respects the per-slot capacity ceiling', async () => {
    const students = Array.from({ length: 12 }, (_, i) => student({ id: `s${i}` }));
    const placements = await place('morning-first', students);

    const perSlot = new Map<string, number>();
    for (const p of placements) {
      const key = `${p.day}-${p.startTime}`;
      perSlot.set(key, (perSlot.get(key) || 0) + 1);
    }
    expect(Math.max(...perSlot.values())).toBeLessThanOrEqual(8);
  });
});

describe('balanced placement is unchanged (SPE-473)', () => {
  it('distributes students across days rather than stacking them', async () => {
    const students = Array.from({ length: 5 }, (_, i) => student({ id: `s${i}` }));
    const placements = await place('balanced', students);
    // Five students, five work days, empty calendar: one per day.
    expect(new Set(placements.map(p => p.day)).size).toBe(5);
  });

  it('places every student it is given', async () => {
    const students = Array.from({ length: 6 }, (_, i) =>
      student({ id: `s${i}`, sessions_per_week: 2 })
    );
    const placements = await place('balanced', students);
    expect(placements).toHaveLength(12);
  });
});
