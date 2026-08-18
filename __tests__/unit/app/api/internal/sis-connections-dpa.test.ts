/**
 * SPE-421 · PATCH /api/internal/sis-connections/[connectionId]/dpa — the
 * highest-value route behind the staff gate: it decides whether a district
 * may store SIS credentials at all, and revoking deletes stored credentials.
 *
 * Same reason as sis-key-health.test.ts (SPE-420) for why this can only be
 * pinned by a handler test: no sim persona is ever `is_speddy_admin`
 * (docs/SIM_DISTRICT.md invariant 5), so the allowed branch of
 * `speddyAdminDenialReason` is unreachable through the sim district. A
 * district's own tech admin must not be able to clear their own DPA — that
 * is exactly the branch a handler test is the only way to pin.
 */
import { NextRequest } from 'next/server';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const NON_STAFF_ID = '22222222-2222-4222-8222-222222222222';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

let currentUserId: string | null = STAFF_ID;
// Keyed by profile id, so the mock only answers "is staff" for the id the
// route actually queried — a route that queried a hardcoded or wrong id
// would get an undefined/null row here, not a false pass.
const PROFILES: Record<string, { is_speddy_admin: boolean }> = {
  [STAFF_ID]: { is_speddy_admin: true },
  [NON_STAFF_ID]: { is_speddy_admin: false },
};
const profilesEqSpy = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        currentUserId
          ? { data: { user: { id: currentUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({
    from: () => {
      let queriedId: string | null = null;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (col: string, val: string) => {
        profilesEqSpy(col, val);
        if (col === 'id') queriedId = val;
        return q;
      };
      q.maybeSingle = () =>
        Promise.resolve({ data: (queriedId && PROFILES[queriedId]) ?? null, error: null });
      return q;
    },
  }),
}));

const setDpaCleared = jest.fn();
const getConnection = jest.fn();

jest.mock('@/lib/sis/connections', () => ({
  SIS_CONNECTION_NOT_FOUND: 'SIS connection not found',
  setDpaCleared: (...args: unknown[]) => setDpaCleared(...args),
  getConnection: (...args: unknown[]) => getConnection(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: { child: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }) },
}));

import { PATCH } from '@/app/api/internal/sis-connections/[connectionId]/dpa/route';

const req = (cleared: boolean) =>
  new NextRequest(`http://localhost/api/internal/sis-connections/${CONNECTION_ID}/dpa`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cleared }),
  });

const call = (cleared: boolean) =>
  PATCH(req(cleared), { params: Promise.resolve({ connectionId: CONNECTION_ID }) });

describe('PATCH /api/internal/sis-connections/[connectionId]/dpa', () => {
  beforeEach(() => {
    currentUserId = STAFF_ID;
    profilesEqSpy.mockClear();
    setDpaCleared.mockReset().mockResolvedValue(undefined);
    getConnection.mockReset().mockResolvedValue({ id: CONNECTION_ID, dpa_cleared: true });
  });

  it('401s an unauthenticated caller without touching the DPA', async () => {
    currentUserId = null;
    const res = await call(true);
    expect(res.status).toBe(401);
    expect(setDpaCleared).not.toHaveBeenCalled();
  });

  it('403s a non-staff caller (e.g. the district\'s own tech admin) without touching the DPA', async () => {
    currentUserId = NON_STAFF_ID;
    const res = await call(true);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: Speddy admin access required' });
    expect(setDpaCleared).not.toHaveBeenCalled();
    expect(profilesEqSpy).toHaveBeenCalledWith('id', NON_STAFF_ID);
  });

  it('lets a staff caller clear the DPA, queried by their own id, opening credential intake', async () => {
    const res = await call(true);
    expect(res.status).toBe(200);
    expect(profilesEqSpy).toHaveBeenCalledWith('id', STAFF_ID);
    expect(setDpaCleared).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      actorId: STAFF_ID,
      cleared: true,
    });
    expect(await res.json()).toEqual({ connection: { id: CONNECTION_ID, dpa_cleared: true } });
  });

  it('lets a staff caller revoke the DPA (the destructive path)', async () => {
    const res = await call(false);
    expect(res.status).toBe(200);
    expect(setDpaCleared).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      actorId: STAFF_ID,
      cleared: false,
    });
  });

  it('404s when the connection does not exist', async () => {
    setDpaCleared.mockRejectedValue(new Error('SIS connection not found'));
    const res = await call(true);
    expect(res.status).toBe(404);
  });

  it('reports success even when the post-write read-back fails, rather than a false failure', async () => {
    getConnection.mockRejectedValue(new Error('read-back failed'));
    const res = await call(true);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connection: null });
  });
});
