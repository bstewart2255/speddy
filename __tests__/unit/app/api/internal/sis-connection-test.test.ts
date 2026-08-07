/**
 * SPE-427 · POST /api/internal/sis-connections/[connectionId]/test — the staff
 * gate, and what a refused caller does NOT set in motion.
 *
 * Why a handler test rather than a sim-district walk: the allowed branch cannot
 * be walked. `docs/SIM_DISTRICT.md` invariant 5 states "No sim user is ever
 * `is_speddy_admin`", so no persona can ever reach the staff side of this route
 * through the UI. This is the only coverage that branch will ever have.
 *
 * The load-bearing assertion is not the 403 — it is that **no request reaches
 * the district's SIS** when the caller is refused. This route exists to let
 * Speddy staff use a district's stored credential against that district's
 * server; a gate that returned 403 *after* firing the probes would be a gate in
 * name only, and the status code alone cannot tell the two apart.
 *
 * `speddyAdminDenialReason` returns null for allowed and a string for denied.
 * Its own docstring records that the obvious reading of that inverts the guard
 * and lets everyone through silently. Middleware cannot catch the inversion —
 * middleware.ts's matcher excludes `api` — so this layer is the only one that
 * would.
 */
import { NextRequest } from 'next/server';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const NON_STAFF_ID = '22222222-2222-4222-8222-222222222222';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';
const CERT = 'aeriescert00000000000000000000ab';

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

// Rate limiting writes to the database; it is not what this file is about.
jest.mock('@/lib/api/rate-limit-user', () => ({
  checkUserRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

const mockGetConnection = jest.fn();
const mockGetCredential = jest.fn();
const mockRecordTestResult = jest.fn();
jest.mock('@/lib/sis/connections', () => ({
  ...jest.requireActual('@/lib/sis/connections'),
  getConnection: (...a: unknown[]) => mockGetConnection(...a),
  getDecryptedCredential: (...a: unknown[]) => mockGetCredential(...a),
  recordTestResult: (...a: unknown[]) => mockRecordTestResult(...a),
}));

// These are the functions that actually dial the district's server. Counting
// their calls is how "nothing reached the SIS" becomes an assertion rather than
// an assumption.
const mockAeriesTest = jest.fn();
jest.mock('@/lib/sis/aeries-setup', () => ({
  ...jest.requireActual('@/lib/sis/aeries-setup'),
  runAeriesConnectionTest: (...a: unknown[]) => mockAeriesTest(...a),
}));
const mockOneRosterTest = jest.fn();
jest.mock('@/lib/sis/oneroster-setup', () => ({
  ...jest.requireActual('@/lib/sis/oneroster-setup'),
  runOneRosterConnectionTest: (...a: unknown[]) => mockOneRosterTest(...a),
}));

import { POST } from '@/app/api/internal/sis-connections/[connectionId]/test/route';

const AERIES_CONNECTION = {
  id: CONNECTION_ID,
  district_id: '0618990',
  sis_type: 'aeries',
  base_url: 'https://district.aeries.net/aeries/api/v5',
  token_url: null,
  credential_hint: '••••eddf',
  status: 'testing',
};

const AERIES_REPORT = {
  ok: true,
  summary: 'All areas granted. Aeries is ready.',
  areas: [
    { key: 'connection', label: 'Connection', status: 'ok', message: 'Speddy can reach it.' },
    { key: 'schools', label: 'Schools', status: 'ok', message: 'Granted.', count: 12 },
  ],
  usedBaseUrl: 'https://district.aeries.net/api/v5',
};

const call = () =>
  POST(
    new NextRequest(`http://localhost/api/internal/sis-connections/${CONNECTION_ID}/test`, {
      method: 'POST',
    }),
    { params: Promise.resolve({ connectionId: CONNECTION_ID }) },
  );

/** Every path that reaches a district's server, in one place. */
const sisWasDialled = () =>
  mockAeriesTest.mock.calls.length + mockOneRosterTest.mock.calls.length > 0;

beforeEach(() => {
  jest.clearAllMocks();
  currentUserId = STAFF_ID;
  profileRow = { data: { is_speddy_admin: true }, error: null };
  mockGetConnection.mockResolvedValue(AERIES_CONNECTION);
  mockGetCredential.mockResolvedValue({ sisType: 'aeries', certificate: CERT });
  mockAeriesTest.mockResolvedValue(AERIES_REPORT);
  mockRecordTestResult.mockResolvedValue(undefined);
});

describe('the staff gate', () => {
  it('401s an unauthenticated caller, and dials nothing', async () => {
    currentUserId = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(sisWasDialled()).toBe(false);
  });

  it('403s an authenticated NON-staff caller, and dials nothing', async () => {
    // The case the whole file exists for. A district admin, a teacher, or any
    // signed-in user must not be able to make Speddy send that district's SIS
    // credential anywhere — and must not be able to use this route to probe
    // another district's server at all.
    currentUserId = NON_STAFF_ID;
    profileRow = { data: { is_speddy_admin: false }, error: null };

    const res = await call();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: Speddy admin access required' });
    expect(sisWasDialled()).toBe(false);
    // Nor was the credential even decrypted.
    expect(mockGetCredential).not.toHaveBeenCalled();
    expect(mockRecordTestResult).not.toHaveBeenCalled();
  });

  it('403s when the profile lookup fails, rather than falling open', async () => {
    profileRow = { data: null, error: { message: 'boom' } };
    const res = await call();
    expect(res.status).toBe(403);
    expect(sisWasDialled()).toBe(false);
  });

  it('lets a Speddy admin through', async () => {
    // The other half. A gate that refused everyone would pass every test above
    // while making the feature useless.
    const res = await call();
    expect(res.status).toBe(200);
    expect(mockAeriesTest).toHaveBeenCalledTimes(1);
  });
});

describe('nothing to test', () => {
  it('404s an unknown connection without dialling', async () => {
    mockGetConnection.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(sisWasDialled()).toBe(false);
  });

  it('409s when no credential is stored, and says so rather than erroring', async () => {
    mockGetCredential.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not entered credentials/i);
    expect(sisWasDialled()).toBe(false);
  });

  it('409s a credential that cannot be decrypted, not a 500', async () => {
    // The plausible cause is an encryption-key rotation. To an operator that
    // reads the same as "no credential stored" and has the same fix.
    mockGetCredential.mockRejectedValue(new Error('bad ciphertext'));
    const res = await call();
    expect(res.status).toBe(409);
    expect(sisWasDialled()).toBe(false);
  });

  it('409s when the connection has no address saved', async () => {
    mockGetConnection.mockResolvedValue({ ...AERIES_CONNECTION, base_url: null });
    const res = await call();
    expect(res.status).toBe(409);
    expect(sisWasDialled()).toBe(false);
  });
});

describe('the report it returns', () => {
  it('runs the district’s own Aeries test and flattens areas to checks', async () => {
    const res = await call();
    const body = await res.json();

    expect(mockAeriesTest).toHaveBeenCalledWith({
      baseUrl: AERIES_CONNECTION.base_url,
      certificate: CERT,
    });
    expect(body.sisType).toBe('aeries');
    expect(body.ok).toBe(true);
    expect(body.checks).toEqual(AERIES_REPORT.areas);
    // The answer SPE-426 could not get without asking the district.
    expect(body.usedAddress).toBe('https://district.aeries.net/api/v5');
  });

  it('flattens OneRoster steps to the same shape', async () => {
    // One renderer in the panel, so the two connectors cannot drift apart on
    // screen. If either report is renamed, this fails.
    mockGetConnection.mockResolvedValue({
      ...AERIES_CONNECTION,
      sis_type: 'oneroster',
      base_url: 'https://district.aeries.net/admin',
      token_url: null,
    });
    mockGetCredential.mockResolvedValue({
      sisType: 'oneroster',
      clientId: 'consumer-id',
      clientSecret: 'consumer-secret',
    });
    const steps = [{ key: 'token', label: 'Sign-in', status: 'ok', message: 'Working.' }];
    mockOneRosterTest.mockResolvedValue({ ok: true, summary: 'Ready.', steps });

    const body = await (await call()).json();

    expect(body.sisType).toBe('oneroster');
    expect(body.checks).toEqual(steps);
    expect(mockAeriesTest).not.toHaveBeenCalled();
  });

  it('records the result against the STAFF user, so the audit trail names who ran it', async () => {
    await call();
    expect(mockRecordTestResult).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: CONNECTION_ID, actorId: STAFF_ID, ok: true }),
    );
  });

  it('still returns the report when recording it fails', async () => {
    // Every probe already ran. A 500 here would hide a completed report and
    // invite another run, sending more requests at a district's server to learn
    // what we already know.
    mockRecordTestResult.mockRejectedValue(new Error('db down'));
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('never returns the credential', async () => {
    // Asserted over the whole serialized body rather than field by field, so a
    // future field cannot quietly carry it.
    mockGetConnection.mockResolvedValue({
      ...AERIES_CONNECTION,
      sis_type: 'oneroster',
      base_url: 'https://district.aeries.net/admin',
    });
    mockGetCredential.mockResolvedValue({
      sisType: 'oneroster',
      clientId: 'consumer-id-xyz',
      clientSecret: 'consumer-secret-xyz',
    });
    mockOneRosterTest.mockResolvedValue({ ok: false, summary: 'Rejected.', steps: [] });

    const text = await (await call()).text();

    expect(text).not.toContain('consumer-secret-xyz');
    expect(text).not.toContain('consumer-id-xyz');
    expect(text).not.toContain(CERT);
  });
});
