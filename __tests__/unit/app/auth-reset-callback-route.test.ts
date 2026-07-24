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
const mockVerifyOtp = jest.fn();
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
import { PASSWORD_RECOVERY_COOKIE } from '@/lib/auth/password-reset';

const call = (qs: string) =>
  GET(new Request(`http://localhost:3000/auth/reset-callback${qs}`));

const location = (res: Response) => new URL(res.headers.get('location') as string);

describe('password reset callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExchange.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession: mockExchange, verifyOtp: mockVerifyOtp },
    });
  });

  it('verifies a token_hash link and sends the user to /reset-password', async () => {
    const res = await call('?token_hash=abc123&type=recovery');

    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'recovery' });
    expect(location(res).pathname).toBe('/reset-password');
  });

  it('sets the recovery marker only after a link actually verifies', async () => {
    // This marker is what gates POST /api/auth/reset-password. If a rejected
    // link ever set it, an ordinary session could reach the reset endpoint.
    const ok = await call('?token_hash=abc123&type=recovery');
    expect(ok.cookies.get(PASSWORD_RECOVERY_COOKIE)?.value).toBe('1');
    expect(ok.cookies.get(PASSWORD_RECOVERY_COOKIE)?.httpOnly).toBe(true);

    mockVerifyOtp.mockResolvedValue({ data: null, error: { message: 'token expired' } });
    const rejected = await call('?token_hash=stale&type=recovery');
    expect(rejected.cookies.get(PASSWORD_RECOVERY_COOKIE)).toBeUndefined();

    const noToken = await call('?error=access_denied&error_code=otp_expired');
    expect(noToken.cookies.get(PASSWORD_RECOVERY_COOKIE)).toBeUndefined();
  });

  it('prefers token_hash over code — the code path is browser-bound', async () => {
    // A token_hash carries no browser-bound secret, so it survives the user
    // requesting the reset on one device and opening the mail on another.
    // If both shapes are present, the device-independent one must win.
    await call('?token_hash=abc123&type=recovery&code=valid-code');

    expect(mockVerifyOtp).toHaveBeenCalled();
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('bounces to login when token_hash verification fails', async () => {
    mockVerifyOtp.mockResolvedValue({ data: null, error: { message: 'token expired' } });

    const res = await call('?token_hash=stale&type=recovery');

    const url = location(res);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('reset_expired');
  });

  it('falls back to exchanging a PKCE code when no token_hash is present', async () => {
    const res = await call('?code=valid-code');

    expect(mockExchange).toHaveBeenCalledWith('valid-code');
    expect(mockVerifyOtp).not.toHaveBeenCalled();
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

  it('bounces a link with neither token_hash nor code to login with reset_invalid', async () => {
    const res = await call('');

    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
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
