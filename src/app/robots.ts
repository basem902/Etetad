import type { MetadataRoute } from 'next'

/**
 * robots.txt — allow public marketing routes, disallow authenticated app
 * routes (RLS will block them anyway, but no need to crawl).
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  )
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/contact'],
        disallow: [
          '/api/',
          '/dashboard',
          '/apartments',
          '/payments',
          '/expenses',
          '/maintenance',
          '/tasks',
          '/vendors',
          '/suggestions',
          '/votes',
          '/decisions',
          '/documents',
          '/reports',
          '/audit-logs',
          '/super-admin',
          '/onboarding',
          '/forbidden',
          '/subscription-inactive',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/auth/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
