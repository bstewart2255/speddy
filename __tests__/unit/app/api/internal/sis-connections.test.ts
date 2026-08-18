/**
 * SPE-421 · GET+POST /api/internal/sis-connections — the staff gate.
 *
 * Same reason as sis-key-health.test.ts (SPE-420): the allowed branch behind
 * `speddyAdminDenialReason` can only ever be walked with a real session — no
 * sim persona is ever `is_speddy_admin` (docs/SIM_DISTRICT.md invariant 5) —
 * so a handler test is the only coverage either branch will ever have.
 *
 * What is pinned: both routes 401 with no session, 403 a non-staff caller
 * without touching `lib/sis/connections`, and a staff caller reaches the
 * underlying list/create call and gets its result back.
 */
import { NextRequest } from 'next/server';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const NON_STAFF_ID = '22222222-2222-4222-8222-222222222222';
const DISTRICT_ID = '33333333-3333-4333-8333-333333333333';

let currentUserId: string | null = STAFF_ID;
// Keyed by profile id, so the mock only answers "is staff" for the id the
// route actually queried — a route that queried a hardcoded or wrong id
// would get an undefined/null row here, not a false pass (SPE-421 Codex
// review: a no-op `.eq` mock can't catch that class of bug).
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

const listConnections = jest.fn();
const createConnection = jest.fn();

jest.mock('@/lib/sis/connections', () => ({
  listConnections: (...args: unknown[]) => listConnections(...args),
  createConnection: (...args: unknown[]) => createConnection(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: { child: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }) },
}));

import { GET, POST } from '@/app/api/internal/sis-connections/route';

const getReq = () =>
  new NextRequest(`http://localhost/api/internal/sis-connections?districtId=${DISTRICT_ID}`);

const postReq = (body: unknown) =>
  new NextRequest('http://localhost/api/internal/sis-connections', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const validCreateBody = {
  districtId: DISTRICT_ID,
  sisType: 'aeries',
  baseUrl: 'https://sis.example.org',
  tokenUrl: 'https://sis.example.org/token',
};

describe('GET/POST /api/internal/sis-connections', () => {
  beforeEach(() => {
    currentUserId = STAFF_ID;
    profilesEqSpy.mockClear();
    listConnections.mockReset().mockResolvedValue([{ id: 'conn-1' }]);
    createConnection.mockReset().mockResolvedValue({ id: 'conn-1' });
  });

  describe('GET', () => {
    it('401s an unauthenticated caller', async () => {
      currentUserId = null;
      const res = await GET(getReq());
      expect(res.status).toBe(401);
      expect(listConnections).not.toHaveBeenCalled();
    });

    it('403s a non-staff caller without calling listConnections', async () => {
      currentUserId = NON_STAFF_ID;
      const res = await GET(getReq());
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Forbidden: Speddy admin access required' });
      expect(listConnections).not.toHaveBeenCalled();
      expect(profilesEqSpy).toHaveBeenCalledWith('id', NON_STAFF_ID);
    });

    it('lets a staff caller list connections, queried by their own id', async () => {
      const res = await GET(getReq());
      expect(res.status).toBe(200);
      expect(profilesEqSpy).toHaveBeenCalledWith('id', STAFF_ID);
      expect(listConnections).toHaveBeenCalledWith(DISTRICT_ID);
      expect(await res.json()).toEqual({ connections: [{ id: 'conn-1' }] });
    });
  });

  describe('POST', () => {
    it('401s an unauthenticated caller', async () => {
      currentUserId = null;
      const res = await POST(postReq(validCreateBody));
      expect(res.status).toBe(401);
      expect(createConnection).not.toHaveBeenCalled();
    });

    it('403s a non-staff caller without calling createConnection', async () => {
      currentUserId = NON_STAFF_ID;
      const res = await POST(postReq(validCreateBody));
      expect(res.status).toBe(403);
      expect(createConnection).not.toHaveBeenCalled();
      expect(profilesEqSpy).toHaveBeenCalledWith('id', NON_STAFF_ID);
    });

    it('lets a staff caller create a connection, queried by their own id', async () => {
      const res = await POST(postReq(validCreateBody));
      expect(res.status).toBe(200);
      expect(profilesEqSpy).toHaveBeenCalledWith('id', STAFF_ID);
      expect(createConnection).toHaveBeenCalledWith(
        expect.objectContaining({ districtId: DISTRICT_ID, sisType: 'aeries', actorId: STAFF_ID })
      );
      expect(await res.json()).toEqual({ connection: { id: 'conn-1' } });
    });

    it('rejects an http:// baseUrl even for a staff caller (credentials-on-the-wire guard)', async () => {
      const res = await POST(postReq({ ...validCreateBody, baseUrl: 'http://sis.example.org' }));
      expect(res.status).toBe(400);
      expect(createConnection).not.toHaveBeenCalled();
    });
  });
});
