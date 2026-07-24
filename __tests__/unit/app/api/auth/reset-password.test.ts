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
import { PASSWORD_RECOVERY_COOKIE, issueRecoveryMarker } from '@/lib/auth/password-reset';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999';

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

/** A request carrying a valid recovery marker for USER_ID. */
const req = (body: unknown) => reqWithMarker(body, issueRecoveryMarker(USER_ID));

/** A request carrying an arbitrary marker value. */
const reqWithMarker = (body: unknown, marker: string) => {
  const r = new NextRequest('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  r.cookies.set(PASSWORD_RECOVERY_COOKIE, marker);
  return r;
};

/** A request from an ordinary logged-in session that never redeemed a link. */
const reqWithoutMarker = (body: unknown) =>
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

  it('403s an authenticated session with no recovery marker, touching nothing', async () => {
    // The core of the gate: being logged in is NOT proof of mailbox control.
    // Without this, any live session could change the password and clear the
    // admin-reset flags without ever receiving the email.
    const res = await POST(reqWithoutMarker({ password: VALID_PASSWORD }));

    expect(res.status).toBe(403);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(lastUpdateValues).toBeNull();
  });

  it('403s a FORGED marker — presence is not proof, the signature is', async () => {
    // The bug this replaced: the marker was the literal "1", so anyone crafting
    // a request could attach it. httpOnly only stops page scripts, not curl.
    const res = await POST(reqWithMarker({ password: VALID_PASSWORD }, '1'));

    expect(res.status).toBe(403);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(lastUpdateValues).toBeNull();
  });

  it('403s a marker whose signature does not verify', async () => {
    const tampered = issueRecoveryMarker(USER_ID).replace(/.$/, 'f').replace(/ff$/, 'aa');
    const res = await POST(reqWithMarker({ password: VALID_PASSWORD }, tampered));

    expect(res.status).toBe(403);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('403s a validly-signed marker issued for a DIFFERENT user', async () => {
    // Binding matters: a marker minted from someone else's reset link must not
    // authorise changing this caller's password.
    const res = await POST(
      reqWithMarker({ password: VALID_PASSWORD }, issueRecoveryMarker(OTHER_USER_ID)),
    );

    expect(res.status).toBe(403);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(lastUpdateValues).toBeNull();
  });

  it('403s an expired marker', async () => {
    const stale = issueRecoveryMarker(USER_ID, Date.now() - 3_600_000);
    const res = await POST(reqWithMarker({ password: VALID_PASSWORD }, stale));

    expect(res.status).toBe(403);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('burns the marker on success so the link cannot be replayed', async () => {
    const res = await POST(req({ password: VALID_PASSWORD }));

    expect(res.status).toBe(200);
    const cleared = res.cookies.get(PASSWORD_RECOVERY_COOKIE);
    // next/server represents a delete as an empty value with maxAge 0.
    expect(cleared?.value).toBe('');
  });

  it('keeps the marker when the password is rejected, so the user can retry', async () => {
    const res = await POST(req({ password: 'weak' }));

    expect(res.status).toBe(400);
    expect(res.cookies.get(PASSWORD_RECOVERY_COOKIE)).toBeUndefined();
  });

  it('does not require must_change_password to be set (unlike /change-password)', async () => {
    // No profile lookup is mocked at all — if the route gated on a
    // must_change_password read the way /api/auth/change-password does, this
    // would fail rather than reset cleanly for an ordinary forgetful user.
    const res = await POST(req({ password: VALID_PASSWORD }));

    expect(res.status).toBe(200);
  });
});
