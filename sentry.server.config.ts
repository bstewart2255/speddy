// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent, scrubSentryLog } from '@/lib/monitoring/sentry-scrub';

Sentry.init({
  dsn: 'https://dfe4322e91dde4865165f296d9264784@o4509770864787457.ingest.us.sentry.io/4509837723631616',

  // Never attach default request PII (cookies, headers, IP, request bodies) to
  // events. Explicit per SPE-167 even though the SDK default is already false.
  sendDefaultPii: false,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Sentry Logs disabled (SPE-167): structured logs / forwarded console output
  // can carry student context. During the district pilot we keep Sentry to
  // exception capture only. beforeSendLog stays wired for if/when this is re-enabled.
  enableLogs: false,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Redact PII (e.g. emails) before any event or log leaves the server.
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
  beforeSendLog(log) {
    return scrubSentryLog(log);
  },
});
