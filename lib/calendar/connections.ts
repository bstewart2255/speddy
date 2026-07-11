/**
 * calendar_connections data access (SPE-205). Server-only: decrypts tokens.
 *
 * Callers pass a Supabase client. Route handlers pass the cookie-session
 * client (owner-only RLS applies); later engine work (SPE-206 Google busy
 * source) can pass the service client to refresh other attendees' tokens.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database';
import { decryptToken, encryptToken } from './token-crypto';
import {
  GoogleOAuthError,
  getGoogleOAuthClient,
  refreshAccessToken,
  revokeGoogleToken,
  type GoogleTokenResponse,
} from './google-oauth';

type Client = SupabaseClient<Database>;

const PROVIDER = 'google';
/** Refresh when the access token has less than this long to live. */
const EXPIRY_BUFFER_MS = 60_000;

export class CalendarReconnectRequiredError extends Error {
  constructor(message = 'Google Calendar connection needs to be reconnected') {
    super(message);
    this.name = 'CalendarReconnectRequiredError';
  }
}

function expiresAtIso(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

/**
 * Persist a fresh grant from the OAuth callback. Requires a refresh token —
 * we always request `access_type=offline&prompt=consent`, so its absence
 * means something went wrong and the connection would break within an hour.
 */
export async function saveGoogleConnection(
  supabase: Client,
  profileId: string,
  tokens: GoogleTokenResponse,
  googleEmail: string | null
): Promise<void> {
  if (!tokens.refresh_token) {
    throw new Error('Google did not return offline access (no refresh token)');
  }
  const { error } = await supabase.from('calendar_connections').upsert(
    {
      profile_id: profileId,
      provider: PROVIDER,
      access_token_encrypted: encryptToken(tokens.access_token),
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      token_expires_at: expiresAtIso(tokens.expires_in),
      scopes: tokens.scope ? tokens.scope.split(' ') : null,
      google_email: googleEmail,
      status: 'active',
    },
    { onConflict: 'profile_id,provider' }
  );
  if (error) throw error;
}

/**
 * Delete the connection and best-effort revoke the grant at Google.
 * Local deletion always wins: a failed revoke never leaves tokens behind.
 */
export async function deleteGoogleConnection(
  supabase: Client,
  profileId: string
): Promise<{ existed: boolean; revoked: boolean }> {
  const { data: row, error } = await supabase
    .from('calendar_connections')
    .select('id, access_token_encrypted, refresh_token_encrypted')
    .eq('profile_id', profileId)
    .eq('provider', PROVIDER)
    .maybeSingle();
  if (error) throw error;
  if (!row) return { existed: false, revoked: false };

  const { error: deleteError } = await supabase
    .from('calendar_connections')
    .delete()
    .eq('id', row.id);
  if (deleteError) throw deleteError;

  // Revoking the refresh token revokes the whole grant; fall back to the
  // access token if decryption of the refresh token fails (e.g. key rotation).
  let revoked = false;
  for (const encrypted of [row.refresh_token_encrypted, row.access_token_encrypted]) {
    if (!encrypted) continue;
    try {
      revoked = await revokeGoogleToken(decryptToken(encrypted));
      if (revoked) break;
    } catch {
      // undecryptable ciphertext — nothing to revoke with
    }
  }
  return { existed: true, revoked };
}

/**
 * A decrypted, unexpired access token for this profile, refreshing (and
 * persisting) when needed. The shared entry point for every Google Calendar
 * API call. Throws CalendarReconnectRequiredError when the grant is gone —
 * callers surface the reconnect UX, never retry.
 */
export async function getValidGoogleAccessToken(
  supabase: Client,
  profileId: string
): Promise<string> {
  const { data: row, error } = await supabase
    .from('calendar_connections')
    .select(
      'id, status, access_token_encrypted, refresh_token_encrypted, token_expires_at'
    )
    .eq('profile_id', profileId)
    .eq('provider', PROVIDER)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.status !== 'active' || !row.refresh_token_encrypted) {
    throw new CalendarReconnectRequiredError();
  }

  const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  if (row.access_token_encrypted && expiresAt - Date.now() > EXPIRY_BUFFER_MS) {
    try {
      return decryptToken(row.access_token_encrypted);
    } catch {
      // Undecryptable (e.g. key rotation) — fall through and refresh instead.
    }
  }

  const client = getGoogleOAuthClient();
  if (!client) {
    throw new Error('Google Calendar OAuth is not configured');
  }

  // An undecryptable refresh token (key rotation) leaves nothing to try —
  // same outcome as a revoked grant: reconnect. Keeps the documented
  // "throws CalendarReconnectRequiredError" contract instead of leaking a
  // raw crypto error.
  let refreshTokenPlain: string;
  try {
    refreshTokenPlain = decryptToken(row.refresh_token_encrypted);
  } catch {
    await supabase
      .from('calendar_connections')
      .update({ status: 'revoked' })
      .eq('id', row.id);
    throw new CalendarReconnectRequiredError();
  }

  let refreshed: GoogleTokenResponse;
  try {
    refreshed = await refreshAccessToken({
      refreshToken: refreshTokenPlain,
      client,
    });
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.requiresReconnect) {
      // Grant revoked (user removed access, Testing-mode 7-day expiry, admin
      // policy change). Mark it so the UI shows the reconnect prompt.
      await supabase
        .from('calendar_connections')
        .update({ status: 'revoked' })
        .eq('id', row.id);
      throw new CalendarReconnectRequiredError();
    }
    throw err;
  }

  const { error: updateError } = await supabase
    .from('calendar_connections')
    .update({
      access_token_encrypted: encryptToken(refreshed.access_token),
      token_expires_at: expiresAtIso(refreshed.expires_in),
    })
    .eq('id', row.id);
  if (updateError) {
    // Persisting failed but the token is valid — use it; next call refreshes.
    console.error('Failed to persist refreshed calendar token'); // no token values
  }
  return refreshed.access_token;
}
