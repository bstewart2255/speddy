/**
 * Google OAuth 2.0 client for the calendar integration (SPE-205), via plain
 * REST — deliberately no googleapis dependency.
 *
 * This is SEPARATE from "Continue with Google" sign-in, which runs through
 * Supabase Auth (docs/auth-google-sso.md). Both use OAuth clients from the
 * same Google Cloud project ("Speddy"), but calendar access needs its own
 * client because Speddy must hold the refresh token itself.
 *
 * Never log token values. Google's error bodies carry only
 * { error, error_description }, so surfacing those is safe.
 */

export const GOOGLE_CALENDAR_SCOPES = [
  // Identity of the connected account, for "Connected as …" display and
  // wrong-account detection (district vs personal). Non-sensitive scopes.
  'openid',
  'email',
  // Availability lookups (freebusy.query): the user's own calendars plus any
  // calendar already visible to them through Google's own sharing (spec §5
  // "colleague free/busy" source).
  'https://www.googleapis.com/auth/calendar.freebusy',
  // Read/create/update events on calendars the user OWNS: invites go out from
  // the organizer's calendar, RSVP watch reads them back, and own-calendar
  // reads surface all-day items free/busy misses. Granular scope on purpose —
  // NOT calendar.events, which would cover every calendar they can see.
  'https://www.googleapis.com/auth/calendar.events.owned',
];

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }

  /** invalid_grant = refresh token expired/revoked → user must reconnect. */
  get requiresReconnect(): boolean {
    return this.code === 'invalid_grant';
  }
}

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

/** Null when the feature isn't configured in this environment. */
export function getGoogleOAuthClient(): GoogleOAuthClientConfig | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES.join(' '));
  // offline + consent → Google issues a refresh token on every connect, so
  // reconnects always repair a broken connection.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', params.state);
  return url.toString();
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

async function tokenRequest(
  body: Record<string, string>
): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  let json: any = {};
  try {
    json = await res.json();
  } catch {
    // fall through to the !res.ok branch with a generic error
  }
  if (!res.ok) {
    throw new GoogleOAuthError(
      json.error_description || 'Google token request failed',
      json.error || 'token_request_failed',
      res.status
    );
  }
  return json as GoogleTokenResponse;
}

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
  client: GoogleOAuthClientConfig;
}): Promise<GoogleTokenResponse> {
  return tokenRequest({
    grant_type: 'authorization_code',
    code: params.code,
    client_id: params.client.clientId,
    client_secret: params.client.clientSecret,
    redirect_uri: params.redirectUri,
  });
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  client: GoogleOAuthClientConfig;
}): Promise<GoogleTokenResponse> {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.client.clientId,
    client_secret: params.client.clientSecret,
  });
}

/**
 * Best-effort revocation (revoking the refresh token kills the whole grant).
 * Returns false rather than throwing — local deletion must proceed anyway.
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Email claim from the id_token JWT. No signature verification needed: the
 * token came straight from Google's token endpoint over TLS, not from the
 * browser.
 */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    );
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}
