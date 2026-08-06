/**
 * POST /api/auth/change-password — what we tell someone when we refuse.
 *
 * This is the FIRST screen every admin-created account sees. Retyping the
 * temporary password you were just handed is a natural thing to do on a page
 * headed "Change Your Password", and until this fix that produced a bare
 * "Failed to update password" with a 500: nothing the person could act on, and
 * a server-fault entry in monitoring for something that was never our fault.
 *
 * Reported from production while onboarding the JSUSD tech admin.
 *
 * What the tests below pin, in order of how much they matter:
 *   - a reused password explains itself, and answers 4xx not 5xx;
 *   - an unrecognised auth failure stays generic and stays a 500, so this map
 *     cannot become a way for upstream auth text to reach a browser;
 *   - the refusal is not logged as an error, or the monitoring noise returns.
 */
import { NextRequest } from 'next/server';

const USER_ID = '11111111-1111-4111-8111-111111111111';

let updateUserResult: { error: any } = { error: null };
let profileResult: { data: any; error: any } = {
  data: { must_change_password: true },
  error: null,
};

const mockUpdateUser = jest.fn(async () => updateUserResult);
const mockLogError = jest.fn();
const mockLogInfo = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
      updateUser: mockUpdateUser,
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => profileResult }) }),
    }),
  }),
  createServiceClient: () => ({
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  }),
}));

jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: (...a: any[]) => mockLogInfo(...a), warn: jest.fn(), error: (...a: any[]) => mockLogError(...a) },
}));

jest.mock('@/lib/api/rate-limit-user', () => ({
  checkUserRateLimit: async () => ({ allowed: true, remaining: 10, resetSeconds: 3600 }),
}));

import { POST } from '@/app/api/auth/change-password/route';

const VALID_PASSWORD = 'Str0ng!Passw0rd42';

const req = (password = VALID_PASSWORD) =>
  new NextRequest('http://localhost/api/auth/change-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });

beforeEach(() => {
  jest.clearAllMocks();
  updateUserResult = { error: null };
  profileResult = { data: { must_change_password: true }, error: null };
});

describe('POST /api/auth/change-password', () => {
  it('succeeds on a good password', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('explains a REUSED password instead of failing blankly', async () => {
    // The exact case reported: the temporary password typed back in.
    updateUserResult = {
      error: {
        code: 'same_password',
        message: 'New password should be different from the old password',
      },
    };

    const res = await POST(req());
    const body = await res.json();

    // A person can fix this themselves, so it is their error, not ours.
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/must be different from the temporary one/i);
    // And the old useless message is gone.
    expect(body.error).not.toBe('Failed to update password');
  });

  it('does not file a reused password as a server error', async () => {
    // The second half of the bug: every one of these landed in monitoring as
    // though Speddy had broken, burying failures that actually had.
    updateUserResult = { error: { code: 'same_password', message: 'x' } };
    await POST(req());

    expect(mockLogError).not.toHaveBeenCalled();
    expect(mockLogInfo).toHaveBeenCalled();
  });

  it('explains a badly-FORMED password', async () => {
    updateUserResult = {
      error: { code: 'weak_password', message: 'too weak', reasons: ['length'] },
    };
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not strong enough/i);
  });

  it('tells a BREACHED password apart from a badly-formed one', async () => {
    // The two need opposite advice, and Supabase distinguishes them in
    // `reasons`. validatePassword() has already required length, case, a digit
    // and a symbol before we get here — so "add numbers and symbols" is advice
    // this person has already followed, and it hides the real problem: their
    // password is public, and they will try small variations of it.
    updateUserResult = {
      error: { code: 'weak_password', message: 'too weak', reasons: ['pwned'] },
    };

    const res = await POST(req());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/known data breach/i);
    expect(body.error).toMatch(/not a variation/i);
    // The formatting advice must NOT appear — it is the wrong instruction here.
    expect(body.error).not.toMatch(/numbers and symbols/i);
  });

  it('treats pwned as breached even when combined with other reasons', async () => {
    updateUserResult = {
      error: { code: 'weak_password', message: 'too weak', reasons: ['characters', 'pwned'] },
    };

    const res = await POST(req());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/known data breach/i);
    // Not BOTH messages: a breached password that also happens to be short
    // still needs the breach advice, and appending "add numbers and symbols"
    // would send them right back to making variations.
    expect(body.error).not.toMatch(/numbers and symbols/i);
  });

  it('falls back to the formatting advice when reasons are absent', async () => {
    // Older auth-js, or a shape we did not anticipate. Better to give the
    // generic strength advice than to accuse someone of a breach.
    updateUserResult = { error: { code: 'weak_password', message: 'too weak' } };
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not strong enough/i);
  });

  it('keeps an UNKNOWN auth failure generic, and a 500', async () => {
    // The guard on the mapping. Anything we have not deliberately worded stays
    // ours to investigate — and upstream auth text never reaches the browser.
    updateUserResult = {
      error: { code: 'unexpected_failure', message: 'internal db constraint xyz' },
    };

    const res = await POST(req());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to update password');
    expect(body.error).not.toMatch(/constraint|xyz/i);
    expect(mockLogError).toHaveBeenCalled();
  });

  it('stays generic when the error carries no code at all', async () => {
    // Older clients, or a network-shaped failure. Falling back to today's
    // behaviour means this change cannot regress anything.
    updateUserResult = { error: { message: 'boom' } };
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to update password');
  });

  it('still refuses when a password change was not required', async () => {
    profileResult = { data: { must_change_password: false }, error: null };
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not required/i);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
