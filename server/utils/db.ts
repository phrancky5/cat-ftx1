import Database from 'better-sqlite3'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Lazy SQLite singleton.
 *
 * Path resolution:
 *   - `CAT_DB_PATH`         — explicit absolute file path (set by Electron main
 *                              to `<userData>/cat-ftx1.db` in packaged builds).
 *   - default               — `<cwd>/data/cat-ftx1.db` (dev mode).
 *
 * Schema source:
 *   - `CAT_RESOURCES_PATH`  — root of packaged resources, schema lives at
 *                              `<CAT_RESOURCES_PATH>/sql/schema.sql`.
 *   - default               — `<cwd>/sql/schema.sql`.
 *
 * The schema is executed once per process at first DB access. It is fully
 * idempotent (`CREATE TABLE IF NOT EXISTS …`), so re-running it on an existing
 * DB is a no-op. Per project convention we do **not** use a migration runner.
 */

type DbHandle = Database.Database

let cached: DbHandle | null = null

function resolveDbPath(): string {
  if (process.env.CAT_DB_PATH && process.env.CAT_DB_PATH.trim()) {
    return resolve(process.env.CAT_DB_PATH.trim())
  }
  return resolve(process.cwd(), 'data', 'cat-ftx1.db')
}

function resolveSchemaPath(): string {
  if (process.env.CAT_RESOURCES_PATH && process.env.CAT_RESOURCES_PATH.trim()) {
    return resolve(process.env.CAT_RESOURCES_PATH.trim(), 'sql', 'schema.sql')
  }
  return resolve(process.cwd(), 'sql', 'schema.sql')
}

function openAndInit(): DbHandle {
  const dbPath = resolveDbPath()
  const dir = dirname(dbPath)
  const fresh = !existsSync(dbPath)
  mkdirSync(dir, { recursive: true })

  const db = new Database(dbPath)
  // `Database` constructor accepts options; we apply pragmas after open so
  // they survive even if we ever switch to a wrapper later.
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const schemaPath = resolveSchemaPath()
  if (!existsSync(schemaPath)) {
    throw new Error(`schema.sql not found at ${schemaPath}`)
  }
  const schemaSql = readFileSync(schemaPath, 'utf8')
  db.exec(schemaSql)

  console.log(
    `[db] ${fresh ? 'created' : 'opened'} ${dbPath} (schema applied from ${schemaPath})`,
  )
  return db
}

export function useDb(): DbHandle {
  if (!cached) cached = openAndInit()
  return cached
}

export function closeDb(): void {
  if (cached) {
    try { cached.close() } catch { /* ignore */ }
    cached = null
  }
}
