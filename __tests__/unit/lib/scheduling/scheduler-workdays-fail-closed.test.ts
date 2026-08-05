// Aliased with a `mock` prefix so the jest.mock factory (hoisted above imports by
// babel-plugin-jest-hoist) may reference it.
import { createMockSupabaseClient as mockCreateSupabaseClient } from '@/test-utils/supabase-test-helpers';

// The scheduler constructs a Supabase client and the singleton data manager on
// construction; mock the client module so both resolve to a harmless stub. These
// tests exercise the workday decision, not any I/O.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateSupabaseClient(),
}));

import { OptimizedScheduler, MissingWorkdaysError } from '@/lib/scheduling/optimized-scheduler';

/**
 * SPE-275 / SPE-367: an empty workday list used to fail OPEN — it silently became
 * all five weekdays, so an itinerant provider got sessions on days they were at a
 * different school (observed in prod 2026-07-17: a Monday 08:00 session at a
 * Thursday/Friday-only site).
 *
 * The two empty cases are NOT the same, and conflating them is the whole risk here:
 *   - a single-school provider legitimately has no `user_site_schedules` rows, and
 *     all weekdays is the right answer — failing closed for them would break
 *     auto-scheduling for the majority of users;
 *   - a multi-school provider's empty list means we do not know where they are.
 *
 * These tests pin both directions.
 */
function makeScheduler(worksAtMultipleSchools: boolean, workSchedule: Array<{ day_of_week: number }>) {
  const scheduler = new OptimizedScheduler(
    'provider-1',
    'resource',
    false,
    worksAtMultipleSchools,
  ) as any;

  // initializeContext only touches these two collaborators before the workday
  // decision; stub both so the test stays on the decision itself.
  scheduler.dataManager = {
    isInitializedForSchool: () => true,
    initialize: async () => undefined,
  };
  scheduler.getDataFromManager = async () => ({
    workSchedule,
    bellSchedules: [],
    specialActivities: [],
    existingSessions: [],
    schoolHours: [],
    crossProviderSessionsByStudent: new Map(),
  });

  return scheduler;
}

describe('OptimizedScheduler work days (SPE-275 / SPE-367)', () => {
  describe('multi-school provider', () => {
    it('refuses to schedule when no work days are recorded for the school', async () => {
      const scheduler = makeScheduler(true, []);
      await expect(scheduler.initializeContext('Carquinez Middle', 'JSUSD'))
        .rejects.toBeInstanceOf(MissingWorkdaysError);
    });

    it('names the school on the error so the caller can skip just that one', async () => {
      const scheduler = makeScheduler(true, []);
      const err = await scheduler.initializeContext('Carquinez Middle', 'JSUSD').catch((e: any) => e);
      expect(err.schoolSite).toBe('Carquinez Middle');
      // The message is shown to the provider verbatim in the auto-schedule alert.
      expect(err.message).toContain('Carquinez Middle');
      expect(err.message).toContain('Work Schedule');
    });

    it('schedules normally when work days ARE recorded, using only those days', async () => {
      const scheduler = makeScheduler(true, [{ day_of_week: 4 }, { day_of_week: 5 }]);
      await scheduler.initializeContext('Carquinez Middle', 'JSUSD');
      expect(scheduler.context.workDays).toEqual([4, 5]);
    });
  });

  describe('single-school provider (must NOT regress)', () => {
    it('still defaults to all weekdays when no work days are recorded', async () => {
      const scheduler = makeScheduler(false, []);
      await scheduler.initializeContext('Rodeo Hills Elementary', 'JSUSD');
      expect(scheduler.context.workDays).toEqual([1, 2, 3, 4, 5]);
    });

    it('defaults to all weekdays by default, when the flag is not passed at all', async () => {
      // Guards the constructor default — a caller that predates the new argument
      // must keep its previous behaviour rather than start throwing.
      const scheduler = new OptimizedScheduler('provider-1', 'resource') as any;
      scheduler.dataManager = { isInitializedForSchool: () => true, initialize: async () => undefined };
      scheduler.getDataFromManager = async () => ({
        workSchedule: [], bellSchedules: [], specialActivities: [],
        existingSessions: [], schoolHours: [], crossProviderSessionsByStudent: new Map(),
      });

      await scheduler.initializeContext('Rodeo Hills Elementary', 'JSUSD');
      expect(scheduler.context.workDays).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('findStudentSlots defensive guard', () => {
    it('places nothing rather than assuming all weekdays on an empty context', () => {
      // Reaching this means a context was built by some path other than
      // initializeContext. A missing session is recoverable; a session on a day
      // the provider is at another school is not.
      const scheduler = new OptimizedScheduler('provider-1', 'resource', false, true) as any;
      scheduler.context = {
        schoolSite: 'Carquinez Middle',
        workDays: [],
        existingSessions: [],
      };

      const slots = scheduler.findStudentSlots(
        { initials: 'AB', grade_level: '3' },
        30,
        2,
      );
      expect(slots).toEqual([]);
    });
  });
});
