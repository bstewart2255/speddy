import { randomBytes } from 'crypto';
import {
  CalendarReconnectRequiredError,
  getValidGoogleAccessToken,
} from '@/lib/calendar/connections';
import { decryptToken, encryptToken } from '@/lib/calendar/token-crypto';

/**
 * Minimal chainable stub covering exactly the calls connections.ts makes:
 * from().select().eq().eq().maybeSingle() and from().update().eq().
 */
function stubSupabase(row: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const stub = {
    updates,
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: row, error: null }),
                  };
                },
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  // Tests exercise runtime behavior; the stub intentionally isn't a full
  // SupabaseClient, so cast at the boundary.
  return stub as unknown as Parameters<typeof getValidGoogleAccessToken>[0] & {
    updates: Record<string, unknown>[];
  };
}

const realFetch = global.fetch;

describe('getValidGoogleAccessToken', () => {
  beforeEach(() => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY =
      randomBytes(32).toString('base64');
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'id';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'secret';
    global.fetch = jest.fn(() => {
      throw new Error('unexpected fetch');
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  });

  function activeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'conn-1',
      status: 'active',
      access_token_encrypted: encryptToken('cached-access'),
      refresh_token_encrypted: encryptToken('the-refresh'),
      token_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      ...overrides,
    };
  }

  it('returns the cached access token while it is fresh (no network)', async () => {
    const supabase = stubSupabase(activeRow());
    await expect(getValidGoogleAccessToken(supabase, 'p1')).resolves.toBe(
      'cached-access'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refreshes and persists when the cached token is expired', async () => {
    const supabase = stubSupabase(
      activeRow({
        token_expires_at: new Date(Date.now() - 1000).toISOString(),
      })
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'fresh-access', expires_in: 3600 }),
    }) as unknown as typeof fetch;

    await expect(getValidGoogleAccessToken(supabase, 'p1')).resolves.toBe(
      'fresh-access'
    );
    expect(supabase.updates).toHaveLength(1);
    expect(
      decryptToken(supabase.updates[0].access_token_encrypted as string)
    ).toBe('fresh-access');
    expect(supabase.updates[0].token_expires_at).toBeDefined();
  });

  it('marks the connection revoked on invalid_grant and demands reconnect', async () => {
    const supabase = stubSupabase(
      activeRow({
        token_expires_at: new Date(Date.now() - 1000).toISOString(),
      })
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    }) as unknown as typeof fetch;

    await expect(getValidGoogleAccessToken(supabase, 'p1')).rejects.toThrow(
      CalendarReconnectRequiredError
    );
    expect(supabase.updates).toContainEqual({ status: 'revoked' });
  });

  it.each([
    ['no connection row', null],
    ['revoked connection', { id: 'c', status: 'revoked' }],
    [
      'row without a refresh token',
      { id: 'c', status: 'active', refresh_token_encrypted: null },
    ],
  ])('demands reconnect for %s', async (_label, row) => {
    const supabase = stubSupabase(row as Record<string, unknown> | null);
    await expect(getValidGoogleAccessToken(supabase, 'p1')).rejects.toThrow(
      CalendarReconnectRequiredError
    );
  });
});
