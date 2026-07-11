/**
 * App-layer encryption for stored OAuth tokens (SPE-205).
 *
 * calendar_connections holds ciphertext only; the key lives in the
 * CALENDAR_TOKEN_ENCRYPTION_KEY env var (32 bytes, base64 — generate with
 * `openssl rand -base64 32`) and never touches the database. AES-256-GCM,
 * fresh IV per encryption, auth tag verified on decrypt.
 *
 * Server-only: uses Node crypto and a secret env var. Never import from
 * client components.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VERSION = 'v1';

function getKey(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEY is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'CALENDAR_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (openssl rand -base64 32)'
    );
  }
  return key;
}

export function tokenEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Returns `v1.<iv>.<ciphertext>.<tag>`, each part base64. */
export function encryptToken(plaintext: string): string {
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

export function decryptToken(encrypted: string): string {
  const [version, ivB64, dataB64, tagB64] = encrypted.split('.');
  if (version !== VERSION || !ivB64 || !dataB64 || !tagB64) {
    throw new Error('Unrecognized encrypted token format');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
