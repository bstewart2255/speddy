// Aliased with a `mock` prefix so the jest.mock factory (hoisted above imports by
// babel-plugin-jest-hoist) may reference it.
import { createMockSupabaseClient as mockCreateSupabaseClient } from '@/test-utils/supabase-test-helpers';

// The scheduler builds a Supabase client and the singleton data manager on
// construction. These tests exercise ordering decisions, not I/O.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateSupabaseClient(),
}));

import { OptimizedScheduler } from '@/lib/scheduling/optimized-scheduler';
import { DEFAULT_SCHEDULING_CONFIG } from '@/lib/scheduling/scheduling-config';
import type { SchedulingStrategy } from '@/lib/scheduling/scheduling-strategy';

/**
 * SPE-472: the auto-scheduler used to run one fixed recipe — spread students
 * into the emptiest slots, with same-grade company as a third-place tiebreaker
 * that only applied on an exact tie. These tests pin what each strategy changes,
 * and (just as importantly) that 'balanced' still behaves as it always did.
 *
 * Strategies only reorder the slots that are *tried*; every legality check
 * (bell schedules, special activities, work days, capacity, cross-provider
 * conflicts) runs downstream of this and is untouched.
 */

type TestStudent = {
  id: string;
  initials: string;
  grade_level: string;
  teacher_id?: string | null;
  teacher_name?: string | null;
  sessions_per_week: number;
  minutes_per_session: number;
};

function student(overrides: Partial<TestStudent> & { id: string }): TestStudent {
  return {
    initials: overrides.id.toUpperCase(),
    grade_level: '3',
    teacher_id: null,
    teacher_name: null,
    sessions_per_week: 2,
    minutes_per_session: 30,
    ...overrides,
  };
}

function makeScheduler(strategy: SchedulingStrategy) {
  return new OptimizedScheduler('provider-1', 'resource', false, false, strategy) as any;
}

/** Minimal context for the slot-ordering path. */
function withContext(
  scheduler: any,
  existingSessions: Array<{ student_id: string; day_of_week: number; start_time: string; end_time: string }>,
  studentsKnown: TestStudent[]
) {
  const studentGradeMap = new Map<string, string>();
  const studentGroupKeyMap = new Map<string, string>();
  // Mirrors what scheduleBatch seeds from the roster.
  const { getGroupingKey } = jest.requireActual('@/lib/scheduling/scheduling-strategy');
  for (const s of studentsKnown) {
    studentGradeMap.set(s.id, s.grade_level.trim());
    const key = getGroupingKey(s, scheduler.strategy);
    if (key) studentGroupKeyMap.set(s.id, key);
  }
  scheduler.context = { existingSessions, studentGradeMap, studentGroupKeyMap };
  return scheduler;
}

const slots = (...times: string[]) =>
  times.map(startTime => ({ startTime, dayOfWeek: 1, endTime: '', available: true, capacity: 8, conflicts: [] }));

describe('student ordering by strategy (SPE-472)', () => {
  const hard = student({ id: 'hard', sessions_per_week: 5, minutes_per_session: 60, grade_level: '5' });
  const medium = student({ id: 'medium', sessions_per_week: 3, minutes_per_session: 30, grade_level: '3' });
  const easy = student({ id: 'easy', sessions_per_week: 1, minutes_per_session: 20, grade_level: '5' });
  const alsoThird = student({ id: 'third-b', sessions_per_week: 2, minutes_per_session: 30, grade_level: '3' });

  it('balanced places the hardest students first (unchanged behaviour)', () => {
    const order = makeScheduler('balanced')
      .sortStudentsForStrategy([easy, hard, medium])
      .map((s: TestStudent) => s.id);
    expect(order).toEqual(['hard', 'medium', 'easy']);
  });

  it('morning-first keeps the hardest-first order too', () => {
    const order = makeScheduler('morning-first')
      .sortStudentsForStrategy([easy, hard, medium])
      .map((s: TestStudent) => s.id);
    expect(order).toEqual(['hard', 'medium', 'easy']);
  });

  it('grade-grouped places peers consecutively instead of interleaving by workload', () => {
    // Interleaved by workload this would be hard(5th), medium(3rd), third-b(3rd),
    // easy(5th) — splitting both grades. Grouping keeps each grade contiguous so
    // the second member can see, and join, the first member's slot.
    const order = makeScheduler('grade-grouped')
      .sortStudentsForStrategy([easy, hard, medium, alsoThird])
      .map((s: TestStudent) => s.id);
    expect(order).toEqual(['hard', 'easy', 'medium', 'third-b']);
  });

  it('grade-grouped still ranks groups, and members inside a group, hardest first', () => {
    const order = makeScheduler('grade-grouped')
      .sortStudentsForStrategy([alsoThird, easy, medium, hard])
      .map((s: TestStudent) => s.id);
    // Grade 5 leads because its hardest member outranks grade 3's.
    expect(order.slice(0, 2)).toEqual(['hard', 'easy']);
    expect(order.slice(2)).toEqual(['medium', 'third-b']);
  });

  it('teacher-grouped groups by class, not grade', () => {
    const chenA = student({ id: 'chen-a', teacher_id: 't-chen', grade_level: '3', sessions_per_week: 4 });
    const chenB = student({ id: 'chen-b', teacher_id: 't-chen', grade_level: '4', sessions_per_week: 1 });
    const ruiz = student({ id: 'ruiz', teacher_id: 't-ruiz', grade_level: '3', sessions_per_week: 2 });

    const order = makeScheduler('teacher-grouped')
      .sortStudentsForStrategy([chenA, ruiz, chenB])
      .map((s: TestStudent) => s.id);
    expect(order).toEqual(['chen-a', 'chen-b', 'ruiz']);
  });

  it('keeps students with nothing to group on as individuals', () => {
    // Two students with no teacher recorded are not "in the same class" — they
    // must not be pooled into one bogus group.
    const noTeacherA = student({ id: 'a', sessions_per_week: 5 });
    const noTeacherB = student({ id: 'b', sessions_per_week: 1 });
    const grouped1 = student({ id: 'g1', teacher_id: 't-1', sessions_per_week: 3 });
    const grouped2 = student({ id: 'g2', teacher_id: 't-1', sessions_per_week: 2 });

    const order = makeScheduler('teacher-grouped')
      .sortStudentsForStrategy([noTeacherB, grouped2, noTeacherA, grouped1])
      .map((s: TestStudent) => s.id);
    // Ungrouped students fall wherever their own workload puts them; the real
    // group stays contiguous.
    expect(order).toEqual(['a', 'g1', 'g2', 'b']);
  });

  it('does not mutate the caller\'s array', () => {
    const input = [easy, hard, medium];
    makeScheduler('grade-grouped').sortStudentsForStrategy(input);
    expect(input.map(s => s.id)).toEqual(['easy', 'hard', 'medium']);
  });
});

describe('slot ordering by strategy (SPE-472)', () => {
  const target = student({ id: 'target', grade_level: '3', teacher_id: 't-chen' });
  const peer = student({ id: 'peer', grade_level: '3', teacher_id: 't-chen' });
  const stranger1 = student({ id: 's1', grade_level: '5', teacher_id: 't-ruiz' });
  const stranger2 = student({ id: 's2', grade_level: '5', teacher_id: 't-ruiz' });

  // 09:00 holds one grade-3 peer; 10:00 is empty; 11:00 holds two unrelated students.
  const existing = [
    { student_id: 'peer', day_of_week: 1, start_time: '09:00', end_time: '09:30' },
    { student_id: 's1', day_of_week: 1, start_time: '11:00', end_time: '11:30' },
    { student_id: 's2', day_of_week: 1, start_time: '11:00', end_time: '11:30' },
  ];
  const known = [target, peer, stranger1, stranger2];

  it('balanced prefers the emptiest slot, even when a same-grade peer sits elsewhere', () => {
    // This is the behaviour that made grade grouping ineffective before SPE-472:
    // spreading always outranked joining. Pinned deliberately — 'balanced' must
    // not change.
    const scheduler = withContext(makeScheduler('balanced'), existing, known);
    const order = scheduler
      .sortSlotsForStrategy(slots('11:00', '09:00', '10:00'), 1, target)
      .map((s: any) => s.startTime);
    expect(order).toEqual(['10:00', '09:00', '11:00']);
  });

  it('grade-grouped joins the slot that already holds a same-grade peer', () => {
    const scheduler = withContext(makeScheduler('grade-grouped'), existing, known);
    const order = scheduler
      .sortSlotsForStrategy(slots('11:00', '09:00', '10:00'), 1, target)
      .map((s: any) => s.startTime);
    expect(order[0]).toBe('09:00');
    // With no peers to join, even distribution still decides the rest.
    expect(order.slice(1)).toEqual(['10:00', '11:00']);
  });

  it('teacher-grouped joins the slot holding a classmate', () => {
    const scheduler = withContext(makeScheduler('teacher-grouped'), existing, known);
    const order = scheduler
      .sortSlotsForStrategy(slots('11:00', '09:00', '10:00'), 1, target)
      .map((s: any) => s.startTime);
    expect(order[0]).toBe('09:00');
  });

  it('teacher-grouped does NOT join a same-grade slot when the class differs', () => {
    // 09:00 holds a grade-3 student from another class; grouping by teacher must
    // ignore that and fall back to even distribution.
    const otherClassSameGrade = student({ id: 'peer', grade_level: '3', teacher_id: 't-ruiz' });
    const scheduler = withContext(
      makeScheduler('teacher-grouped'),
      existing,
      [target, otherClassSameGrade, stranger1, stranger2]
    );
    const order = scheduler
      .sortSlotsForStrategy(slots('11:00', '09:00', '10:00'), 1, target)
      .map((s: any) => s.startTime);
    expect(order[0]).toBe('10:00');
  });

  it('a grouping strategy falls back to balanced for a student with nothing to group on', () => {
    const noTeacher = student({ id: 'target', grade_level: '3', teacher_id: null, teacher_name: null });
    const scheduler = withContext(makeScheduler('teacher-grouped'), existing, known);
    const order = scheduler
      .sortSlotsForStrategy(slots('11:00', '09:00', '10:00'), 1, noTeacher)
      .map((s: any) => s.startTime);
    expect(order).toEqual(['10:00', '09:00', '11:00']);
  });

  it('morning-first tries the earliest times first regardless of how full they are', () => {
    const scheduler = withContext(makeScheduler('morning-first'), existing, known);
    const order = scheduler
      .sortSlotsForStrategy(slots('11:00', '09:00', '10:00', '08:00'), 1, target)
      .map((s: any) => s.startTime);
    expect(order).toEqual(['08:00', '09:00', '10:00', '11:00']);
  });

  it('counts peers who are already scheduled and not part of this run', () => {
    // The pre-SPE-472 grade map was seeded only from the students being
    // scheduled, so anyone already on the calendar registered as neither
    // same-grade nor other-grade and grouping could never join them.
    const scheduler = withContext(makeScheduler('grade-grouped'), existing, known);
    const [first] = scheduler.sortSlotsForStrategy(slots('09:00', '10:00'), 1, target);
    expect(first.sameGroupCount).toBe(1);
  });

  it('ignores sessions on other days', () => {
    const scheduler = withContext(makeScheduler('grade-grouped'), existing, known);
    const order = scheduler
      .sortSlotsForStrategy(slots('09:00', '10:00'), 2, target)
      .map((s: any) => s.startTime);
    // Day 2 is empty, so nothing to join — even distribution then time order.
    expect(order).toEqual(['09:00', '10:00']);
  });
});

describe('capacity passes by strategy (SPE-472)', () => {
  it('balanced keeps the conservative first pass before the group ceiling', () => {
    expect(makeScheduler('balanced').getPassCapacities()).toEqual([
      3,
      DEFAULT_SCHEDULING_CONFIG.maxConcurrentSessions,
    ]);
    expect(makeScheduler('morning-first').getPassCapacities()).toEqual([
      3,
      DEFAULT_SCHEDULING_CONFIG.maxConcurrentSessions,
    ]);
  });

  it('grouping strategies open at the group ceiling', () => {
    // Holding grouping runs to 3 first would cap a grade group at three students
    // and push the fourth off to start a second group — the opposite of the ask.
    expect(makeScheduler('grade-grouped').getPassCapacities()).toEqual([
      DEFAULT_SCHEDULING_CONFIG.maxConcurrentSessions,
    ]);
    expect(makeScheduler('teacher-grouped').getPassCapacities()).toEqual([
      DEFAULT_SCHEDULING_CONFIG.maxConcurrentSessions,
    ]);
  });

  it('never exceeds the platform group ceiling enforced downstream', () => {
    for (const strategy of ['balanced', 'grade-grouped', 'teacher-grouped', 'morning-first'] as const) {
      for (const capacity of makeScheduler(strategy).getPassCapacities()) {
        expect(capacity).toBeLessThanOrEqual(DEFAULT_SCHEDULING_CONFIG.maxConcurrentSessions);
      }
    }
  });
});

describe('strategy defaults (SPE-472)', () => {
  it('a scheduler built without a strategy behaves as balanced', () => {
    const scheduler = new OptimizedScheduler('provider-1', 'resource') as any;
    expect(scheduler.strategy).toBe('balanced');
    expect(scheduler.getPassCapacities()).toEqual([
      3,
      DEFAULT_SCHEDULING_CONFIG.maxConcurrentSessions,
    ]);
  });
});
