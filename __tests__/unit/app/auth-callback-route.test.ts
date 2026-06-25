/**
 * Unit tests for the Google SSO callback provisioning gate
 * (`app/auth/callback/route.ts`).
 *
 * Contract: a social sign-in may only proceed when the account already existed
 * before this Google login — detected by the presence of a NON-Google identity
 * (admin-created and self-signup accounts always have an `email` identity, and
 * Supabase auto-links Google to them by verified email). A first-time,
 * google-only account is signed out, then its trigger-created `profiles` row
 * AND orphan auth user are deleted (profiles.id -> auth.users.id is NO ACTION,
 * so the profile is removed explicitly) before bouncing to
 * /login?error=not_provisioned. If any delete fails, fail closed to oauth_failed.
 *
 * NB: we intentionally do NOT gate on a `profiles` row — an `on_auth_user_created`
 * trigger auto-creates a profile for every new auth user, so "profile exists" is
 * always true and is not a valid provisioning signal.
 */

// jest requires factory-referenced vars to be prefixed with `mock`.
const mockExchange = jest.fn();
const mockSignOut = jest.fn();
const mockCreateClient = jest.fn();

const mockGetUserById = jest.fn();
const mockDeleteUser = jest.fn();
const mockProfileDeleteEq = jest.fn();
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
  return {
    from: jest.fn(() => ({ delete: jest.fn(() => ({ eq: mockProfileDeleteEq })) })),
    auth: { admin: { getUserById: mockGetUserById, deleteUser: mockDeleteUser } },
  };
}

// Build a getUserById() result with the given identity providers.
const userWith = (providers: string[]) => ({
  data: { user: { id: 'user-1', identities: providers.map((provider) => ({ provider })) } },
  error: null,
});

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
    // Default: a provisioned account that Google linked to (email + google).
    mockGetUserById.mockResolvedValue(userWith(['email', 'google']));
    mockProfileDeleteEq.mockResolvedValue({ error: null });
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

  it('lets a provisioned (email+google) user through and never deletes them', async () => {
    const res = await call('?code=abc');
    expect(location(res).pathname).toBe('/dashboard');
    expect(location(res).searchParams.get('error')).toBeNull();
    expect(mockGetUserById).toHaveBeenCalledWith('user-1');
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('rejects a google-only account (even though the trigger created a profile)', async () => {
    mockGetUserById.mockResolvedValue(userWith(['google']));
    const res = await call('?code=abc');
    expect(location(res).pathname).toBe('/login');
    expect(location(res).searchParams.get('error')).toBe('not_provisioned');
    expect(mockGetUserById).toHaveBeenCalledWith('user-1');
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockProfileDeleteEq).toHaveBeenCalledWith('id', 'user-1');
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
  });

  it('fails closed (no auth-user delete) when the profile delete fails', async () => {
    mockGetUserById.mockResolvedValue(userWith(['google']));
    mockProfileDeleteEq.mockResolvedValue({ error: { message: 'fk' } });
    const res = await call('?code=abc');
    expect(location(res).searchParams.get('error')).toBe('oauth_failed');
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('fails closed when the auth-user delete fails', async () => {
    mockGetUserById.mockResolvedValue(userWith(['google']));
    mockDeleteUser.mockResolvedValue({ data: { user: null }, error: { message: 'boom' } });
    const res = await call('?code=abc');
    expect(location(res).searchParams.get('error')).toBe('oauth_failed');
    expect(mockProfileDeleteEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('fails closed if the identity lookup throws', async () => {
    mockGetUserById.mockRejectedValue(new Error('admin api down'));
    const res = await call('?code=abc');
    expect(location(res).searchParams.get('error')).toBe('oauth_failed');
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('fails closed WITHOUT deleting when the identity lookup resolves an error', async () => {
    // A real provisioned user must NOT be deleted when we simply can't verify.
    mockGetUserById.mockResolvedValue({ data: { user: null }, error: { message: 'timeout' } });
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

  it('still deletes the orphan when sign-out throws for a google-only account', async () => {
    mockGetUserById.mockResolvedValue(userWith(['google']));
    mockSignOut.mockRejectedValue(new Error('signout failed'));
    const res = await call('?code=abc');
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
    expect(location(res).searchParams.get('error')).toBe('not_provisioned');
  });
});
