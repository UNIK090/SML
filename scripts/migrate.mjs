// Applies scripts/schema.sql to the database in DATABASE_URL.
// Run with: node scripts/migrate.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))

// Load .env.local without pulling in extra dependencies.
const envPath = join(here, '..', '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line)
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is empty in .env.local')
  process.exit(1)
}

const sql = readFileSync(join(here, 'schema.sql'), 'utf8')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

try {
  await client.connect()
  await client.query(sql)
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  )
  console.log('migration applied. tables:', rows.map((r) => r.table_name).join(', '))
} catch (error) {
  console.error('migration failed:', error.message)
  process.exitCode = 1
} finally {
  await client.end()
}
