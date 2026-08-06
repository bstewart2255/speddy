import { randomBytes } from 'crypto';
import {
  credentialHint,
  decryptSisCredential,
  encryptSisCredential,
  sisCredentialEncryptionConfigured,
} from '@/lib/sis/credential-crypto';

describe('SIS credential crypto', () => {
  const key = randomBytes(32).toString('base64');

  beforeEach(() => {
    process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = key;
  });

  afterAll(() => {
    delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
  });

  it('round-trips a credential', () => {
    const secret = 'aeries-cert-abc123-fake';
    expect(decryptSisCredential(encryptSisCredential(secret))).toBe(secret);
  });

  it('round-trips a multi-line PEM-shaped certificate', () => {
    // Aeries certificates are pasted by a human out of a web console, so they
    // arrive with newlines and padding intact. Base64 of the ciphertext must
    // survive that unchanged.
    const pem = [
      '-----BEGIN CERTIFICATE-----',
      randomBytes(48).toString('base64'),
      randomBytes(48).toString('base64'),
      '-----END CERTIFICATE-----',
    ].join('\n');
    expect(decryptSisCredential(encryptSisCredential(pem))).toBe(pem);
  });

  it('uses a fresh IV per encryption', () => {
    const secret = 'same-plaintext';
    const a = encryptSisCredential(secret);
    const b = encryptSisCredential(secret);
    expect(a).not.toBe(b);
    expect(decryptSisCredential(a)).toBe(secret);
    expect(decryptSisCredential(b)).toBe(secret);
  });

  it('rejects tampered ciphertext', () => {
    const parts = encryptSisCredential('secret').split('.');
    parts[2] = randomBytes(Buffer.from(parts[2], 'base64').length).toString(
      'base64'
    );
    expect(() => decryptSisCredential(parts.join('.'))).toThrow();
  });

  it('rejects a tampered auth tag', () => {
    const parts = encryptSisCredential('secret').split('.');
    parts[3] = randomBytes(16).toString('base64');
    expect(() => decryptSisCredential(parts.join('.'))).toThrow();
  });

  it('rejects unrecognized formats', () => {
    expect(() => decryptSisCredential('not-an-encrypted-credential')).toThrow(
      'Unrecognized encrypted SIS credential format'
    );
  });

  it('cannot decrypt with a different key', () => {
    const encrypted = encryptSisCredential('secret');
    process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expect(() => decryptSisCredential(encrypted)).toThrow();
  });

  it('does not fall back to the calendar key', () => {
    // The two key spaces must stay independent — a SIS credential encrypted
    // under the SIS key must not be readable just because the calendar key
    // happens to be configured, and vice versa.
    const encrypted = encryptSisCredential('secret');
    delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = key;
    expect(() => decryptSisCredential(encrypted)).toThrow(
      'SIS_CREDENTIAL_ENCRYPTION_KEY is not set'
    );
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  });

  describe('configuration guard', () => {
    it('reports configured with a valid key', () => {
      expect(sisCredentialEncryptionConfigured()).toBe(true);
    });

    it('reports unconfigured when the key is absent', () => {
      delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
      expect(sisCredentialEncryptionConfigured()).toBe(false);
    });

    it('reports unconfigured when the key is the wrong length', () => {
      process.env.SIS_CREDENTIAL_ENCRYPTION_KEY =
        randomBytes(16).toString('base64');
      expect(sisCredentialEncryptionConfigured()).toBe(false);
    });

    it('encrypting without a key throws rather than storing plaintext', () => {
      delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
      expect(() => encryptSisCredential('secret')).toThrow(
        'SIS_CREDENTIAL_ENCRYPTION_KEY is not set'
      );
    });
  });

  describe('credentialHint', () => {
    it('shows only the last 4 characters', () => {
      expect(credentialHint('supersecretvalue9f2a')).toBe('••••9f2a');
    });

    it('masks a short secret entirely rather than mostly revealing it', () => {
      expect(credentialHint('abc123')).toBe('••••');
      expect(credentialHint('abc123')).not.toContain('123');
    });

    it('ignores surrounding whitespace from a paste', () => {
      expect(credentialHint('  supersecretvalue9f2a \n')).toBe('••••9f2a');
    });
  });
});
