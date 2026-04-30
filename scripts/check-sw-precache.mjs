// =============================================
// scripts/check-sw-precache.mjs
// =============================================
// Verifies the offline fallback URL appears in the generated Service Worker's
// precache manifest. Without this guarantee, the very first navigation under
// offline conditions could fail because the SW has nothing cached to fall
// back to (Codex Phase 13 round 1 P2).
//
// Runs after `pnpm build` (configured via package.json scripts).
// =============================================

import fs from 'node:fs/promises'
import path from 'node:path'

const SW_PATH = path.resolve(import.meta.dirname, '..', 'public', 'sw.js')
const REQUIRED = '/offline.html'

async function main() {
  let sw
  try {
    sw = await fs.readFile(SW_PATH, 'utf8')
  } catch (e) {
    console.error(`✗ ${SW_PATH} not found — did you run \`pnpm build\` first?`)
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }

  // (1) Precache: the generated SW embeds the precache manifest as a JS array
  //     of {url, revision}. Look for the literal "/offline.html" string.
  const inPrecache =
    sw.includes('"url":"/offline.html"') ||
    sw.includes("'url':'/offline.html'") ||
    sw.includes('"/offline.html"')

  if (!inPrecache) {
    console.error(
      `✗ ${REQUIRED} is NOT in the precache manifest of public/sw.js. ` +
      `Without this, the offline fallback would 404 on first navigation failure. ` +
      `Make sure public/offline.html exists before running pnpm build.`,
    )
    process.exit(1)
  }

  console.log(`✓ Service Worker precache contains ${REQUIRED}`)

  // (2) Codex round 2 P1: a navigation runtime route is REQUIRED for the
  //     offline fallback to fire. Without it, document requests miss runtime
  //     caching and the browser handles them natively (no fallback). We
  //     require a NetworkOnly handler attached to navigation requests.
  //
  //     We check two artifacts:
  //       - SOURCE (src/app/sw.ts): explicit import + use of NetworkOnly
  //       - COMPILED (public/sw.js): matcher uses request.mode === 'navigate'
  //         or request.destination === 'document' (class names are minified)
  const SW_SOURCE_PATH = path.resolve(import.meta.dirname, '..', 'src', 'app', 'sw.ts')
  let swSource
  try {
    swSource = await fs.readFile(SW_SOURCE_PATH, 'utf8')
  } catch {
    console.error(`✗ Cannot read ${SW_SOURCE_PATH}`)
    process.exit(1)
  }

  // Source: must explicitly import NetworkOnly and instantiate it.
  const sourceImportsNetworkOnly = /import\s*\{[^}]*\bNetworkOnly\b[^}]*\}\s*from\s*['"]serwist['"]/.test(swSource)
  const sourceUsesNetworkOnly = /new\s+NetworkOnly\s*\(/.test(swSource)

  // Compiled: matcher must reference navigate/document. (Class names minified.)
  const compiledHasNavigateMatcher =
    sw.includes('"navigate"') ||
    sw.includes("'navigate'") ||
    sw.includes('"document"') ||
    sw.includes("'document'")

  if (!sourceImportsNetworkOnly || !sourceUsesNetworkOnly || !compiledHasNavigateMatcher) {
    console.error(
      `✗ Service Worker is missing a NetworkOnly route for navigations. ` +
      `Without it, the offline fallback never fires.`,
    )
    console.error(
      `  sourceImportsNetworkOnly=${sourceImportsNetworkOnly}, ` +
      `sourceUsesNetworkOnly=${sourceUsesNetworkOnly}, ` +
      `compiledHasNavigateMatcher=${compiledHasNavigateMatcher}`,
    )
    process.exit(1)
  }

  console.log(`✓ Service Worker has NetworkOnly route for navigations (fallback can fire)`)

  // (3) Anti-regression: ensure NetworkFirst is NOT used. defaultCache would
  //     reintroduce it and leak user data across sessions (Codex round 1 P1).
  const hasNetworkFirst = /NetworkFirst/.test(sw)
  if (hasNetworkFirst) {
    console.error(
      `✗ public/sw.js contains NetworkFirst — this caches HTML/RSC keyed by URL ` +
      `only and leaks data across users. Remove defaultCache and use the ` +
      `conservative runtimeCaching list in src/app/sw.ts instead.`,
    )
    process.exit(1)
  }

  console.log(`✓ Service Worker contains zero NetworkFirst handlers (no user-data leak)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
