/**
 * SPE-421 · GET /api/internal/sign-in-logs — the staff gate.
 *
 * Unlike sis-connections/dpa, this route does not go through the shared
 * `speddyAdminDenialReason` helper — it duplicates its own inline
 * `is_speddy_admin` check. Same underlying hazard either way: the allowed
 * branch is unreachable through the sim district (no sim user is ever
 * `is_speddy_admin`, docs/SIM_DISTRICT.md invariant 5), so this is the only
 * coverage either branch will ever get.
 */
import { NextRequest } from 'next/server';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const NON_STAFF_ID = '22222222-2222-4222-8222-222222222222';

let currentUserId: string | null = STAFF_ID;
let profileResult: { data: unknown; error: unknown } = {
  data: { is_speddy_admin: true },
  error: null,
};
let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        currentUserId
          ? { data: { user: { id: currentUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.single = () => Promise.resolve(profileResult);
      return q;
    },
  }),
  createServiceClient: () => ({
    rpc: () => Promise.resolve(rpcResult),
  }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { child: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }) },
}));

import { GET } from '@/app/api/internal/sign-in-logs/route';

const req = () => new NextRequest('http://localhost/api/internal/sign-in-logs');

describe('GET /api/internal/sign-in-logs', () => {
  beforeEach(() => {
    currentUserId = STAFF_ID;
    profileResult = { data: { is_speddy_admin: true }, error: null };
    rpcResult = {
      data: [
        {
          id: 'evt-1',
          user_id: 'u-1',
          email: 'someone@example.org',
          full_name: 'Someone',
          role: 'resource',
          provider: 'email',
          created_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      error: null,
    };
  });

  it('401s an unauthenticated caller', async () => {
    currentUserId = null;
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('403s a non-staff caller', async () => {
    currentUserId = NON_STAFF_ID;
    profileResult = { data: { is_speddy_admin: false }, error: null };
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: Speddy admin access required' });
  });

  it('403s when the profile lookup itself errors (fail closed, not open)', async () => {
    profileResult = { data: null, error: { message: 'boom' } };
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it('answers a staff caller with the sign-in logs', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0]).toMatchObject({ userId: 'u-1', email: 'someone@example.org' });
  });
});
