import * as Sentry from "@sentry/nextjs";

// Only initialize Sentry in production
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    
    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: 1.0,
    
    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,
    
    // Edge runtime specific configuration
    environment: 'edge',
  });
}