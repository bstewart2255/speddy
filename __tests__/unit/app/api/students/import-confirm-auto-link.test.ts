/**
 * SPE-545 · the import-confirm route's auto-link trigger.
 *
 * Pins the wiring only (the runner has its own suite): a successful import
 * queues ONE post-response callback that runs the link sync per distinct
 * district as the importing provider; an import that writes nothing queues
 * nothing; and the response never waits on — or varies with — the sync.
 */
import type { NextRequest } from 'next/server';

// Capture after() callbacks instead of scheduling them, so the test controls
// when the post-response work runs.
const afterCallbacks: Array<() => Promise<void>> = [];
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

const mockRunAutoLinkSync = jest.fn();
jest.mock('@/lib/sis/auto-link-sync', () => ({
  runAutoLinkSync: (...a: unknown[]) => mockRunAutoLinkSync(...a),
}));

jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/lib/monitoring/analytics', () => ({ track: { event: jest.fn() } }));
jest.mock('@/lib/monitoring/performance-alerts', () => ({
  measurePerformanceWithAlerts: () => ({ end: jest.fn() }),
}));
jest.mock('@/lib/scheduling/session-requirement-sync', () => ({
  updateExistingSessionsForStudent: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('@/lib/api/rate-limit-user', () => ({
  checkUserRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

const PROVIDER_ID = '77777777-7777-4777-8777-777777777777';

/** Per-test control of the batched write's per-element results. */
let upsertResults: Array<{ success: boolean; error?: string }> = [];

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: PROVIDER_ID } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: async () => ({
            data: {
              school_id: 'sch-1',
              district_id: 'district-1',
              state_id: 'CA',
              school_site: 'Rodeo Vista Elementary',
            },
            error: null,
          }),
        };
        return chain;
      }
      if (table === 'students') {
        const chain = {
          select: () => chain,
          eq: async () => ({ data: [], error: null }),
          in: async () => ({ data: [], error: null }),
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (fn: string) => {
      if (fn === 'user_accessible_school_ids') {
        return { data: [{ school_id: 'sch-1' }], error: null };
      }
      if (fn === 'upsert_students_atomic') {
        return { data: { results: upsertResults }, error: null };
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  }),
  // The auto-link module is mocked above; nothing in this suite should reach
  // the service client.
  createServiceClient: () => {
    throw new Error('unexpected service client use');
  },
}));

import { POST } from '@/app/api/import-students/confirm/route';

const call = (students: unknown[]) =>
  POST(
    new Request('http://localhost/api/import-students/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students }),
    }) as unknown as NextRequest,
    { params: Promise.resolve({}) },
  );

const student = (initials: string, districtId: string | null = 'district-1') => ({
  action: 'insert',
  initials,
  firstName: 'Test',
  lastName: 'Student',
  gradeLevel: '7',
  schoolId: 'sch-1',
  districtId,
});

beforeEach(() => {
  jest.clearAllMocks();
  afterCallbacks.length = 0;
  upsertResults = [];
  mockRunAutoLinkSync.mockResolvedValue('applied');
});

describe('the auto-link trigger', () => {
  it('a successful import queues one post-response run per distinct district, as the provider', async () => {
    upsertResults = [{ success: true }, { success: true }];
    const res = await call([student('AB'), student('CD')]);
    expect(res.status).toBe(200);

    // Queued, not yet run — the response never waits on the SIS.
    expect(afterCallbacks).toHaveLength(1);
    expect(mockRunAutoLinkSync).not.toHaveBeenCalled();

    await afterCallbacks[0]();
    expect(mockRunAutoLinkSync).toHaveBeenCalledTimes(1);
    expect(mockRunAutoLinkSync).toHaveBeenCalledWith({
      districtId: 'district-1',
      trigger: 'import',
      actorId: PROVIDER_ID,
    });
  });

  it('an import where every row failed queues nothing', async () => {
    upsertResults = [{ success: false, error: 'duplicate key' }];
    const res = await call([student('AB')]);
    expect(res.status).toBe(200);
    expect(afterCallbacks).toHaveLength(0);
  });

  it('a row without its own district falls back to the provider’s profile district', async () => {
    upsertResults = [{ success: true }];
    const res = await call([{ ...student('AB', null), schoolId: 'sch-1' }]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary.inserted).toBe(1);
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(mockRunAutoLinkSync).toHaveBeenCalledWith(
      expect.objectContaining({ districtId: 'district-1' }),
    );
  });

  it('the import response is already complete before the sync ever runs', async () => {
    upsertResults = [{ success: true }];
    const res = await call([student('AB')]);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.summary.inserted).toBe(1);
    // Even a sync that fails outright cannot reach back into the response.
    mockRunAutoLinkSync.mockResolvedValue('failed');
    await afterCallbacks[0]();
    expect(mockRunAutoLinkSync).toHaveBeenCalled();
  });
});
