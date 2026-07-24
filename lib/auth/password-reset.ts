import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Recovery marker for the self-service password reset flow (SPE-68).
 *
 * `/auth/reset-callback` issues this only after Supabase has verified the emailed
 * recovery link, and `POST /api/auth/reset-password` refuses to run without a
 * valid one. Without it that endpoint would accept ANY authenticated session —
 * its whole premise is "the caller proved control of the mailbox," and an
 * ordinary logged-in session is not that proof.
 *
 * The marker is **signed and bound to the user**, not a bare flag. An earlier
 * version was the literal string "1" in an httpOnly cookie, which is not a
 * boundary at all: httpOnly only stops *page JavaScript* from touching the
 * cookie, and anyone crafting an HTTP request (curl, or an attacker replaying a
 * stolen session) can simply attach it. Raised by CodeRabbit on PR #781.
 *
 * Format: `<userId>.<expiresAtMs>.<hmac>`, where the HMAC covers
 * `<userId>.<expiresAtMs>`. Verification requires the signature to check out AND
 * the embedded user to match the authenticated caller, so a marker minted for
 * one account is useless on another.
 *
 * Stateless by design: the reset token itself is already single-use at Supabase,
 * and the cookie is cleared on success, so there is no separate nonce store to
 * keep consistent.
 */
export const PASSWORD_RECOVERY_COOKIE = 'speddy-pw-recovery';

/** 15 minutes — long enough to choose a password, short enough to not linger. */
export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 900;

/**
 * Signing key. Reuses the service-role key rather than introducing a new
 * required env var, which would leave production broken until it was set. HMAC
 * is one-way, so this never exposes the key. Throws rather than falling back to
 * a constant: an unsigned marker would be forgeable, which is the whole bug.
 */
function signingKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to sign password recovery markers');
  }
  return key;
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('hex');
}

/** Mint a marker for `userId`, valid for PASSWORD_RECOVERY_MAX_AGE_SECONDS. */
export function issueRecoveryMarker(userId: string, now = Date.now()): string {
  const expiresAt = now + PASSWORD_RECOVERY_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * True only when `value` is a well-formed marker, correctly signed, unexpired,
 * and issued for `userId`. Any failure returns false — callers 403.
 */
export function verifyRecoveryMarker(
  value: string | undefined | null,
  userId: string,
  now = Date.now(),
): boolean {
  if (!value || !userId) return false;

  // rsplit on the last dot: a userId never contains one, but be explicit rather
  // than relying on that.
  const lastDot = value.lastIndexOf('.');
  if (lastDot <= 0) return false;

  const payload = value.slice(0, lastDot);
  const provided = value.slice(lastDot + 1);

  const firstDot = payload.indexOf('.');
  if (firstDot <= 0) return false;

  const markerUserId = payload.slice(0, firstDot);
  const expiresAt = Number(payload.slice(firstDot + 1));

  if (markerUserId !== userId) return false;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }

  // Constant-time compare; equal length is required before timingSafeEqual.
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Cookie attributes for the marker. httpOnly so page scripts can't read it (it
 * is not the boundary — the signature is — but there is no reason to expose it);
 * `lax` because the user arrives via a top-level GET navigation from the email.
 */
export const passwordRecoveryCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: PASSWORD_RECOVERY_MAX_AGE_SECONDS,
} as const;
