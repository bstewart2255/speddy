/**
 * SPE-420 · GET /api/internal/sis-key-health — the staff gate and the wire contract.
 *
 * Why this file has to exist rather than lean on a sim-district walk: the
 * allowed branch cannot be walked. `docs/SIM_DISTRICT.md` invariant 5 states
 * "No sim user is ever `is_speddy_admin`", so no persona can ever reach the
 * staff side of this route through the UI. A handler test is the only coverage
 * that branch will ever have.
 *
 * What is pinned here, and why each one is load-bearing:
 *
 *  - the gate, in BOTH directions. `speddyAdminDenialReason` returns null for
 *    allowed and a string for denied, and its own docstring records that the
 *    obvious reading of that inverts the guard and "let everyone through,
 *    silently". Middleware cannot catch the inversion — middleware.ts's matcher
 *    excludes `api` — so this is the only layer that would.
 *  - 200 on a FAILED self-test. The intuitive refactor is to return 5xx, which
 *    would silently break the client: the panel routes non-2xx to "the check
 *    could not run" and would stop reporting the very failure this exists for.
 *  - the denial body carries no verdict. A 403 that leaked `ok` would hand
 *    deployment state to a non-staff caller.
 */
import { NextRequest } from 'next/server';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const NON_STAFF_ID = '22222222-2222-4222-8222-222222222222';

let currentUserId: string | null = STAFF_ID;
let profileRow: { data: unknown; error: unknown } = {
  data: { is_speddy_admin: true },
  error: null,
};

// withRoute resolves the caller through createClient().auth.getUser(), and the
// staff gate reads `profiles` through the service client — both are driven by
// the mutable state above so every branch is representable.
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

import { GET } from '@/app/api/internal/sis-key-health/route';
import { randomBytes } from 'crypto';

const req = () => new NextRequest('http://localhost/api/internal/sis-key-health');

describe('GET /api/internal/sis-key-health', () => {
  const originalKey = process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;

  beforeEach(() => {
    currentUserId = STAFF_ID;
    profileRow = { data: { is_speddy_admin: true }, error: null };
    process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = originalKey;
  });

  it('401s an unauthenticated caller', async () => {
    currentUserId = null;
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('403s an authenticated non-staff caller', async () => {
    currentUserId = NON_STAFF_ID;
    profileRow = { data: { is_speddy_admin: false }, error: null };
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: Speddy admin access required' });
  });

  it('does not leak the verdict to a refused caller', async () => {
    // The refusal must carry no deployment state at all — not `ok`, not a
    // problem string, not the build identity.
    currentUserId = NON_STAFF_ID;
    profileRow = { data: { is_speddy_admin: false }, error: null };
    const body = await (await GET(req())).json();
    expect(body).not.toHaveProperty('ok');
    expect(body).not.toHaveProperty('problem');
    expect(body).not.toHaveProperty('deployment');
  });

  it('answers a staff caller with the verdict on a healthy key', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('answers 200 — NOT 5xx — when the self-test fails', async () => {
    // The contract the client depends on: non-2xx means "the check could not
    // run", so a broken key must not arrive that way or it stops being reported.
    delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/SIS_CREDENTIAL_ENCRYPTION_KEY is not set/),
    });
  });

  it('never serves a cached verdict', async () => {
    expect((await GET(req())).headers.get('Cache-Control')).toBe('no-store');
  });

  it('names the build that answered', async () => {
    const body = await (await GET(req())).json();
    expect(body.deployment).toEqual({
      commit: expect.any(String),
      environment: expect.any(String),
      checkedAt: expect.any(String),
    });
  });

  it('never puts key material in the response', async () => {
    const key = randomBytes(32).toString('base64');
    process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = `${key}\n`; // malformed on paste
    const raw = JSON.stringify(await (await GET(req())).json());
    expect(raw).toMatch(/must be canonical base64/);
    expect(raw).not.toContain(key);
  });
});
