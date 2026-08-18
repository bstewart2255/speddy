/**
 * SPE-421 · POST /api/internal/create-admin-account — the staff gate.
 *
 * This route does not go through the shared `speddyAdminDenialReason`
 * helper — it duplicates its own inline `is_speddy_admin` check via a
 * service-role client it constructs itself. Same underlying hazard: no sim
 * persona is ever `is_speddy_admin` (docs/SIM_DISTRICT.md invariant 5), so
 * the allowed branch is unreachable through the sim district and a handler
 * test is the only coverage it will ever get.
 */
import { NextRequest } from 'next/server';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const NON_STAFF_ID = '22222222-2222-4222-8222-222222222222';
const NEW_USER_ID = '33333333-3333-4333-8333-333333333333';

let currentUserId: string | null = STAFF_ID;
// Keyed by profile id, so the mock only answers "is staff" for the id the
// route actually queried — a route that queried a hardcoded or wrong id
// would get an undefined/null row here, not a false pass.
const PROFILES: Record<string, { is_speddy_admin: boolean }> = {
  [STAFF_ID]: { is_speddy_admin: true },
  [NON_STAFF_ID]: { is_speddy_admin: false },
};
let profileErrorOverride: { data: unknown; error: unknown } | null = null;
const profilesEqSpy = jest.fn();

const createUser = jest.fn();
const deleteUser = jest.fn();
const rpc = jest.fn();

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

// This route builds its own service-role client via @supabase/supabase-js
// directly, rather than the app's lib/supabase/server wrapper.
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      admin: {
        createUser: (...args: unknown[]) => createUser(...args),
        deleteUser: (...args: unknown[]) => deleteUser(...args),
      },
    },
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => {
      let queriedId: string | null = null;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (col: string, val: string) => {
        if (table === 'profiles') {
          profilesEqSpy(col, val);
          if (col === 'id') queriedId = val;
        }
        return q;
      };
      q.update = () => q;
      q.insert = () => Promise.resolve({ error: null });
      q.maybeSingle = () => {
        if (table === 'profiles') return Promise.resolve({ data: null, error: null }); // no existing account
        return Promise.resolve({ data: null, error: null });
      };
      q.single = () => {
        if (table === 'profiles') {
          return Promise.resolve(
            profileErrorOverride ?? { data: (queriedId && PROFILES[queriedId]) ?? null, error: null }
          );
        }
        if (table === 'districts') return Promise.resolve({ data: { name: 'Metro USD' }, error: null });
        if (table === 'schools') return Promise.resolve({ data: { name: 'Lincoln Elementary' }, error: null });
        return Promise.resolve({ data: null, error: null });
      };
      return q;
    },
  }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { child: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }) },
}));

jest.mock('@/lib/utils/password-generator', () => ({
  generateTemporaryPassword: () => 'Temp1234!',
}));

import { POST } from '@/app/api/internal/create-admin-account/route';

const validBody = {
  email: 'new.admin@example.org',
  fullName: 'New Admin',
  adminType: 'district_admin',
  stateId: 'state-1',
  districtId: 'district-1',
};

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/internal/create-admin-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/internal/create-admin-account', () => {
  beforeEach(() => {
    currentUserId = STAFF_ID;
    profileErrorOverride = null;
    profilesEqSpy.mockClear();
    createUser.mockReset().mockResolvedValue({ data: { user: { id: NEW_USER_ID } }, error: null });
    deleteUser.mockReset().mockResolvedValue({ error: null });
    rpc.mockReset().mockResolvedValue({ error: null });
  });

  it('401s an unauthenticated caller without creating anything', async () => {
    currentUserId = null;
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('403s a non-staff caller without creating anything', async () => {
    currentUserId = NON_STAFF_ID;
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: Speddy admin access required' });
    expect(createUser).not.toHaveBeenCalled();
    expect(profilesEqSpy).toHaveBeenCalledWith('id', NON_STAFF_ID);
  });

  it('403s when the profile lookup itself errors (fail closed, not open)', async () => {
    profileErrorOverride = { data: null, error: { message: 'boom' } };
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('lets a staff caller create the account, queried by their own id', async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect(profilesEqSpy).toHaveBeenCalledWith('id', STAFF_ID);
    expect(createUser).toHaveBeenCalled();
    const body = await res.json();
    expect(body).toMatchObject({ success: true, userId: NEW_USER_ID });
  });

  it('rolls back the auth user when profile/permissions creation fails after a staff caller creates it', async () => {
    rpc.mockResolvedValue({ error: { message: 'rpc failed' } });
    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    expect(deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
  });
});
