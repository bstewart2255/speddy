/**
 * SPE-420 · the boot-time SIS key report.
 *
 * The point of this file is the two behaviours that make a boot check safe to
 * add at all: it must ESCALATE on a real deployment (or it is the same silence
 * that let SPE-417 run), and it must NOT escalate locally (or it becomes noise
 * everyone learns to scroll past, which is the same silence wearing a hat).
 * Both are asserted, in both directions.
 *
 * It must also never throw: this runs before the server can answer a request,
 * so a bug here would take a deployment down over a diagnostic.
 */
import { randomBytes } from 'crypto';

const captured: { message: string; error: unknown; meta: unknown }[] = [];

jest.mock('@/lib/logger', () => {
  const child = () => ({
    error: (message: string, error: unknown, meta: unknown) =>
      captured.push({ message, error, meta }),
    warn: () => {},
    info: () => {},
  });
  return { logger: { child } };
});

// Delegates to the real self-test for every test but one; the flag lets a
// single case force the unexpected-throw path without weakening the others.
let selfTestThrows = false;
jest.mock('@/lib/sis/credential-crypto', () => {
  const actual = jest.requireActual('@/lib/sis/credential-crypto');
  return {
    ...actual,
    sisCredentialEncryptionSelfTest: () => {
      if (selfTestThrows) throw new Error('unexpected');
      return actual.sisCredentialEncryptionSelfTest();
    },
  };
});

import { reportSisKeyStatusOnBoot } from '@/lib/sis/key-boot-check';

describe('reportSisKeyStatusOnBoot', () => {
  const key = randomBytes(32).toString('base64');
  const original = {
    sis: process.env.SIS_CREDENTIAL_ENCRYPTION_KEY,
    vercel: process.env.VERCEL_ENV,
  };
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    captured.length = 0;
    selfTestThrows = false;
    process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = key;
    delete process.env.VERCEL_ENV;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    for (const [name, value] of [
      ['SIS_CREDENTIAL_ENCRYPTION_KEY', original.sis],
      ['VERCEL_ENV', original.vercel],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('announces a healthy key once, and raises nothing', () => {
    reportSisKeyStatusOnBoot();
    expect(logSpy).toHaveBeenCalledWith('[sis] credential encryption key is live on this build');
    expect(captured).toHaveLength(0);
  });

  it('escalates on a real deployment when the key is missing', () => {
    // The whole reason this exists: a build that goes live without the key must
    // produce a signal with no human involved.
    process.env.VERCEL_ENV = 'production';
    delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;

    reportSisKeyStatusOnBoot();

    expect(captured).toHaveLength(1);
    expect(captured[0].message).toMatch(/districts cannot save SIS credentials/);
    // Carried as an Error so lib/logger forwards it to Sentry — a warn would be
    // dropped, which is the failure mode this replaces.
    expect(captured[0].error).toBeInstanceOf(Error);
    expect((captured[0].error as Error).message).toMatch(/is not set/);
  });

  it('escalates on a real deployment when the key is malformed, and says which', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = `${key}\n`;

    reportSisKeyStatusOnBoot();

    expect(captured).toHaveLength(1);
    expect((captured[0].error as Error).message).toMatch(/must be canonical base64/);
  });

  it('does NOT escalate locally — a developer without a SIS key is healthy', () => {
    // Asserted in its own right: if this ever starts raising events from
    // `npm run dev`, the production signal above stops being believed.
    delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;

    reportSisKeyStatusOnBoot();

    expect(captured).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/not usable locally/));
  });

  it('never leaks the key value, on any path', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = `${key}\n`;

    reportSisKeyStatusOnBoot();

    const everythingItSaid = JSON.stringify([
      captured.map(c => [c.message, (c.error as Error)?.message, c.meta]),
      logSpy.mock.calls,
      warnSpy.mock.calls,
    ]);
    expect(everythingItSaid).not.toContain(key);
  });

  it('never throws, even if the self-test itself blows up', () => {
    // A boot check that can crash the server is worse than the gap it fills.
    //
    // The failure is injected at the self-test itself, not deeper: the self-test
    // catches its own errors, so anything thrown inside it never reaches this
    // module and a test aimed there would pass without exercising the outer
    // guard at all. Asserting the fallback message is what proves the guard ran
    // rather than the call simply having succeeded.
    process.env.VERCEL_ENV = 'production';
    selfTestThrows = true;
    try {
      expect(() => reportSisKeyStatusOnBoot()).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/boot check could not run/),
        'unexpected',
      );
      // And it stays quiet rather than raising a misleading "key is broken".
      expect(captured).toHaveLength(0);
    } finally {
      selfTestThrows = false;
    }
  });
});
