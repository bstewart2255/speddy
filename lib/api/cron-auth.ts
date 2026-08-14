import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time check of a caller-supplied cron token against `CRON_SECRET`
 * (SPE-299).
 *
 * The four cron routes each compared with `!==`, which returns as soon as it
 * hits a differing byte. Over HTTPS through Vercel that is not practically
 * exploitable — network jitter swamps the signal — but the comparison is one
 * line either way, and "unexploitable today" is a property of the deployment,
 * not of the code.
 *
 * Both sides are hashed to a fixed-width SHA-256 digest before comparing.
 * That is not for secrecy: `timingSafeEqual` throws when the two buffers differ
 * in length, and the length of a secret is itself information worth not
 * leaking. Digesting makes both operands 32 bytes, so every rejection costs the
 * same regardless of how long the supplied token is or where it diverges.
 *
 * Equal secrets hash equal, so the accept path is byte-for-byte what it was.
 */
export function cronTokenMatches(
  token: string | null | undefined,
  expected: string | null | undefined
): boolean {
  // A missing secret is a server misconfiguration, not an auth decision — the
  // routes surface that as a 500 before calling this. A missing token is simply
  // an unauthenticated caller. Neither can match.
  if (!token || !expected) return false;

  const supplied = createHash('sha256').update(token, 'utf8').digest();
  const secret = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(supplied, secret);
}
