import type { MetadataRoute } from 'next'

/**
 * Sitemap for /pricing, /contact, /. Used by Google + بحث محرَّكات.
 * Authenticated routes (/dashboard, /payments, etc.) are NOT in sitemap —
 * they're not indexable.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  )
  const lastModified = new Date()

  return [
    {
      url: `${base}/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${base}/pricing`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${base}/contact`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]
}
