// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent, scrubSentryLog } from '@/lib/monitoring/sentry-scrub';
import {
  logSentryStatus,
  resolveSentryDsn,
  sentryEnvironment,
  sentryRelease,
  sentryTracesSampleRate,
} from '@/lib/monitoring/sentry-options';

const dsn = resolveSentryDsn('edge');

Sentry.init({
  dsn,

  // Keeps production errors separate from preview/local ones, and ties each
  // error to the deploy that introduced it. See lib/monitoring/sentry-options.
  environment: sentryEnvironment,
  release: sentryRelease,

  // Never attach default request PII (cookies, headers, IP, request bodies) to
  // events. Explicit per SPE-167 even though the SDK default is already false.
  sendDefaultPii: false,

  // Sampled in production (SPE-216); exception capture is unaffected.
  tracesSampleRate: sentryTracesSampleRate,

  // Sentry Logs disabled (SPE-167): structured logs / forwarded console output
  // can carry student context. During the district pilot we keep Sentry to
  // exception capture only. beforeSendLog stays wired for if/when this is re-enabled.
  enableLogs: false,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Redact PII (e.g. emails) before any event or log leaves the edge runtime.
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
  beforeSendLog(log) {
    return scrubSentryLog(log);
  },
});

logSentryStatus('edge', dsn);
