// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent, scrubSentryLog } from '@/lib/monitoring/sentry-scrub';

// Only initialize Sentry in production
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || 'https://dfe4322e91dde4865165f296d9264784@o4509770864787457.ingest.us.sentry.io/4509837723631616',

    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: 1.0,

    // Never attach default request PII (cookies, headers, IP, bodies) to events.
    // Explicit per SPE-167 even though the SDK default is already false.
    sendDefaultPii: false,

    // Sentry Logs disabled (SPE-167): forwarded console output can carry student
    // context. During the district pilot we keep Sentry to exception capture only.
    enableLogs: false,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // Session Replay intentionally disabled (SPE-167): even with text/input
    // masking it is a session-capture feature we don't want recording
    // special-ed / IEP workflows during the district pilot.

    // Filter out specific errors
    beforeSend(event, hint) {
      // Don't send errors in development
      if (process.env.NODE_ENV === 'development') {
        return null;
      }

      // Filter out specific errors you don't want to track
      const error = hint.originalException;
      if (error && error instanceof Error) {
        // Don't track network errors that are expected
        if (error.message?.includes('NetworkError') ||
            error.message?.includes('Failed to fetch')) {
          return null;
        }
      }

      // Redact PII (e.g. emails) before the event leaves the browser.
      return scrubSentryEvent(event);
    },
    beforeSendLog(log) {
      return scrubSentryLog(log);
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
