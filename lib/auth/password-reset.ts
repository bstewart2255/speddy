/**
 * Shared constants for the self-service password reset flow (SPE-68).
 *
 * `/auth/reset-callback` sets this marker only after Supabase has verified the
 * emailed recovery link, and `POST /api/auth/reset-password` refuses to run
 * without it. Without the marker, that endpoint would accept ANY authenticated
 * session — its whole premise is "the caller proved control of the mailbox," and
 * an ordinary logged-in session is not that proof.
 *
 * Short-lived on purpose: it exists only to bridge the callback redirect to the
 * form submit, which is a matter of minutes. It is cleared as soon as the reset
 * succeeds, so a completed link can't be replayed from the same browser.
 */
export const PASSWORD_RECOVERY_COOKIE = 'speddy-pw-recovery';

/** 15 minutes — long enough to choose a password, short enough to not linger. */
export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 900;

/**
 * Cookie attributes for the recovery marker. httpOnly so page scripts can't
 * mint it; `lax` because the user arrives via a top-level GET navigation from
 * the email link.
 */
export const passwordRecoveryCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: PASSWORD_RECOVERY_MAX_AGE_SECONDS,
} as const;
