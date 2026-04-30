/// <reference lib="webworker" />
import {
  CacheFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
} from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist's build step injects the precache manifest here.
    // Includes Next.js build output (chunks, etc.) AND files from public/.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// =============================================
// Conservative runtime caching (Codex round 1 P1)
// =============================================
// This is a multi-tenant authenticated finance app. We DO NOT use the default
// Serwist caching presets because they include NetworkFirst handlers for
// document navigations, RSC payloads, and `/api/*`, all of which contain
// per-user data keyed only by URL. Serving cached responses to a different
// session (e.g. shared family device, building switch, sign-out) would leak
// data across tenants.
//
// Allowed runtime caches (no user data inside):
//   - Google Fonts (CSS + font binaries)
//   - Same-origin static assets: /_next/static/, /icons/, /manifest.webmanifest,
//     and the dynamic Next.js icon routes (/icon, /apple-icon)
//
// Everything else (HTML navigations, RSC, /api, /actions) falls through to
// the network. When offline, navigations hit the precached /offline.html
// fallback below.
// =============================================
const runtimeCaching: RuntimeCaching[] = [
  // Google Fonts CSS
  {
    matcher: /^https:\/\/fonts\.googleapis\.com\/.*/i,
    handler: new StaleWhileRevalidate({
      cacheName: 'google-fonts-css',
      plugins: [],
    }),
  },
  // Google Fonts binaries
  {
    matcher: /^https:\/\/fonts\.gstatic\.com\/.*/i,
    handler: new CacheFirst({
      cacheName: 'google-fonts-files',
      plugins: [],
    }),
  },
  // Same-origin static assets (no user data — all build output / public/icons)
  {
    matcher: ({ url, sameOrigin }) => {
      if (!sameOrigin) return false
      const p = url.pathname
      return (
        p.startsWith('/_next/static/') ||
        p.startsWith('/icons/') ||
        p === '/manifest.webmanifest' ||
        p === '/icon' ||
        p === '/apple-icon'
      )
    },
    handler: new StaleWhileRevalidate({
      cacheName: 'static-assets',
      plugins: [],
    }),
  },
  // Codex round 2 P1: navigations need a NetworkOnly route so the
  // fallbacks plugin (registered via Serwist constructor) can attach to it.
  // Without this route, document requests miss runtime caching entirely and
  // the browser handles them natively — `/offline.html` would never serve.
  // NetworkOnly never writes to the cache, so user data still doesn't leak.
  {
    matcher: ({ request }) =>
      request.mode === 'navigate' || request.destination === 'document',
    handler: new NetworkOnly({
      plugins: [],
    }),
  },
  // NB: no entry for RSC / /api — those go to network natively. Only the
  //     navigation matcher above gets a fallback (offline.html).
]

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        // /offline.html ships as a static file in public/, so it's
        // automatically included in __SW_MANIFEST by the Serwist build plugin.
        // (See pnpm postbuild check in scripts/check-sw-precache.mjs.)
        url: '/offline.html',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()
