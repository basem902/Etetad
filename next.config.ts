import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

// Phase 13: Serwist enabled in production builds. Disabled in dev so the SW
// doesn't cache stale source during HMR.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Receipt uploads can be up to 5MB; allow a small overhead for FormData encoding.
      bodySizeLimit: '6mb',
    },
  },
}

export default withSerwist(nextConfig)
