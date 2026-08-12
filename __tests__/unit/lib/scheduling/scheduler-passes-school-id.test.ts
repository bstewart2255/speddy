// Aliased with a `mock` prefix so the jest.mock factory (hoisted above imports by
// babel-plugin-jest-hoist) may reference it.
import { createMockSupabaseClient as mockCreateSupabaseClient } from '@/test-utils/supabase-test-helpers';

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateSupabaseClient(),
}));

import { OptimizedScheduler } from '@/lib/scheduling/optimized-scheduler';

/**
 * SPE-463: the auto-scheduler used to hardcode `undefined` for school_id when
 * initializing the data manager. The manager then filtered bell schedules and
 * special activities by `school_site`, which is NULL on every row written since
 * the school_id migration — so the auto-scheduler loaded ZERO blocks at
 * Bancroft, Mt. Diablo and Rodeo Hills (363 rows between them, all rendering
 * fine in the UI) and would place a session straight through a grade's lunch.
 *
 * This is a mock-level test on purpose: it pins the argument handoff, which is
 * where the bug lived. Whether the database then returns the right rows is not
 * something a mocked client can tell us — that was verified separately against
 * prod under a real RLS-enforced session.
 */
function makeScheduler() {
  const initializeCalls: Array<{ schoolSite: string; schoolDistrict: string; schoolId?: string }> = [];
  const isInitializedForSchoolCalls: Array<{ schoolSite: string; schoolDistrict?: string; schoolId?: string }> = [];

  const scheduler = new OptimizedScheduler('provider-1', 'resource', false, false) as any;

  scheduler.dataManager = {
    isInitializedForSchool: (schoolSite: string, schoolDistrict?: string, schoolId?: string) => {
      isInitializedForSchoolCalls.push({ schoolSite, schoolDistrict, schoolId });
      return false; // force initialize() to run
    },
    initialize: async (
      _providerId: string,
      schoolSite: string,
      schoolDistrict: string,
      schoolId?: string,
    ) => {
      initializeCalls.push({ schoolSite, schoolDistrict, schoolId });
    },
  };
  scheduler.getDataFromManager = async () => ({
    workSchedule: [{ day_of_week: 1 }],
    bellSchedules: [],
    specialActivities: [],
    existingSessions: [],
    schoolHours: [],
    crossProviderSessionsByStudent: new Map(),
  });

  return { scheduler, initializeCalls, isInitializedForSchoolCalls };
}

describe('OptimizedScheduler.initializeContext school_id handoff (SPE-463)', () => {
  it('passes school_id through to the data manager', async () => {
    const { scheduler, initializeCalls } = makeScheduler();

    await scheduler.initializeContext('Rodeo Hills Elementary', 'JSUSD', '061899002301');

    expect(initializeCalls).toHaveLength(1);
    expect(initializeCalls[0].schoolId).toBe('061899002301');
  });

  it('includes school_id in the already-initialized check, so a school_id-less cache is not reused', async () => {
    const { scheduler, isInitializedForSchoolCalls } = makeScheduler();

    await scheduler.initializeContext('Rodeo Hills Elementary', 'JSUSD', '061899002301');

    expect(isInitializedForSchoolCalls).toHaveLength(1);
    expect(isInitializedForSchoolCalls[0].schoolId).toBe('061899002301');
  });

  it('still works when no school_id is available, rather than throwing', async () => {
    const { scheduler, initializeCalls } = makeScheduler();

    await scheduler.initializeContext('Rodeo Hills Elementary', 'JSUSD');

    expect(initializeCalls).toHaveLength(1);
    expect(initializeCalls[0].schoolId).toBeUndefined();
  });
});
