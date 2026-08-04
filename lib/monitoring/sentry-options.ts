// Shared Sentry configuration for all three runtimes (server, edge, client).
//
// The three `Sentry.init` call sites have to stay separate files — that's how
// the Next.js SDK loads them — but the values they share live here once.
//
// Background (SPE-175): the DSN used to be a hardcoded literal repeated in all
// three files, pointing at org `o4509770864787457` / project `4509837723631616`.
// Neither exists in our Sentry account, so Sentry rejected every event with
// "403 event submission rejected with_reason: ProjectId" and nothing surfaced
// the failure. Speddy shipped with error monitoring that reported nothing.
//
// Two things guard against a repeat: the values below are defined once, and
// `logSentryStatus()` states on boot which project is being reported to.

/**
 * Default DSN for the `speddy` project in the `chicken-scratch-backend` org.
 *
 * A DSN is a public identifier, not a secret — it ships inside the client
 * bundle by design — so it lives in the repo, which keeps a deploy from going
 * dark if the environment variable is ever missing. Set `SENTRY_DSN` /
 * `NEXT_PUBLIC_SENTRY_DSN` to point a given environment somewhere else.
 */
const DEFAULT_DSN =
  'https://c3cc66481d5f3bb0ff57f49d01496962@o4511260555345920.ingest.us.sentry.io/4511849649930240';

/**
 * Deployment environment, so production errors stay separate from preview and
 * local ones in the Sentry UI. Without this every deploy shares one stream and
 * a preview-only bug looks like a production incident.
 *
 * On the client only `NEXT_PUBLIC_*` vars are inlined at build time; the others
 * resolve to `undefined` there and this falls through to `NODE_ENV`. On the
 * server every var is readable at runtime.
 */
export const sentryEnvironment: string =
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV ||
  'development';

/**
 * Release identifier, so an error can be traced to the deploy that introduced
 * it. Vercel exposes the commit SHA; elsewhere this is undefined and Sentry
 * groups everything under "no release".
 */
export const sentryRelease: string | undefined =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  undefined;

/**
 * Trace sampling. Traces carry URL paths, and ours embed resource IDs
 * (SPE-216), so any deployed environment samples a slice rather than all of
 * them — cutting both the data leaving the app and the Sentry quota by 10x.
 * Exception capture is never affected by this value; errors are always sent.
 *
 * Only local development samples everything. Preview deploys are treated like
 * production here on purpose: they run against real data, so full trace capture
 * there would leak the same resource IDs SPE-216 is about.
 *
 * Set `SENTRY_TRACES_SAMPLE_RATE=0` to disable tracing entirely and keep Sentry
 * to exception capture only.
 */
function resolveTracesSampleRate(): number {
  const raw =
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ||
    process.env.SENTRY_TRACES_SAMPLE_RATE;

  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }

  return sentryEnvironment === 'development' ? 1.0 : 0.1;
}

export const sentryTracesSampleRate: number = resolveTracesSampleRate();

/** Resolve the DSN for a runtime. Client can only read `NEXT_PUBLIC_*` vars. */
export function resolveSentryDsn(runtime: 'server' | 'edge' | 'client'): string {
  const configured =
    runtime === 'client'
      ? process.env.NEXT_PUBLIC_SENTRY_DSN
      : process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

  return configured || DEFAULT_DSN;
}

/**
 * Announce on boot which Sentry project this runtime reports to.
 *
 * The previous misconfiguration was invisible precisely because nothing ever
 * said where events were going. One line per cold start makes a wrong or
 * missing project obvious in the deploy logs instead of silent.
 */
export function logSentryStatus(runtime: 'server' | 'edge', dsn: string): void {
  // Project ID is the trailing path segment of the DSN; it is not sensitive.
  const projectId = dsn.split('/').pop() || 'unknown';
  console.log(
    `[sentry] ${runtime} reporting to project ${projectId} ` +
      `(environment=${sentryEnvironment}, traces=${sentryTracesSampleRate})`
  );
}
