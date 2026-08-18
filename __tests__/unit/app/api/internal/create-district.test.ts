/**
 * SPE-421 · POST /api/internal/create-district — the staff gate.
 *
 * Same reason as create-admin-account.test.ts: this route duplicates its own
 * inline `is_speddy_admin` check via a service-role client it builds itself,
 * and the allowed branch is unreachable through the sim district (no sim
 * user is ever `is_speddy_admin`, docs/SIM_DISTRICT.md invariant 5).
 */
import { NextRequest } from 'next/server';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const NON_STAFF_ID = '22222222-2222-4222-8222-222222222222';

let currentUserId: string | null = STAFF_ID;
let profileResult: { data: unknown; error: unknown } = {
  data: { is_speddy_admin: true },
  error: null,
};

const insert = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        currentUserId
          ? { data: { user: { id: currentUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.insert = (rows: unknown) => {
        insert(table, rows);
        return Promise.resolve({ error: null });
      };
      q.single = () => {
        if (table === 'profiles') return Promise.resolve(profileResult);
        if (table === 'states') return Promise.resolve({ data: { id: 'state-1', name: 'California' }, error: null });
        return Promise.resolve({ data: null, error: null });
      };
      return q;
    },
  }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { child: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }) },
}));

import { POST } from '@/app/api/internal/create-district/route';

const validBody = { name: 'Metro USD', stateId: 'state-1' };

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/internal/create-district', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/internal/create-district', () => {
  beforeEach(() => {
    currentUserId = STAFF_ID;
    profileResult = { data: { is_speddy_admin: true }, error: null };
    insert.mockClear();
  });

  it('401s an unauthenticated caller without creating anything', async () => {
    currentUserId = null;
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  it('403s a non-staff caller without creating anything', async () => {
    currentUserId = NON_STAFF_ID;
    profileResult = { data: { is_speddy_admin: false }, error: null };
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: Speddy admin access required' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('lets a staff caller create the district', async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith('districts', expect.objectContaining({ name: 'Metro USD' }));
    const body = await res.json();
    expect(body).toMatchObject({ success: true, name: 'Metro USD' });
  });
});
