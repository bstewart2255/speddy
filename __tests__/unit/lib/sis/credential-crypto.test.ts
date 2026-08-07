import { randomBytes } from 'crypto';
import {
  credentialHint,
  decryptSisCredential,
  encryptSisCredential,
  sisCredentialEncryptionProblem,
  sisCredentialEncryptionSelfTest,
} from '@/lib/sis/credential-crypto';

describe('SIS credential crypto', () => {
  const key = randomBytes(32).toString('base64');

  // Snapshot and restore BOTH keys. These tests mutate and delete process.env
  // entries that later files in the same Jest worker may depend on, so leaving
  // the environment modified would make an unrelated suite fail depending on
  // file order — the kind of failure that looks like a real bug for an hour.
  const original = {
    sis: process.env.SIS_CREDENTIAL_ENCRYPTION_KEY,
    calendar: process.env.CALENDAR_TOKEN_ENCRYPTION_KEY,
  };

  beforeEach(() => {
    process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = key;
  });

  afterEach(() => {
    for (const [name, value] of [
      ['SIS_CREDENTIAL_ENCRYPTION_KEY', original.sis],
      ['CALENDAR_TOKEN_ENCRYPTION_KEY', original.calendar],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('round-trips a credential', () => {
    const secret = 'aeries-cert-abc123-fake';
    expect(decryptSisCredential(encryptSisCredential(secret))).toBe(secret);
  });

  it('round-trips a real-shaped Aeries certificate', () => {
    // The actual thing: a 32-char hex vendor certificate, sent as the
    // AERIES-CERT header value (lib/integrations/aeries/config.ts).
    const cert = '477abe9e7d27439681d62f4e0de1f5e1';
    expect(decryptSisCredential(encryptSisCredential(cert))).toBe(cert);
    expect(credentialHint(cert)).toBe('••••f5e1');
  });

  it('round-trips arbitrary UTF-8, including newlines', () => {
    // Not a claim about how Aeries certificates arrive — they are 32 hex
    // characters on a header line. This pins that the envelope is byte-faithful
    // for any credential a future provider might use, so encryption never
    // silently mutates what it was handed.
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

  it('rejects a truncated auth tag rather than accepting a weaker one', () => {
    // Node accepts 4-, 8- and 12-to-15-byte GCM tags via setAuthTag, so without
    // an explicit check a 4-byte tag verifies successfully — a full-width
    // guarantee quietly replaced by a much narrower one.
    const parts = encryptSisCredential('secret').split('.');
    for (const shortLength of [4, 8, 12, 15]) {
      const truncated = [...parts];
      truncated[3] = Buffer.from(parts[3], 'base64')
        .subarray(0, shortLength)
        .toString('base64');
      expect(() => decryptSisCredential(truncated.join('.'))).toThrow(
        'Unrecognized encrypted SIS credential format'
      );
    }
  });

  it('rejects a wrong-length IV', () => {
    const parts = encryptSisCredential('secret').split('.');
    parts[1] = randomBytes(16).toString('base64');
    expect(() => decryptSisCredential(parts.join('.'))).toThrow(
      'Unrecognized encrypted SIS credential format'
    );
  });

  it('rejects an envelope with extra fields appended', () => {
    // The GCM tag authenticates the ciphertext, not the envelope, so trailing
    // junk must be rejected structurally or it decrypts as if it were absent.
    const encrypted = encryptSisCredential('secret');
    expect(() => decryptSisCredential(`${encrypted}.junk`)).toThrow(
      'Unrecognized encrypted SIS credential format'
    );
  });

  it('rejects an envelope with too few fields', () => {
    const parts = encryptSisCredential('secret').split('.');
    expect(() => decryptSisCredential(parts.slice(0, 3).join('.'))).toThrow(
      'Unrecognized encrypted SIS credential format'
    );
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
  });

  describe('configuration guard', () => {
    it('reports no problem with a valid key', () => {
      expect(sisCredentialEncryptionProblem()).toBeNull();
    });

    it('says the key is absent when it is not set', () => {
      delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
      expect(sisCredentialEncryptionProblem()).toMatch(/is not set/);
    });

    it('rejects a valid key with trailing junk', () => {
      // Buffer.from ignores unrecognised base64 characters, so this decodes to
      // a plausible 32 bytes. Only a canonical-format check catches it.
      process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = `${key}!!!`;
      expect(sisCredentialEncryptionProblem()).toMatch(/canonical base64/);
      expect(() => encryptSisCredential('secret')).toThrow('canonical base64');
    });

    it('rejects a key with embedded whitespace or newlines', () => {
      // The paste artefact that actually happens: `openssl rand -base64 32`
      // emits a trailing newline, and a dashboard field keeps it.
      process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = `${key}\n`;
      expect(sisCredentialEncryptionProblem()).toMatch(/canonical base64/);
    });

    it('rejects a key of the wrong length', () => {
      // Rejected by the canonical-format regex (43 chars + '='), not by the
      // byte-length check below it — a 16-byte key is 24 base64 characters, so
      // it never reaches that branch. Named accurately because a test that
      // claims to cover the length check while exercising the regex leaves the
      // length check looking tested when it is not.
      process.env.SIS_CREDENTIAL_ENCRYPTION_KEY =
        randomBytes(16).toString('base64');
      expect(sisCredentialEncryptionProblem()).toMatch(/canonical base64/);
    });

    it('encrypting without a key throws rather than storing plaintext', () => {
      delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
      expect(() => encryptSisCredential('secret')).toThrow(
        'SIS_CREDENTIAL_ENCRYPTION_KEY is not set'
      );
    });

    it('distinguishes an absent key from a malformed one', () => {
      // The two cases are one symptom with two different fixes. Asserting they
      // produce DIFFERENT messages is the whole point — a shared "unusable"
      // string would satisfy a laxer test while leaving an operator no better
      // off than the "not configured" message this replaced.
      delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
      const absent = sisCredentialEncryptionProblem();

      process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = `${key}\n`;
      const malformed = sisCredentialEncryptionProblem();

      expect(absent).toMatch(/is not set/);
      expect(malformed).toMatch(/must be canonical base64/);
      expect(absent).not.toEqual(malformed);
    });

    it('self-test passes with a working key', () => {
      expect(sisCredentialEncryptionSelfTest()).toEqual({ ok: true });
    });

    it('self-test reports WHY, distinguishing absent from malformed', () => {
      // Same reasoning as the problem-string test above: the two faults have
      // opposite fixes, so a self-test that collapsed them would leave an
      // operator exactly where the "not configured" message left us.
      delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
      const absent = sisCredentialEncryptionSelfTest();

      process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = `${key}\n`;
      const malformed = sisCredentialEncryptionSelfTest();

      expect(absent).toEqual({ ok: false, problem: expect.stringMatching(/is not set/) });
      expect(malformed).toEqual({
        ok: false,
        problem: expect.stringMatching(/must be canonical base64/),
      });
    });

    it('self-test passes on a DIFFERENT key — it cannot detect a wrong-but-valid key', () => {
      // Pinning the limit, not a feature. The self-test encrypts and decrypts
      // with whatever key is currently set, so any well-formed key round-trips.
      // It answers "can this deployment encrypt", NOT "is this the key that
      // encrypted the credentials already stored" — nothing without real
      // ciphertext can answer that, and a green check must not be read as if it
      // had. Asserted so the day someone widens the claim, this fails and sends
      // them here.
      const ciphertext = encryptSisCredential('spe417-stored-under-the-old-key');
      process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');

      expect(sisCredentialEncryptionSelfTest()).toEqual({ ok: true });
      // Meanwhile the credential encrypted under the previous key is gone.
      expect(() => decryptSisCredential(ciphertext)).toThrow();
    });

    it('never puts the key value in the self-test problem', () => {
      process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = `${key}\n`;
      const result = sisCredentialEncryptionSelfTest();
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.problem).not.toContain(key);
    });

    it('never puts the key value in the reported problem', () => {
      // These strings are logged and read by operators. A malformed key is
      // still key material.
      process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = `${key}\n`;
      expect(sisCredentialEncryptionProblem()).not.toContain(key);
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
