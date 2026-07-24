/**
 * SPE-68 · POST /api/auth/reset-password — completes a self-service reset.
 *
 * The contract that matters here is the flag clearing. A user can arrive on
 * this route with `must_change_password` already set (an admin queued a reset
 * for the same person) and/or `password_reset_requested_at` set (they used the
 * old "ask your admin" button). If either survives the reset:
 *   - must_change_password → middleware bounces them to /change-password right
 *     after they chose a password;
 *   - password_reset_requested_at → the admin provider list keeps showing a red
 *     "needs a reset" dot for a request that is already resolved.
 *
 * Also pinned: the clear runs on the SERVICE client, never the request-scoped
 * one. updateUser() rotates the session tokens, and reusing the user client
 * afterwards hangs the request on a token refresh against a stale session
 * (SPE-280). And a failure to clear must not 500 a password that already changed.
 */
import { NextRequest } from 'next/server';

const USER_ID = '11111111-1111-4111-8111-111111111111';

// --- Controllable mock state ---
let updateUserResult: { error: any } = { error: null };
let clearFlagsResult: { error: any } = { error: null };
let serviceClientThrows = false;
let lastUpdateValues: any = null;
let lastUpdateId: string | null = null;
let userClientUpdateCalled = false;

const mockUpdateUser = jest.fn(async () => updateUserResult);

// The request-scoped client. If anything ever routes the profiles update
// through here instead of the service client, `userClientUpdateCalled` trips.
const mockUserFrom = jest.fn(() => ({
  update: () => {
    userClientUpdateCalled = true;
    return { eq: async () => ({ error: null }) };
  },
}));

const mockServiceFrom = jest.fn(() => ({
  update: (vals: any) => {
    lastUpdateValues = vals;
    return {
      eq: async (_col: string, val: string) => {
        lastUpdateId = val;
        return clearFlagsResult;
      },
    };
  },
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
      updateUser: mockUpdateUser,
    },
    from: mockUserFrom,
  }),
  createServiceClient: () => {
    if (serviceClientThrows) throw new Error('missing service role key');
    return { from: mockServiceFrom };
  },
}));

jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// The per-user limiter is exercised in its own suite; keep it out of the way.
jest.mock('@/lib/api/rate-limit-user', () => ({
  checkUserRateLimit: async () => ({ allowed: true, remaining: 10, resetSeconds: 3600 }),
}));

import { POST } from '@/app/api/auth/reset-password/route';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const VALID_PASSWORD = 'Str0ng!Passw0rd42';

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateUserResult = { error: null };
    clearFlagsResult = { error: null };
    serviceClientThrows = false;
    lastUpdateValues = null;
    lastUpdateId = null;
    userClientUpdateCalled = false;
  });

  it('updates the password and clears BOTH password flags', async () => {
    const res = await POST(req({ password: VALID_PASSWORD }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: VALID_PASSWORD });
    expect(lastUpdateValues).toEqual({
      must_change_password: false,
      password_reset_requested_at: null,
    });
    expect(lastUpdateId).toBe(USER_ID);
  });

  it('clears the flags on the service client, not the request-scoped one (SPE-280)', async () => {
    await POST(req({ password: VALID_PASSWORD }));

    expect(mockServiceFrom).toHaveBeenCalledWith('profiles');
    expect(userClientUpdateCalled).toBe(false);
  });

  it('rejects a password that fails the strength rules without touching auth', async () => {
    const res = await POST(req({ password: 'weak' }));

    expect(res.status).toBe(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(lastUpdateValues).toBeNull();
  });

  it('surfaces a leaked-password rejection so the user can act on it (SPE-11)', async () => {
    updateUserResult = {
      error: { message: 'This password has been found in a data breach. Choose another.' },
    };

    const res = await POST(req({ password: VALID_PASSWORD }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/data breach/i);
    // Password never changed → flags must stay as they were.
    expect(lastUpdateValues).toBeNull();
  });

  it('still succeeds when the flag clear fails — the password already changed', async () => {
    clearFlagsResult = { error: { message: 'db unavailable' } };

    const res = await POST(req({ password: VALID_PASSWORD }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('still succeeds when the service client cannot be constructed', async () => {
    serviceClientThrows = true;

    const res = await POST(req({ password: VALID_PASSWORD }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('does not require must_change_password to be set (unlike /change-password)', async () => {
    // No profile lookup is mocked at all — if the route gated on a
    // must_change_password read the way /api/auth/change-password does, this
    // would fail rather than reset cleanly for an ordinary forgetful user.
    const res = await POST(req({ password: VALID_PASSWORD }));

    expect(res.status).toBe(200);
  });
});
