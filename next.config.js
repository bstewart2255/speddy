/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Ensure CSS is processed correctly
  webpack: (config) => {
    // Ensure CSS modules work properly
    return config
  },
}

module.exports = nextConfig