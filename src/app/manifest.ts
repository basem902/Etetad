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
      // ImageResponse-generated PNG (Next.js auto-generated route)
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
