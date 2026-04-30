'use client'

import { useEffect } from 'react'

/**
 * Registers the Serwist-generated service worker on first paint.
 * No-op in development (Serwist plugin disables itself in NODE_ENV=development,
 * so /sw.js doesn't exist and registration would 404 — we skip the call).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Defer registration to idle so it doesn't compete with first paint.
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => {
          // Don't surface SW failures to users; they degrade gracefully.
        })
    }
    if (document.readyState === 'complete') {
      onLoad()
    } else {
      window.addEventListener('load', onLoad)
      return () => window.removeEventListener('load', onLoad)
    }
  }, [])

  return null
}
