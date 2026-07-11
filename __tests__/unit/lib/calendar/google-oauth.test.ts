import {
  GOOGLE_CALENDAR_SCOPES,
  GoogleOAuthError,
  buildGoogleAuthUrl,
  emailFromIdToken,
  exchangeCodeForTokens,
  getGoogleOAuthClient,
  refreshAccessToken,
  revokeGoogleToken,
} from '@/lib/calendar/google-oauth';

const CLIENT = { clientId: 'test-client-id', clientSecret: 'test-secret' };
const realFetch = global.fetch;

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  global.fetch = realFetch;
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
});

describe('buildGoogleAuthUrl', () => {
  it('requests offline access with forced consent and the minimal scopes', () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: CLIENT.clientId,
        redirectUri: 'https://www.speddy.xyz/api/calendar/google/callback',
        state: 'abc123',
      })
    );
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe(CLIENT.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://www.speddy.xyz/api/calendar/google/callback'
    );
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('abc123');
    const scopes = url.searchParams.get('scope')!.split(' ');
    expect(scopes).toEqual(GOOGLE_CALENDAR_SCOPES);
    // Guard the scope-minimization decision (spec §9): own-calendar events
    // scope, never the all-calendars one.
    expect(scopes).toContain(
      'https://www.googleapis.com/auth/calendar.events.owned'
    );
    expect(scopes).not.toContain('https://www.googleapis.com/auth/calendar');
    expect(scopes).not.toContain(
      'https://www.googleapis.com/auth/calendar.events'
    );
  });
});

describe('token requests', () => {
  it('exchanges an authorization code', async () => {
    const fetchMock = mockFetch(200, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3599,
    });
    const tokens = await exchangeCodeForTokens({
      code: 'the-code',
      redirectUri: 'https://example.test/cb',
      client: CLIENT,
    });
    expect(tokens.access_token).toBe('at');
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('redirect_uri')).toBe('https://example.test/cb');
  });

  it('maps invalid_grant to a reconnect-required error', async () => {
    mockFetch(400, {
      error: 'invalid_grant',
      error_description: 'Token has been expired or revoked.',
    });
    await expect(
      refreshAccessToken({ refreshToken: 'stale', client: CLIENT })
    ).rejects.toMatchObject({
      name: 'GoogleOAuthError',
      code: 'invalid_grant',
      requiresReconnect: true,
    });
  });

  it('survives non-JSON error responses', async () => {
    const fn = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });
    global.fetch = fn as unknown as typeof fetch;
    await expect(
      refreshAccessToken({ refreshToken: 'x', client: CLIENT })
    ).rejects.toMatchObject({ code: 'token_request_failed' });
  });

  it('error objects never carry token material', async () => {
    mockFetch(400, { error: 'invalid_grant', error_description: 'expired' });
    try {
      await refreshAccessToken({
        refreshToken: 'super-secret-refresh-token',
        client: CLIENT,
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GoogleOAuthError);
      expect((err as Error).message).not.toContain('super-secret');
    }
  });
});

describe('revokeGoogleToken', () => {
  it('returns true on success and false on network failure', async () => {
    mockFetch(200, {});
    await expect(revokeGoogleToken('t')).resolves.toBe(true);
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(revokeGoogleToken('t')).resolves.toBe(false);
  });
});

describe('emailFromIdToken', () => {
  it('extracts the email claim without verification', () => {
    const payload = Buffer.from(
      JSON.stringify({ email: 'boydj@mdusd.org' })
    ).toString('base64url');
    expect(emailFromIdToken(`header.${payload}.sig`)).toBe('boydj@mdusd.org');
  });

  it('returns null for missing or malformed tokens', () => {
    expect(emailFromIdToken(undefined)).toBeNull();
    expect(emailFromIdToken('garbage')).toBeNull();
    expect(emailFromIdToken('a.%%%.c')).toBeNull();
    const noEmail = Buffer.from(JSON.stringify({ sub: '123' })).toString(
      'base64url'
    );
    expect(emailFromIdToken(`h.${noEmail}.s`)).toBeNull();
  });
});

describe('getGoogleOAuthClient', () => {
  it('is null until both env vars are set', () => {
    expect(getGoogleOAuthClient()).toBeNull();
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'id';
    expect(getGoogleOAuthClient()).toBeNull();
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'secret';
    expect(getGoogleOAuthClient()).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
    });
  });
});
