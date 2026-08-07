/**
 * App-layer encryption for stored SIS credentials (SPE-395).
 *
 * `district_sis_connections` holds ciphertext only — an Aeries certificate, or
 * a OneRoster client id/secret. The key lives in the
 * SIS_CREDENTIAL_ENCRYPTION_KEY env var (32 bytes, base64 — generate with
 * `openssl rand -base64 32`) and never touches the database. AES-256-GCM,
 * fresh IV per encryption, auth tag verified on decrypt.
 *
 * Deliberately a SEPARATE key from CALENDAR_TOKEN_ENCRYPTION_KEY rather than a
 * shared "app secret": these protect different data classes with different
 * blast radii — a calendar token reaches one user's calendar, a district's SIS
 * certificate reaches every student record in that district. Separate keys mean
 * either can be rotated without touching the other, and a leak of one does not
 * decrypt the other.
 *
 * Server-only: uses Node crypto and a secret env var. Never import from client
 * components.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VERSION = 'v1';

function getKey(): Buffer {
  const raw = process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('SIS_CREDENTIAL_ENCRYPTION_KEY is not set');
  }
  // Canonical base64, checked BEFORE decoding. Buffer.from(x, 'base64')
  // silently discards characters it doesn't recognise, so a good 32-byte key
  // with junk appended ("…=!!!") decodes to a valid-looking 32 bytes and would
  // sail past a length check alone. A key that is subtly not the key you think
  // it is fails at decrypt time, long after the ciphertext was written.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
    throw new Error(
      'SIS_CREDENTIAL_ENCRYPTION_KEY must be canonical base64 of 32 bytes (openssl rand -base64 32)'
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'SIS_CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes (openssl rand -base64 32)'
    );
  }
  return key;
}

/**
 * Why the key is unusable, or null when it is fine.
 *
 * Callers use this to fail a credential-intake request up front, rather than
 * throwing mid-write and leaving a half-built connection row behind.
 *
 * Returns the reason rather than a bare boolean so an operator can tell a key
 * that was never set apart from one that was set and is malformed. Those are
 * the same symptom and completely different fixes — add the variable, versus
 * find the stray newline in the one you already added — and collapsing them
 * into "not configured" cost a live district half a morning (SPE-417): the key
 * had been set in Vercel, so the message read as a lie and the real cause
 * (a build that predated it) went unexamined.
 *
 * Safe to log: every message names the variable and never its value.
 */
export function sisCredentialEncryptionProblem(): string | null {
  try {
    getKey();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'SIS_CREDENTIAL_ENCRYPTION_KEY is unusable';
  }
}

/**
 * A fixed, non-secret probe. Never a real credential and never stored — it
 * exists only to be encrypted and decrypted back inside a single function call.
 */
const SELF_TEST_PROBE = 'speddy-sis-key-self-test';

/**
 * The one failure this function originates. Names the cipher rather than the
 * key: by the time it can be reached the key has already passed getKey(), so
 * blaming the key would send an operator to rotate a healthy one.
 */
export const SELF_TEST_ROUND_TRIP_FAILED =
  'The encryption key is present and well-formed, but this deployment could not run the cipher.';

export type SisKeySelfTest =
  | { ok: true }
  | { ok: false; problem: string };

/**
 * Prove the configured key can actually encrypt AND decrypt, right now.
 *
 * `sisCredentialEncryptionProblem()` answers "is the key well-formed"; this
 * additionally runs the cipher.
 *
 * Be precise about what that buys, because it is less than it sounds. getKey()
 * admits only canonical base64 decoding to exactly 32 bytes, and every 32-byte
 * value is a valid AES-256 key — so NO accepted key can fail the round trip.
 * What the round trip actually catches is the crypto provider being unusable
 * (a FIPS-mode build where aes-256-gcm is unavailable makes createCipheriv
 * throw), which a format check cannot see and which would otherwise surface as
 * a district's failed save. Real, but narrower than "the key is wrong".
 *
 * What it deliberately does NOT prove: that this is the SAME key that encrypted
 * credentials already in the database. The round trip uses the current key for
 * both halves, so any well-formed key passes. Only real stored ciphertext could
 * answer that, and this function touches none. After a key ROTATION a green
 * result therefore means "new credentials can be saved", never "existing ones
 * can still be read" — those come apart exactly when a rotation went wrong,
 * which is when someone is most likely to be looking at this.
 *
 * Touches nothing: no database, no district, no stored credential. The probe is
 * a constant, and the round trip lives entirely in memory. That is what makes
 * this safe to expose behind the /internal staff gate — it reports on the
 * environment, never on anyone's data.
 *
 * Safe to return to a caller: `problem` is either a message from getKey() (which
 * names the variable, never its value) or one of the fixed strings below. No
 * upstream error text is interpolated — the same rule the sibling /internal
 * routes state as "Fixed message, not `message`: the detail belongs in the log
 * line". The detail is not lost; the route logs the thrown error.
 */
export function sisCredentialEncryptionSelfTest(): SisKeySelfTest {
  const problem = sisCredentialEncryptionProblem();
  if (problem) return { ok: false, problem };

  try {
    if (decryptSisCredential(encryptSisCredential(SELF_TEST_PROBE)) !== SELF_TEST_PROBE) {
      // GCM's auth tag makes a silent mismatch impossible, so this is a
      // belt-and-braces guard against an assumption breaking — not a state any
      // key can produce. Kept because returning a false `ok` is the one outcome
      // this function must never have.
      return { ok: false, problem: SELF_TEST_ROUND_TRIP_FAILED };
    }
    return { ok: true };
  } catch {
    // Deliberately does NOT carry `err.message`. Reaching here means the cipher
    // itself is unusable, so the message is a Node/OpenSSL string this module
    // does not author and cannot audit — and it is returned to a browser and
    // written to logs. The route logs the real error alongside this.
    return { ok: false, problem: SELF_TEST_ROUND_TRIP_FAILED };
  }
}

/** Returns `v1.<iv>.<ciphertext>.<tag>`, each part base64. */
export function encryptSisCredential(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join('.');
}

export function decryptSisCredential(encrypted: string): string {
  // Exactly four parts. Destructuring alone ignores extras, so
  // `<valid-envelope>.junk` would decrypt happily — the GCM tag covers the
  // ciphertext, not the envelope around it.
  const parts = encrypted.split('.');
  if (parts.length !== 4) {
    throw new Error('Unrecognized encrypted SIS credential format');
  }
  const [version, ivB64, dataB64, tagB64] = parts;
  if (version !== VERSION || !ivB64 || !dataB64 || !tagB64) {
    throw new Error('Unrecognized encrypted SIS credential format');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  // Node's setAuthTag accepts 4, 8, and 12-15 byte GCM tags as well as 16, so
  // a truncated tag decrypts happily on a value that still looks like a valid
  // envelope. Nothing we write produces one — encrypt always emits 12/16 — so
  // pinning the lengths costs nothing and keeps the tag's guarantee full-width
  // rather than whatever a stored value happens to claim.
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Unrecognized encrypted SIS credential format');
  }
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Last 4 characters, for display next to a stored credential ("…a9f2").
 *
 * This is the ONLY part of a credential that may be persisted in the clear or
 * shown to a client. Short secrets are masked entirely rather than largely
 * revealed — a 6-character secret would otherwise have two thirds of it printed
 * next to the connection it unlocks.
 */
export function credentialHint(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (trimmed.length < 8) return '••••';
  return `••••${trimmed.slice(-4)}`;
}
