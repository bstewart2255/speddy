/**
 * Say on every server boot whether this deployment can encrypt SIS credentials
 * (SPE-420).
 *
 * The /internal button answers the same question, but only when a human both
 * suspects a key problem and remembers the button exists. That is a pull; this
 * is the push. In SPE-417 a build went live without the key and nothing emitted
 * a single signal — the failure window stayed open until a district tried to
 * save a certificate and failed. This closes it at deploy time with no human
 * action.
 *
 * Modelled on `logSentryStatus()`, which exists for the same reason (SPE-175: a
 * config value wrong on the running build, with nothing saying so).
 *
 * Two things it must never do, because a boot-time check that misbehaves is
 * worse than the problem it reports:
 *
 *  - throw. Anything raised here happens before the server can serve a request,
 *    so a bug would take the whole deployment down over a diagnostic. Every
 *    path is wrapped.
 *  - cry wolf locally. A developer with no SIS key is a normal, healthy state;
 *    raising a Sentry event on every `npm run dev` would train everyone to
 *    ignore the one that matters. It escalates only on a real deployment.
 *
 * Server-only: pulls in Node crypto through the self-test, so it must be
 * imported dynamically from the nodejs branch of instrumentation, never the
 * edge one.
 */
import { logger } from '@/lib/logger';
import { sisCredentialEncryptionSelfTest } from './credential-crypto';

const log = logger.child({ module: 'sis-key-boot-check' });

/**
 * Runs the same self-test the /internal check does, so the boot log and the
 * button can never disagree. Returns nothing: this is a report, and no caller
 * should branch on it.
 */
export function reportSisKeyStatusOnBoot(): void {
  try {
    const result = sisCredentialEncryptionSelfTest();

    if (result.ok) {
      // One line per cold start, matching the Sentry status line. Cheap to
      // ignore when healthy, and the thing you grep for when it is not.
      console.log('[sis] credential encryption key is live on this build');
      return;
    }

    // `VERCEL_ENV` is set on every Vercel deployment and on none of the local
    // runs, which is exactly the line between "this is a real problem" and "a
    // developer does not happen to need SIS today".
    if (process.env.VERCEL_ENV) {
      // error, not warn: lib/logger only forwards to Sentry from error, and an
      // alert nobody receives is the failure mode this whole ticket is about.
      log.error(
        'SIS credential encryption is not usable on this build — districts cannot save SIS credentials',
        new Error(result.problem),
        { vercelEnv: process.env.VERCEL_ENV },
      );
    } else {
      console.warn(`[sis] credential encryption key not usable locally: ${result.problem}`);
    }
  } catch (err) {
    // Should be unreachable — the self-test catches its own failures — but this
    // runs before the server can answer anything, so it fails quiet rather than
    // taking a deployment down to report on a key.
    console.warn(
      '[sis] credential encryption boot check could not run:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
