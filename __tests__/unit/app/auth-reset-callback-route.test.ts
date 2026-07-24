/**
 * Unit tests for the password-recovery callback (`app/auth/reset-callback/route.ts`).
 *
 * Contract (SPE-68): exchange the emailed PKCE `?code=` for a session and send
 * the user to /reset-password. Every failure mode — Supabase-reported error,
 * missing code, failed exchange, unexpected throw — bounces to /login with copy
 * the user can act on, and never lands them on the set-password page.
 *
 * This route is deliberately separate from /auth/callback: that one carries the
 * SSO provisioning gate, which DELETES an auth user + profile it judges
 * unprovisioned. A reset link must never run through delete-the-account code, so
 * these tests also assert no service client is ever constructed here.
 */

// jest requires factory-referenced vars to be prefixed with `mock`.
const mockExchange = jest.fn();
const mockCreateClient = jest.fn();
const mockCreateServiceClient = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET } from '@/app/auth/reset-callback/route';

const call = (qs: string) =>
  GET(new Request(`http://localhost:3000/auth/reset-callback${qs}`));

const location = (res: Response) => new URL(res.headers.get('location') as string);

describe('password reset callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExchange.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession: mockExchange } });
  });

  it('exchanges a valid code and sends the user to /reset-password', async () => {
    const res = await call('?code=valid-code');

    expect(mockExchange).toHaveBeenCalledWith('valid-code');
    expect(location(res).pathname).toBe('/reset-password');
  });

  it('bounces an expired link to login with reset_expired', async () => {
    const res = await call('?error=access_denied&error_code=otp_expired');

    // Never attempt an exchange when Supabase already told us the link is dead.
    expect(mockExchange).not.toHaveBeenCalled();
    const url = location(res);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('reset_expired');
  });

  it('bounces a missing code to login with reset_invalid', async () => {
    const res = await call('');

    expect(mockExchange).not.toHaveBeenCalled();
    const url = location(res);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('reset_invalid');
  });

  it('bounces to login when the code exchange fails (already-used link)', async () => {
    mockExchange.mockResolvedValue({ data: null, error: { message: 'invalid flow state' } });

    const res = await call('?code=already-used');

    const url = location(res);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('reset_expired');
  });

  it('fails closed to login when the supabase client throws', async () => {
    mockCreateClient.mockRejectedValue(new Error('boom'));

    const res = await call('?code=valid-code');

    const url = location(res);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('reset_invalid');
  });

  it('never constructs a service client (no account-deletion code path)', async () => {
    await call('?code=valid-code');
    await call('?error=access_denied&error_code=otp_expired');
    await call('');

    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('uses NEXT_PUBLIC_SITE_URL as the redirect origin when set', async () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.speddy.xyz';
    try {
      const res = await call('?code=valid-code');
      expect(location(res).origin).toBe('https://www.speddy.xyz');
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });
});
