// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

// Only initialize Sentry in production
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || 'https://dfe4322e91dde4865165f296d9264784@o4509770864787457.ingest.us.sentry.io/4509837723631616',
    
    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: 1.0,
    
    // Enable logs to be sent to Sentry
    enableLogs: true,
    
    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,
    
    // Replays are disabled by default
    replaysOnErrorSampleRate: 1.0,
    
    // You can remove this option if you're not planning to use the Sentry Session Replay feature
    replaysSessionSampleRate: 0.1,
    
    integrations: [
      Sentry.replayIntegration({
        // Mask all text and inputs by default
        maskAllText: true,
        maskAllInputs: true,
      }),
    ],
    
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
      
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
