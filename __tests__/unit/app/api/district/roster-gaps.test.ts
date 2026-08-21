/**
 * SPE-587 · GET /api/district/roster-gaps — who may ask which of a district's
 * published students reach no provider.
 *
 * Same posture as the roster-import suite: the load-bearing assertions are that
 * nothing reads a district's children unless a district admin, in their OWN
 * district, asked. `district_tech` is refused on purpose — this response carries
 * student names, grades and schools across every school in the district, well
 * outside that role's integrations-only line (SPE-393) — and the district is
 * never taken from the request.
 *
 * All data is fictional.
 */
import { NextRequest } from 'next/server';

const ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const DISTRICT_ID = '0618990';
const OTHER_DISTRICT = '0761754';

let currentUserId: string | null = ADMIN_ID;
/** Whether the grant re-check finds a district_admin row for a tech-role caller. */
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

jest.mock('@/lib/logger', () => {
  const noop = () => {};
  const fake = { info: noop, warn: noop, error: noop, debug: noop, child: () => fake };
  return { logger: fake };
});

const mockResolveCaller = jest.fn();
jest.mock('@/lib/api/district-sis-caller', () => ({
  resolveDistrictSisCaller: (...a: unknown[]) => mockResolveCaller(...a),
}));

// The two functions that reach the database. Both read; neither writes.
const mockGaps = jest.fn();
const mockPublishedAt = jest.fn();
jest.mock('@/lib/district-roster/gaps-io', () => ({
  loadRosterGaps: (...a: unknown[]) => mockGaps(...a),
  loadLastPublishedAt: (...a: unknown[]) => mockPublishedAt(...a),
}));

import { GET } from '@/app/api/district/roster-gaps/route';

const EMPTY_GAPS = {
  totalOnRoster: 0,
  totalUnserved: 0,
  countsByKind: {
    'case-manager-cannot-serve': 0,
    'case-manager-at-another-school': 0,
    'case-manager-not-in-speddy': 0,
    'awaiting-provider-claim': 0,
    'no-case-manager': 0,
  },
  groups: [],
};

const call = () => {
  const request = {
    url: 'http://localhost/api/district/roster-gaps',
    method: 'GET',
    nextUrl: { pathname: '/api/district/roster-gaps', searchParams: new URLSearchParams() },
    headers: new Headers(),
  } as unknown as NextRequest;

  return GET(request, { params: Promise.resolve({}) });
};

beforeEach(() => {
  jest.clearAllMocks();
  currentUserId = ADMIN_ID;
  holdsAdminGrant = false;
  mockResolveCaller.mockResolvedValue({ ok: true, districtId: DISTRICT_ID, role: 'district_admin' });
  mockGaps.mockResolvedValue(EMPTY_GAPS);
  mockPublishedAt.mockResolvedValue(null);
});

describe('who may read a district’s roster gaps', () => {
  it('answers a district admin for their own district, and only that one', async () => {
    const res = await call();

    expect(res.status).toBe(200);
    expect(mockGaps).toHaveBeenCalledWith(DISTRICT_ID);
    expect(mockGaps).not.toHaveBeenCalledWith(OTHER_DISTRICT);
  });

  it('refuses a signed-out caller before reading anything', async () => {
    currentUserId = null;

    const res = await call();

    expect(res.status).toBe(401);
    expect(mockGaps).not.toHaveBeenCalled();
  });

  it('refuses a caller with no district grant', async () => {
    mockResolveCaller.mockResolvedValue({ ok: false, denied: 'no-grant' });

    const res = await call();

    expect(res.status).toBe(403);
    expect(mockGaps).not.toHaveBeenCalled();
  });

  it('refuses district_tech — student PII is outside the integrations role', async () => {
    mockResolveCaller.mockResolvedValue({ ok: true, districtId: DISTRICT_ID, role: 'district_tech' });
    holdsAdminGrant = false;

    const res = await call();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'Forbidden: the district roster is for district admins.',
    });
    expect(mockGaps).not.toHaveBeenCalled();
  });

  it('admits a tech-role caller who also holds a district_admin grant', async () => {
    mockResolveCaller.mockResolvedValue({ ok: true, districtId: DISTRICT_ID, role: 'district_tech' });
    holdsAdminGrant = true;

    const res = await call();

    expect(res.status).toBe(200);
    expect(mockGaps).toHaveBeenCalledWith(DISTRICT_ID);
  });
});

describe('what the answer carries', () => {
  it('returns the gaps and when the district last published', async () => {
    mockGaps.mockResolvedValue({ ...EMPTY_GAPS, totalOnRoster: 221, totalUnserved: 51 });
    mockPublishedAt.mockResolvedValue('2026-08-21T18:45:36.886Z');

    const body = await (await call()).json();

    expect(body.gaps).toMatchObject({ totalOnRoster: 221, totalUnserved: 51 });
    expect(body.lastPublishedAt).toBe('2026-08-21T18:45:36.886Z');
  });

  it('still answers for a district that has never published', async () => {
    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gaps: EMPTY_GAPS, lastPublishedAt: null });
  });
});
