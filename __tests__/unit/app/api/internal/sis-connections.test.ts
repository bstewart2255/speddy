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
let profileRow: { data: unknown; error: unknown } = {
  data: { is_speddy_admin: true },
  error: null,
};

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
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = () => Promise.resolve(profileRow);
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
    profileRow = { data: { is_speddy_admin: true }, error: null };
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
      profileRow = { data: { is_speddy_admin: false }, error: null };
      const res = await GET(getReq());
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Forbidden: Speddy admin access required' });
      expect(listConnections).not.toHaveBeenCalled();
    });

    it('lets a staff caller list connections', async () => {
      const res = await GET(getReq());
      expect(res.status).toBe(200);
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
      profileRow = { data: { is_speddy_admin: false }, error: null };
      const res = await POST(postReq(validCreateBody));
      expect(res.status).toBe(403);
      expect(createConnection).not.toHaveBeenCalled();
    });

    it('lets a staff caller create a connection', async () => {
      const res = await POST(postReq(validCreateBody));
      expect(res.status).toBe(200);
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
