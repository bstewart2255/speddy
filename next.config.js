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
  // Ensure CSS is processed correctly
  webpack: config => {
    // Ensure CSS modules work properly
    return config;
  },
};

// Conditionally apply Sentry configuration
const shouldUseSentry = process.env.NODE_ENV === 'production' && !process.env.SKIP_SENTRY;

// Wrap the config with Sentry only in production or if not skipping
module.exports = shouldUseSentry 
  ? withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'chickenscratch',
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
