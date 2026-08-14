// Aliased with a `mock` prefix so the jest.mock factory (hoisted above imports by
// babel-plugin-jest-hoist) may reference it.
import { createMockSupabaseClient as mockCreateSupabaseClient } from '@/test-utils/supabase-test-helpers';

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateSupabaseClient(),
}));

import { OptimizedScheduler } from '@/lib/scheduling/optimized-scheduler';

/**
 * SPE-474: the scheduler's weekly grid was being built from dated instances as
 * well as templates.
 *
 * `SchedulingDataManager.fetchExistingSessions` does `select('*')` with no
 * `is_template` filter, and an instance carries day_of_week/start_time/end_time
 * exactly like the template it came from. With instances materialized to a
 * rolling 12-week horizon (SPE-291), every weekly session appeared in the grid
 * a dozen times over. Two consequences, both pinned here:
 *
 *   - `scheduleStudent` derives `sessionsNeeded` from
 *     `sessions_per_week - existingSessionsForStudent`, which hit 0 for anyone
 *     with instances. It then placed nothing and reported SUCCESS, because
 *     `scheduledSessions.length === sessionsNeeded` holds at 0 === 0. Fixing
 *     only the component's gate (SPE-474's first half) would have promoted the
 *     silent skip into a silent false success.
 *   - `buildValidSlotsMap` subtracts overlapping sessions from a capacity of 8,
 *     so one weekly session backed by twelve instances drove the slot negative
 *     and dropped it from the grid — a nearly-empty calendar presenting as full
 *     (the shape reported in SPE-273).
 */

const WEEKLY = {
  student_id: 'student-1',
  provider_id: 'provider-1',
  assigned_to_sea_id: null,
  assigned_to_specialist_id: null,
  day_of_week: 1,
  start_time: '09:00:00',
  end_time: '09:30:00',
  is_template: true,
  deleted_at: null,
  session_date: null,
};

/** The dated copies the top-up cron materializes from that weekly template. */
const instancesOf = (template: typeof WEEKLY, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    ...template,
    id: `i${i}`,
    is_template: false,
    session_date: `2026-08-${String(10 + i).padStart(2, '0')}`,
  }));

async function contextFrom(sessions: Array<Record<string, unknown>>) {
  const scheduler = new OptimizedScheduler('provider-1', 'resource', false, false) as any;
  scheduler.dataManager = {
    isInitializedForSchool: () => true,
    initialize: async () => undefined,
    getProviderWorkDays: () => [1, 2, 3, 4, 5],
    getExistingSessions: () => sessions,
    getCrossProviderSessions: () => new Map(),
    getMainstreamingBlocks: () => [],
    getStudentBlockedTimes: () => [],
    getSpecialActivitiesFlat: () => [],
    getBellScheduleConflicts: () => [],
    getMetrics: () => ({ cacheHits: 0, cacheMisses: 0 }),
  };
  await scheduler.initializeContext('Willow', 'JSUSD');
  return scheduler;
}

const student = {
  id: 'student-1',
  initials: 'AB',
  grade_level: '3',
  sessions_per_week: 2,
  minutes_per_session: 30,
};

describe('scheduler context excludes dated instances (SPE-474)', () => {
  it('keeps the weekly template and drops its dated instances', async () => {
    const scheduler = await contextFrom([
      { ...WEEKLY, id: 't0' },
      ...instancesOf(WEEKLY, 12),
    ]);
    expect(scheduler.context.existingSessions).toHaveLength(1);
    expect(scheduler.context.existingSessions[0].id).toBe('t0');
  });

  it('drops soft-deleted templates too', async () => {
    const scheduler = await contextFrom([
      { ...WEEKLY, id: 't0' },
      { ...WEEKLY, id: 't1', deleted_at: '2026-01-01' },
    ]);
    expect(scheduler.context.existingSessions.map((s: any) => s.id)).toEqual(['t0']);
  });

  it('still needs the remaining sessions rather than reporting a hollow success', async () => {
    // 1 weekly template + 12 instances against sessions_per_week = 2. Counting
    // the instances gave sessionsNeeded = max(0, 2 - 13) = 0: nothing placed,
    // success reported, provider told it worked.
    const scheduler = await contextFrom([
      { ...WEEKLY, id: 't0' },
      ...instancesOf(WEEKLY, 12),
    ]);
    const result = scheduler.scheduleStudent(student);

    expect(result.scheduledSessions.length).toBeGreaterThan(0);
    expect(result.success).toBe(true);
  });

  it('does not report success for a student it placed nothing for', async () => {
    // The failure mode in its own right: success must mean sessions were written.
    const scheduler = await contextFrom([
      { ...WEEKLY, id: 't0' },
      ...instancesOf(WEEKLY, 12),
    ]);
    const result = scheduler.scheduleStudent(student);
    if (result.scheduledSessions.length === 0) {
      expect(result.success).toBe(false);
    }
  });

  it('leaves the weekly grid intact instead of exhausting slot capacity', async () => {
    // 12 instances at Monday 09:00 used to subtract 12 from a capacity of 8,
    // taking the slot negative so it was excluded from validSlots entirely.
    const withInstances = await contextFrom([
      { ...WEEKLY, id: 't0' },
      ...instancesOf(WEEKLY, 12),
    ]);
    const templateOnly = await contextFrom([{ ...WEEKLY, id: 't0' }]);

    expect(withInstances.context.validSlots.size).toBe(templateOnly.context.validSlots.size);
    // And the Monday 09:00 slot itself survives, with one session against it.
    const slot = withInstances.context.validSlots.get('1-09:00');
    expect(slot).toBeDefined();
    expect(slot.capacity).toBe(7);
  });
});
