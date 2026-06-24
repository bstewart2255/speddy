/**
 * Unit tests for the Google SSO callback provisioning gate
 * (`app/auth/callback/route.ts`).
 *
 * Contract: a social sign-in may only proceed when we ALREADY have an account
 * (a `profiles` row) for the user. An unprovisioned identity must be signed out,
 * have its orphan auth user deleted, and be bounced to /login?error=not_provisioned.
 * SSO can never create a usable new account.
 */

// jest requires factory-referenced vars to be prefixed with `mock`.
const mockExchange = jest.fn();
const mockSignOut = jest.fn();
const mockCreateClient = jest.fn();

const mockMaybeSingle = jest.fn();
const mockDeleteUser = jest.fn();
const mockCreateServiceClient = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { GET } from '@/app/auth/callback/route';

function buildAdminClient() {
  const eq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  return { from, auth: { admin: { deleteUser: mockDeleteUser } } };
}

const call = (qs: string) =>
  GET(new Request(`http://localhost:3000/auth/callback${qs}`));

const location = (res: Response) => new URL(res.headers.get('location') as string);

describe('Google SSO callback provisioning gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession: mockExchange, signOut: mockSignOut },
    });
    mockCreateServiceClient.mockReturnValue(buildAdminClient());
    mockExchange.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: { id: 'user-1' }, error: null });
    mockDeleteUser.mockResolvedValue({ data: {}, error: null });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it('rejects when no code is present, without exchanging', async () => {
    const res = await call('');
    expect(location(res).pathname).toBe('/login');
    expect(location(res).searchParams.get('error')).toBe('oauth_failed');
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('rejects when the provider returns an error, without exchanging', async () => {
    const res = await call('?error=access_denied');
    expect(location(res).searchParams.get('error')).toBe('oauth_failed');
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('rejects when the code exchange fails', async () => {
    mockExchange.mockResolvedValue({ data: { user: null }, error: { message: 'bad code' } });
    const res = await call('?code=abc');
    expect(location(res).searchParams.get('error')).toBe('oauth_failed');
  });

  it('lets a provisioned user through and never deletes them', async () => {
    const res = await call('?code=abc');
    expect(location(res).pathname).toBe('/dashboard');
    expect(location(res).searchParams.get('error')).toBeNull();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('rejects an unprovisioned user: signs out, deletes the orphan, bounces to login', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await call('?code=abc');
    expect(location(res).pathname).toBe('/login');
    expect(location(res).searchParams.get('error')).toBe('not_provisioned');
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
  });

  it('fails closed if the provisioning lookup throws', async () => {
    mockMaybeSingle.mockRejectedValue(new Error('db down'));
    const res = await call('?code=abc');
    expect(location(res).searchParams.get('error')).toBe('oauth_failed');
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('fails closed WITHOUT deleting when the lookup resolves an error (transient DB failure)', async () => {
    // maybeSingle() returns { data: null, error } on a PostgREST/DB error
    // rather than throwing. A real provisioned user must NOT be deleted here.
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    const res = await call('?code=abc');
    expect(location(res).searchParams.get('error')).toBe('oauth_failed');
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('honors a safe internal next param', async () => {
    const res = await call('?code=abc&next=/dashboard/admin');
    expect(location(res).pathname).toBe('/dashboard/admin');
  });

  it('ignores an external next param (open-redirect guard)', async () => {
    const res = await call('?code=abc&next=https://evil.example.com');
    expect(location(res).host).toBe('localhost:3000');
    expect(location(res).pathname).toBe('/dashboard');
  });

  it('uses NEXT_PUBLIC_SITE_URL as the redirect origin when set (not x-forwarded-host)', async () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.speddy.xyz';
    try {
      const res = await call('?code=abc');
      expect(location(res).host).toBe('www.speddy.xyz');
      expect(location(res).pathname).toBe('/dashboard');
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });

  it('fails closed (redirects, no 500) when the supabase client setup throws', async () => {
    mockCreateClient.mockRejectedValue(new Error('env missing'));
    const res = await call('?code=abc');
    expect(location(res).searchParams.get('error')).toBe('oauth_failed');
  });

  it('still deletes the orphan when sign-out throws for an unprovisioned user', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockSignOut.mockRejectedValue(new Error('signout failed'));
    const res = await call('?code=abc');
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
    expect(location(res).searchParams.get('error')).toBe('not_provisioned');
  });
});
