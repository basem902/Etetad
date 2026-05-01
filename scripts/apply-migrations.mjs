#!/usr/bin/env node
/**
 * scripts/apply-migrations.mjs
 *
 * One-shot migration runner for Supabase production deploys. Reads
 * SUPABASE_DB_URL from .env.local (or env), then applies the 19 migration
 * files in the canonical order, skipping 06_seed.sql.
 *
 * Usage:
 *   1. Get the connection string from Supabase Dashboard →
 *      Project Settings → Database → Connection string → URI mode →
 *      "Session pooler" (port 5432). Paste with your DB password.
 *   2. Add to D:\Etahd\.env.local:
 *        SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
 *   3. Install pg locally (one-time): pnpm add -D pg
 *   4. Run: node scripts/apply-migrations.mjs
 *   5. After success, REMOVE the SUPABASE_DB_URL line from .env.local
 *      (it's gitignored but no point keeping it around).
 *
 * Behavior:
 *   - Loads each file in order, sends as one statement (Supabase Postgres
 *     supports multi-statement DDL via the simple query protocol).
 *   - Stops on first error and prints the file + SQL state.
 *   - Idempotent: every migration uses `if not exists` / `or replace` so
 *     re-running is safe if a file mid-way fails.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Load .env.local manually (no dotenv dep required)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
try {
  const envText = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8')
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {
  /* .env.local optional */
}

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('ERROR: SUPABASE_DB_URL not set.')
  console.error('Add it to .env.local with the Postgres connection string from')
  console.error('Supabase Dashboard → Project Settings → Database → Connection string.')
  process.exit(1)
}

let pg
try {
  pg = await import('pg')
} catch {
  console.error('ERROR: `pg` package not installed.')
  console.error('Run: pnpm add -D pg')
  process.exit(1)
}
const { Client } = pg.default

const FILES = [
  '01_schema.sql',
  '02_functions.sql',
  '03_triggers.sql',
  '04_policies.sql',
  '05_storage.sql',
  // 06_seed.sql intentionally skipped (development data)
  '07_phase2.sql',
  '08_phase5.sql',
  '09_phase6.sql',
  '10_phase7.sql',
  '11_phase8.sql',
  '12_phase9.sql',
  '13_phase10.sql',
  '14_phase11.sql',
  '15_phase12.sql',
  '16_phase14.sql',
  '17_phase16.sql',
  '18_phase17.sql',
  '19_phase18.sql',
  '20_phase19.sql',
]

const client = new Client({
  connectionString: url,
  // Supabase requires SSL but the default cert validation often fails on the
  // pooler endpoint; rejectUnauthorized:false matches `psql sslmode=require`.
  ssl: { rejectUnauthorized: false },
})

console.log('connecting to Supabase Postgres...')
try {
  await client.connect()
} catch (err) {
  console.error('connection failed:', err.message)
  console.error('\ncheck that:')
  console.error('  - SUPABASE_DB_URL is the SESSION pooler URL (port 5432)')
  console.error('  - the password in the URL is correct')
  console.error('  - Supabase project is fully provisioned (not still creating)')
  process.exit(1)
}
console.log('connected ✓\n')

let success = 0
let failed = 0

for (const file of FILES) {
  const start = Date.now()
  process.stdout.write(`applying ${file} ... `)
  try {
    const sql = await fs.readFile(path.join(ROOT, 'supabase', file), 'utf8')
    await client.query(sql)
    const ms = Date.now() - start
    console.log(`✓ (${ms}ms)`)
    success++
  } catch (err) {
    console.log(`✗`)
    console.error(`\nFAILED on ${file}:`)
    console.error(`  message: ${err.message}`)
    if (err.code) console.error(`  code: ${err.code}`)
    if (err.position) console.error(`  position: ${err.position}`)
    if (err.hint) console.error(`  hint: ${err.hint}`)
    failed++
    break
  }
}

await client.end()

console.log(`\n=== Result: ${success} succeeded, ${failed} failed ===`)

if (failed === 0) {
  console.log('\n✓ All migrations applied. Verify counts in Supabase SQL Editor:')
  console.log('  select count(*) from information_schema.tables where table_schema = \'public\';')
  console.log('  -- expected: 25')
  console.log('  select id, public from storage.buckets order by id;')
  console.log('  -- expected: 8 buckets')
  console.log('\n⚠️  REMOVE SUPABASE_DB_URL from .env.local now (no longer needed).')
} else {
  console.log('\n✗ Migration halted. Fix the issue above and re-run (idempotent — safe to retry).')
}

process.exit(failed === 0 ? 0 : 1)
