const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Skip type checking during build if already checked
    ignoreBuildErrors: process.env.SKIP_TYPE_CHECK === 'true',
  },
  allowedDevOrigins: ['*.replit.dev', '*.spock.replit.dev', '*.kirk.replit.dev'],

  // Surface the Sentry deployment metadata to the browser bundle.
  //
  // instrumentation-client.ts needs the environment, release and trace rate,
  // but the browser can only read NEXT_PUBLIC_* values. Vercel's own
  // NEXT_PUBLIC_VERCEL_* system variables depend on the "Automatically expose
  // System Environment Variables" project setting, so these are derived here
  // from the plain server-side variables — which are always present at build
  // time — rather than relying on that setting being enabled.
  //
  // Without this, preview builds report client errors as `production` with no
  // release, and SENTRY_TRACES_SAMPLE_RATE=0 would silently fail to stop
  // browser traces.
  env: {
    NEXT_PUBLIC_SENTRY_ENVIRONMENT:
      process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA || '',
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.SENTRY_TRACES_SAMPLE_RATE || '',
  },

  // Ensure CSS is processed correctly
  webpack: config => {
    // Ensure CSS modules work properly
    return config;
  },
};

// Conditionally apply Sentry configuration
const shouldUseSentry = process.env.NODE_ENV === 'production' && process.env.SKIP_SENTRY !== 'true';

// Wrap the config with Sentry only in production or if not skipping
module.exports = shouldUseSentry 
  ? withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  // These must match the real Sentry org/project slugs, or the source-map
  // upload silently no-ops and production stack traces stay minified. This was
  // 'chickenscratch', which is not a slug that exists on our account (SPE-175).
  org: 'chicken-scratch-backend',
  project: 'speddy',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: false, // Disabled to improve build performance

  // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
  tunnelRoute: '/monitoring',

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
})
  : nextConfig;
