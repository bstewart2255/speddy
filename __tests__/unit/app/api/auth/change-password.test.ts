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

  it('explains a weak password too', async () => {
    updateUserResult = { error: { code: 'weak_password', message: 'Password is too weak' } };
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
