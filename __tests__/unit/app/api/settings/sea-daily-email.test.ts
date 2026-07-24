/**
 * SPE-320 · POST /api/settings/sea-daily-email — authorization matrix.
 *
 * A resource specialist may toggle daily schedule emails only for an SEA who
 * shares their school (site + district). All checks are server-side and never
 * trust client-supplied school values; the cross-profile write uses the service
 * client. These tests pin: non-resource caller → 403, cross-school → 403,
 * sea-as-caller → 403, and the happy path updates the target and returns state.
 */
import { NextRequest } from 'next/server';

const CALLER_ID = '11111111-1111-4111-8111-111111111111'; // resource
const SEA_ID = '22222222-2222-4222-8222-222222222222'; // target sea
const SEA_CALLER_ID = '33333333-3333-4333-8333-333333333333';

const SCHOOL_A = { school_site: 'Lincoln', school_district: 'Metro' };
const SCHOOL_B = { school_site: 'Washington', school_district: 'Metro' };

// --- Controllable mock state ---
let currentUserId = CALLER_ID;
let singleQueue: Array<{ data: any; error: any }> = [];
let providerSchoolsResult: { data: any[]; error: any } = { data: [], error: null };
let updateResult: { error: any } = { error: null };
let lastUpdateValues: any = null;

function profilesQuery() {
  const state: any = { isUpdate: false, id: null, values: null };
  const q: any = {
    select: () => q,
    update: (vals: any) => {
      state.isUpdate = true;
      state.values = vals;
      lastUpdateValues = vals;
      return q;
    },
    eq: (col: string, val: unknown) => {
      if (col === 'id') state.id = val;
      return q;
    },
    single: () => {
      if (state.isUpdate) {
        if (updateResult.error) return Promise.resolve({ data: null, error: updateResult.error });
        return Promise.resolve({
          data: { id: state.id, daily_schedule_email_enabled: state.values.daily_schedule_email_enabled },
          error: null,
        });
      }
      return Promise.resolve(singleQueue.shift() ?? { data: null, error: { message: 'exhausted' } });
    },
  };
  return q;
}

function providerSchoolsQuery() {
  const q: any = {
    select: () => q,
    eq: () => Promise.resolve(providerSchoolsResult),
  };
  return q;
}

const mockFrom = jest.fn((table: string) =>
  table === 'provider_schools' ? providerSchoolsQuery() : profilesQuery()
);

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: currentUserId } }, error: null }) },
  }),
  createServiceClient: () => ({ from: mockFrom }),
}));

import { POST } from '@/app/api/settings/sea-daily-email/route';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/settings/sea-daily-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ok = (data: any) => ({ data, error: null });

describe('POST /api/settings/sea-daily-email', () => {
  beforeEach(() => {
    currentUserId = CALLER_ID;
    singleQueue = [];
    providerSchoolsResult = { data: [], error: null };
    updateResult = { error: null };
    lastUpdateValues = null;
    mockFrom.mockClear();
  });

  it('403s a non-resource caller', async () => {
    singleQueue = [ok({ id: CALLER_ID, role: 'speech', ...SCHOOL_A })];
    const res = await POST(req({ seaId: SEA_ID, enabled: true }));
    expect(res.status).toBe(403);
    expect(lastUpdateValues).toBeNull();
  });

  it('403s an SEA caller (only resource specialists may toggle)', async () => {
    currentUserId = SEA_CALLER_ID;
    singleQueue = [ok({ id: SEA_CALLER_ID, role: 'sea', ...SCHOOL_A })];
    const res = await POST(req({ seaId: SEA_ID, enabled: true }));
    expect(res.status).toBe(403);
    expect(lastUpdateValues).toBeNull();
  });

  it('403s when the target SEA is at a different school (cross-school)', async () => {
    singleQueue = [
      ok({ id: CALLER_ID, role: 'resource', works_at_multiple_schools: false, ...SCHOOL_A }),
      ok({ id: SEA_ID, role: 'sea', ...SCHOOL_B }),
    ];
    const res = await POST(req({ seaId: SEA_ID, enabled: true }));
    expect(res.status).toBe(403);
    expect(lastUpdateValues).toBeNull();
  });

  it('403s when the target is not an SEA', async () => {
    singleQueue = [
      ok({ id: CALLER_ID, role: 'resource', works_at_multiple_schools: false, ...SCHOOL_A }),
      ok({ id: SEA_ID, role: 'resource', ...SCHOOL_A }),
    ];
    const res = await POST(req({ seaId: SEA_ID, enabled: true }));
    expect(res.status).toBe(403);
    expect(lastUpdateValues).toBeNull();
  });

  it('updates the target and returns state on the happy path', async () => {
    singleQueue = [
      ok({ id: CALLER_ID, role: 'resource', works_at_multiple_schools: false, ...SCHOOL_A }),
      ok({ id: SEA_ID, role: 'sea', ...SCHOOL_A }),
    ];
    const res = await POST(req({ seaId: SEA_ID, enabled: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ seaId: SEA_ID, enabled: true });
    expect(lastUpdateValues).toEqual({ daily_schedule_email_enabled: true });
  });

  it('authorizes a multi-school RS via provider_schools', async () => {
    singleQueue = [
      // Primary profile school is A, but the SEA is at school B (a secondary site).
      ok({ id: CALLER_ID, role: 'resource', works_at_multiple_schools: true, ...SCHOOL_A }),
      ok({ id: SEA_ID, role: 'sea', ...SCHOOL_B }),
    ];
    providerSchoolsResult = { data: [SCHOOL_A, SCHOOL_B], error: null };
    const res = await POST(req({ seaId: SEA_ID, enabled: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ seaId: SEA_ID, enabled: false });
    expect(lastUpdateValues).toEqual({ daily_schedule_email_enabled: false });
  });

  it('400s on an invalid body', async () => {
    const res = await POST(req({ seaId: 'not-a-uuid', enabled: 'yes' }));
    expect(res.status).toBe(400);
  });
});
