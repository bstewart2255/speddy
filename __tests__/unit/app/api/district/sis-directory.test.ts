/**
 * SPE-436 · GET /api/district/sis-directory — the gate, and what a refused
 * caller does NOT set in motion.
 *
 * Same posture as the internal test route's suite (SPE-427): the load-bearing
 * assertion is never the status code alone — it is that **no request reaches
 * the district's SIS** unless an entitled caller, in their own district, with
 * a stored credential, asked for a directory page.
 */
import { NextRequest } from 'next/server';
import type { DirectoryPage } from '@/lib/sis/oneroster-directory';

const ADMIN_ID = '44444444-4444-4444-8444-444444444444';
const DISTRICT_ID = '0618990';

let currentUserId: string | null = ADMIN_ID;
/** Whether the grant lookup finds a district_admin row for a tech-role caller. */
let holdsAdminGrant = false;

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
      q.limit = () => q;
      q.maybeSingle = () =>
        Promise.resolve({ data: holdsAdminGrant ? { id: 'grant-1' } : null, error: null });
      return q;
    },
  }),
}));

jest.mock('@/lib/api/rate-limit-user', () => ({
  checkUserRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

const mockResolveCaller = jest.fn();
jest.mock('@/lib/api/district-sis-caller', () => ({
  resolveDistrictSisCaller: (...a: unknown[]) => mockResolveCaller(...a),
}));

const mockListConnections = jest.fn();
const mockGetCredential = jest.fn();
jest.mock('@/lib/sis/connections', () => ({
  ...jest.requireActual('@/lib/sis/connections'),
  listConnections: (...a: unknown[]) => mockListConnections(...a),
  getDecryptedCredential: (...a: unknown[]) => mockGetCredential(...a),
}));

const mockFetchPage = jest.fn();
jest.mock('@/lib/sis/oneroster-directory', () => ({
  ...jest.requireActual('@/lib/sis/oneroster-directory'),
  fetchDirectoryPage: (...a: unknown[]) => mockFetchPage(...a),
}));

import { GET } from '@/app/api/district/sis-directory/route';

const CONNECTION = {
  id: 'conn-1',
  district_id: DISTRICT_ID,
  sis_type: 'oneroster',
  base_url: 'https://district.aeries.net/admin',
  token_url: 'https://district.aeries.net/admin/token',
};

const PAGE: DirectoryPage = {
  area: 'teachers',
  rows: [
    {
      sourcedId: 't-1',
      name: 'Dana Alvarez',
      email: 'd@example.org',
      identifier: 'S1',
      grades: [],
      schools: [],
    },
  ],
  offset: 0,
  pageFull: false,
  stats: [{ label: 'Teachers listed', n: 1 }],
};

const call = (qs = 'area=teachers') =>
  GET(new NextRequest(`http://localhost/api/district/sis-directory?${qs}`), {
    params: Promise.resolve({}),
  });

const sisWasDialled = () => mockFetchPage.mock.calls.length > 0;

beforeEach(() => {
  jest.clearAllMocks();
  currentUserId = ADMIN_ID;
  holdsAdminGrant = false;
  mockResolveCaller.mockResolvedValue({ ok: true, districtId: DISTRICT_ID, role: 'district_admin' });
  mockListConnections.mockResolvedValue([CONNECTION]);
  mockGetCredential.mockResolvedValue({
    sisType: 'oneroster',
    clientId: 'consumer-id',
    clientSecret: 'consumer-secret',
  });
  mockFetchPage.mockResolvedValue(PAGE);
});

describe('the gate', () => {
  it('401s an unauthenticated caller, and dials nothing', async () => {
    currentUserId = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(sisWasDialled()).toBe(false);
  });

  it('403s a caller with no district grant, and dials nothing', async () => {
    mockResolveCaller.mockResolvedValue({ ok: false, denied: 'no grant' });
    const res = await call();
    expect(res.status).toBe(403);
    expect(sisWasDialled()).toBe(false);
    expect(mockGetCredential).not.toHaveBeenCalled();
  });

  it('403s a district_tech caller — SPE-393: tech has no right to student data', async () => {
    // The shared seam admits tech for connection MANAGEMENT. Reused unchecked
    // here it would have served student names, IDs and grades to the role the
    // permission model explicitly keeps out of them (Codex, PR #830).
    mockResolveCaller.mockResolvedValue({
      ok: true,
      districtId: DISTRICT_ID,
      role: 'district_tech',
    });

    const res = await call();

    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/district admins/i);
    expect(sisWasDialled()).toBe(false);
    expect(mockGetCredential).not.toHaveBeenCalled();
  });

  it('admits a caller the seam REPORTS as tech who also holds the admin grant', async () => {
    // resolveDistrictSisCaller prefers the tech role when both are held; the
    // extra grant lookup keeps that person from being wrongly refused.
    mockResolveCaller.mockResolvedValue({
      ok: true,
      districtId: DISTRICT_ID,
      role: 'district_tech',
    });
    holdsAdminGrant = true;

    const res = await call();
    expect(res.status).toBe(200);
  });

  it('the district comes from the caller grants — the request cannot name one', async () => {
    // A hostile query string naming another district changes nothing: the
    // route never reads a district from the request at all.
    await call('area=teachers&districtId=9999999');
    expect(mockListConnections).toHaveBeenCalledWith(DISTRICT_ID);
  });

  it('rejects an unknown area before doing anything', async () => {
    const res = await call('area=enrollments');
    expect(res.status).toBe(400);
    expect(sisWasDialled()).toBe(false);
  });
});

describe('setup states', () => {
  it('409s with setup guidance when no OneRoster connection exists', async () => {
    mockListConnections.mockResolvedValue([]);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/tech portal/i);
    expect(sisWasDialled()).toBe(false);
  });

  it('409s when no credential is stored', async () => {
    mockGetCredential.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(409);
    expect(sisWasDialled()).toBe(false);
  });

  it('a credential that cannot be DECRYPTED is a 500 with re-save guidance, not setup advice', async () => {
    // "No credentials stored yet" about credentials that exist would send the
    // admin to re-enter what a key rotation broke (CodeRabbit, PR #830).
    mockGetCredential.mockRejectedValue(new Error('bad ciphertext'));
    const res = await call();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/re-save/i);
    expect(sisWasDialled()).toBe(false);
  });
});

describe('the page it serves', () => {
  it('passes the picked page through, with the stored addresses and the query offset', async () => {
    const res = await call('area=teachers&offset=200');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(PAGE);
    expect(mockFetchPage).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: CONNECTION.base_url,
        tokenUrl: CONNECTION.token_url,
        area: 'teachers',
        offset: 200,
      }),
    );
  });

  it('turns a fetch failure into "run the connection test", never a stack trace', async () => {
    mockFetchPage.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:443'));
    const res = await call();
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(text).toMatch(/connection test/i);
    expect(text).not.toContain('ECONNREFUSED');
  });

  it('never returns the credential, anywhere in the body', async () => {
    const text = await (await call()).text();
    expect(text).not.toContain('consumer-secret');
    expect(text).not.toContain('consumer-id');
  });
});
