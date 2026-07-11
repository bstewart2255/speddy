import { randomBytes } from 'crypto';
import {
  decryptToken,
  encryptToken,
  tokenEncryptionConfigured,
} from '@/lib/calendar/token-crypto';

describe('calendar token crypto', () => {
  const key = randomBytes(32).toString('base64');

  beforeEach(() => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = key;
  });

  afterAll(() => {
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  });

  it('round-trips a token', () => {
    const secret = 'ya29.a0AfH6SMBx-fake-token-value';
    expect(decryptToken(encryptToken(secret))).toBe(secret);
  });

  it('uses a fresh IV per encryption', () => {
    const secret = 'same-plaintext';
    const a = encryptToken(secret);
    const b = encryptToken(secret);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(secret);
    expect(decryptToken(b)).toBe(secret);
  });

  it('rejects tampered ciphertext', () => {
    const parts = encryptToken('secret').split('.');
    parts[2] = randomBytes(Buffer.from(parts[2], 'base64').length).toString(
      'base64'
    );
    expect(() => decryptToken(parts.join('.'))).toThrow();
  });

  it('rejects unrecognized formats', () => {
    expect(() => decryptToken('not-an-encrypted-token')).toThrow(
      'Unrecognized encrypted token format'
    );
  });

  it('requires the key to be configured', () => {
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    expect(tokenEncryptionConfigured()).toBe(false);
    expect(() => encryptToken('x')).toThrow('CALENDAR_TOKEN_ENCRYPTION_KEY');
  });

  it('rejects keys that are not 32 bytes', () => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY =
      randomBytes(16).toString('base64');
    expect(tokenEncryptionConfigured()).toBe(false);
    expect(() => encryptToken('x')).toThrow('32 bytes');
  });
});
