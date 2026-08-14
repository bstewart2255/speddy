/**
 * cronTokenMatches (SPE-299) — constant-time cron secret comparison.
 *
 * The point of these tests is that hardening the comparison did not change what
 * it *decides*. A timing fix that quietly starts accepting the wrong token, or
 * rejecting the right one, is far worse than the leak it closed — so the
 * accept/reject contract is pinned first, and the length-independence that
 * motivated the digest is pinned separately.
 */
import { cronTokenMatches } from '@/lib/api/cron-auth';

const SECRET = 'a-real-looking-cron-secret-9f3b21';

describe('cronTokenMatches', () => {
  it('accepts the exact secret', () => {
    expect(cronTokenMatches(SECRET, SECRET)).toBe(true);
  });

  it('rejects a token that differs only in the last character', () => {
    expect(cronTokenMatches(SECRET.slice(0, -1) + 'X', SECRET)).toBe(false);
  });

  it('rejects a token that differs only in the first character', () => {
    expect(cronTokenMatches('X' + SECRET.slice(1), SECRET)).toBe(false);
  });

  it('rejects a prefix of the secret', () => {
    // The case that makes a naive timingSafeEqual throw rather than return
    // false: unequal buffer lengths. Digesting both sides is what keeps this a
    // decision instead of a 500.
    expect(cronTokenMatches(SECRET.slice(0, 8), SECRET)).toBe(false);
  });

  it('rejects a token far longer than the secret without throwing', () => {
    expect(cronTokenMatches(SECRET + 'x'.repeat(5000), SECRET)).toBe(false);
  });

  it('is case- and whitespace-sensitive, like the comparison it replaced', () => {
    expect(cronTokenMatches(SECRET.toUpperCase(), SECRET)).toBe(false);
    expect(cronTokenMatches(` ${SECRET}`, SECRET)).toBe(false);
  });

  it('never matches when the secret is unset, whatever the caller sends', () => {
    // A route treats this as a 500 before asking, but the helper must not be
    // the thing that would let an empty env var authenticate an empty token.
    expect(cronTokenMatches(SECRET, undefined)).toBe(false);
    expect(cronTokenMatches(SECRET, '')).toBe(false);
    expect(cronTokenMatches('', '')).toBe(false);
    expect(cronTokenMatches(undefined, undefined)).toBe(false);
  });

  it('never matches when the caller sends nothing', () => {
    expect(cronTokenMatches(null, SECRET)).toBe(false);
    expect(cronTokenMatches(undefined, SECRET)).toBe(false);
    expect(cronTokenMatches('', SECRET)).toBe(false);
  });

  it('handles multi-byte secrets without throwing on a byte-length mismatch', () => {
    // 'é' is two UTF-8 bytes but one JS character, so a length check done in
    // characters and a comparison done in bytes disagree here.
    expect(cronTokenMatches('sécret-☂', 'sécret-☂')).toBe(true);
    expect(cronTokenMatches('secret-☂', 'sécret-☂')).toBe(false);
  });
});
