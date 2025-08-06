const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Ensure CSS is processed correctly
  webpack: (config) => {
    // Ensure CSS modules work properly
    return config
  },
}

// Wrap the config with Sentry
module.exports = withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // Suppresses source map uploading logs during build
    silent: true,
    
    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
    tunnelRoute: "/monitoring",
    
    // Hides source maps from generated client bundles
    hideSourceMaps: true,
    
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
  }
);