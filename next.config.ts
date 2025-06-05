import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remove experimental flag as app directory is now stable in Next.js 13.4+
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: [], // Add any image domains you'll use later
  },
  // Ensure TypeScript and ESLint don't block production builds
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;