import type { MetadataRoute } from 'next'

/**
 * PWA manifest. Next.js serves this at /manifest.webmanifest automatically
 * when present in the app directory.
 *
 * theme_color matches the dark navy primary in globals.css. The browser
 * picks the right one via prefers-color-scheme on most platforms.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'نظام إدارة العمارة',
    short_name: 'إدارة العمارة',
    description:
      'مركز إدارة العمارة السكنية: المدفوعات، المصروفات، الصيانة، والحوكمة.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    lang: 'ar',
    dir: 'rtl',
    categories: ['productivity', 'business'],
    icons: [
      // SVG (modern browsers, scales to any size)
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      // PNG icons (Lighthouse PWA audit + older Android launchers).
      // Generated dynamically via Next.js icon convention from icon1.tsx
      // and icon2.tsx — both ImageResponse-rendered PNGs.
      {
        src: '/icon1',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon2',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
