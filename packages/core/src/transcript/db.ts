/**
 * Transcript search index — SQLite upsert for the global transcript catalog.
 *
 * Uses better-sqlite3 (native binding) for synchronous SQLite access.
 * FTS4 full-text search on title, cwd, branch, content, commit_layer columns.
 *
 * Design notes:
 * - Schema init uses ALTER TABLE ADD COLUMN for additive migrations (no version table).
 * - FTS table is dropped+recreated when column list changes.
 * - busy_timeout = 5000ms guards against concurrent writer collisions.
 * - Single-quotes are stripped from FTS queries to prevent MATCH parse errors.
 * - searchTranscripts opens readonly and never writes.
 */

import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ManifestEntry } from '@openmnemo/types'

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const PK_COLUMNS = [
  'client',
  'project',
  'session_id',
  'raw_sha256',
] as const

const DATA_COLUMNS = [
  'title',
  'started_at',
  'imported_at',
  'cwd',
  'branch',
  'raw_source_path',
  'raw_upload_permission',
  'global_raw_path',
  'global_clean_path',
  'global_manifest_path',
  'repo_raw_path',
  'repo_clean_path',
  'repo_manifest_path',
  'message_count',
  'tool_event_count',
  'cleaning_mode',
  'repo_mirror_enabled',
  'content',
  'commit_layer',
] as const

const ALL_COLUMNS = [...PK_COLUMNS, ...DATA_COLUMNS] as const

// ---------------------------------------------------------------------------
// SQL statements
// ---------------------------------------------------------------------------

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS transcripts (
    client              TEXT    NOT NULL,
    project             TEXT    NOT NULL,
    session_id          TEXT    NOT NULL,
    raw_sha256          TEXT    NOT NULL,
    title               TEXT    NOT NULL,
    started_at          TEXT    NOT NULL,
    imported_at         TEXT    NOT NULL,
    cwd                 TEXT    NOT NULL,
    branch              TEXT    NOT NULL,
    raw_source_path     TEXT    NOT NULL,
    raw_upload_permission TEXT  NOT NULL,
    global_raw_path     TEXT    NOT NULL,
    global_clean_path   TEXT    NOT NULL,
    global_manifest_path TEXT   NOT NULL DEFAULT '',
    repo_raw_path       TEXT    NOT NULL,
    repo_clean_path     TEXT    NOT NULL,
    repo_manifest_path  TEXT    NOT NULL,
    message_count       INTEGER NOT NULL,
    tool_event_count    INTEGER NOT NULL,
    cleaning_mode       TEXT    NOT NULL DEFAULT '',
    repo_mirror_enabled TEXT    NOT NULL DEFAULT '',
    content             TEXT    NOT NULL DEFAULT '',
    commit_layer        TEXT    NOT NULL DEFAULT '',
    PRIMARY KEY (client, project, session_id, raw_sha256)
  )
`

const UPSERT_SQL = `
  INSERT INTO transcripts (
    ${ALL_COLUMNS.join(', ')}
  ) VALUES (${ALL_COLUMNS.map(() => '?').join(', ')})
  ON CONFLICT(${PK_COLUMNS.join(', ')}) DO UPDATE SET
    ${DATA_COLUMNS.map((c) => `${c} = excluded.${c}`).join(',\n    ')}
`

const CREATE_FTS_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts4(
    content='transcripts',
    title, cwd, branch, content, commit_layer
  )
`

const REBUILD_FTS_SQL = `
  INSERT INTO transcripts_fts(transcripts_fts) VALUES('rebuild')
`

const SEARCH_SQL = `
  SELECT t.client, t.project, t.session_id, t.title, t.cwd, t.branch, t.started_at
  FROM transcripts_fts
  JOIN transcripts t ON transcripts_fts.docid = t.rowid
  WHERE transcripts_fts MATCH ?
  ORDER BY t.started_at DESC
  LIMIT ?
`

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  client: string
  project: string
  session_id: string
  title: string
  cwd: string
  branch: string
  started_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a user-supplied query string for safe use in an FTS4 MATCH clause.
 * Strips all non-letter/digit/space characters (including single quotes which
 * cause FTS4 MATCH parse errors).
 */
export function sanitizeFtsQuery(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Open (or create) a writable SQLite database.
 * Runs schema migration on every open.
 */
function openDb(dbPath: string): InstanceType<typeof Database> {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  return db
}

/**
 * Additive column migration — adds content and commit_layer if missing.
 * Ignores "duplicate column name" errors (idempotent).
 */
function migrateSchema(db: InstanceType<typeof Database>): void {
  for (const col of ['global_manifest_path', 'cleaning_mode', 'repo_mirror_enabled', 'content', 'commit_layer']) {
    try {
      db.exec(`ALTER TABLE transcripts ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`)
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.includes('duplicate column name')) throw e
    }
  }
}

/**
 * Drop and recreate FTS table if it doesn't have the new columns.
 * Must be called after migrateSchema so the source table is up to date.
 */
function migrateFts(db: InstanceType<typeof Database>): void {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='transcripts_fts'"
  ).get() as { sql: string } | undefined

  if (!row || !row.sql.includes('commit_layer')) {
    db.exec('DROP TABLE IF EXISTS transcripts_fts')
    db.exec(CREATE_FTS_SQL)
    db.exec(REBUILD_FTS_SQL)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise schema (transcripts table + FTS virtual table).
 * Safe to call multiple times — uses IF NOT EXISTS + additive migration.
 */
export function initSchema(dbPath: string): void {
  const db = openDb(dbPath)
  try {
    db.transaction(() => {
      db.exec(CREATE_TABLE_SQL)
      migrateSchema(db)
      db.exec(CREATE_FTS_SQL)
      migrateFts(db)
    })()
  } finally {
    db.close()
  }
}

/**
 * Rebuild the FTS index from the transcripts table.
 * Call once after a batch of upserts, or after any DELETE/VACUUM.
 */
export function rebuildFtsIndex(dbPath: string): void {
  const db = openDb(dbPath)
  try {
    db.exec(CREATE_FTS_SQL)
    db.exec(REBUILD_FTS_SQL)
  } finally {
    db.close()
  }
}

/**
 * Full-text search over the transcript index using FTS4.
 * Opens readonly — never writes. Returns [] when db missing or query empty.
 */
export function searchTranscripts(
  dbPath: string,
  query: string,
  limit = 20,
): SearchResult[] {
  const sanitized = sanitizeFtsQuery(query)
  if (!sanitized) return []
  if (!existsSync(dbPath)) return []

  const db = new Database(dbPath, { readonly: true })
  try {
    return db.prepare(SEARCH_SQL).all(sanitized, limit) as SearchResult[]
  } catch {
    return []
  } finally {
    db.close()
  }
}

const FTS_COLUMNS = new Set(['title', 'cwd', 'branch', 'content', 'commit_layer'])

/**
 * Search restricted to specific FTS columns using FTS4 column filter syntax.
 * e.g. columns=['commit_layer'] → MATCH 'commit_layer:term'
 * Column names are validated against the known FTS column set.
 */
export function searchTranscriptsByColumns(
  dbPath: string,
  query: string,
  columns: string[],
  limit = 20,
): SearchResult[] {
  const sanitized = sanitizeFtsQuery(query)
  if (!sanitized) return []
  const validColumns = columns.filter((c) => FTS_COLUMNS.has(c))
  if (validColumns.length === 0) return []
  if (!existsSync(dbPath)) return []

  const columnQuery = validColumns.map((col) => `${col}:${sanitized}`).join(' OR ')
  const db = new Database(dbPath, { readonly: true })
  try {
    return db.prepare(SEARCH_SQL).all(columnQuery, limit) as SearchResult[]
  } catch {
    return []
  } finally {
    db.close()
  }
}

/**
 * Insert or update a single transcript manifest row.
 * Creates schema if needed. Rebuilds FTS after write.
 */
export function upsertSearchIndex(
  dbPath: string,
  manifest: ManifestEntry,
): void {
  const db = openDb(dbPath)
  try {
    db.transaction(() => {
      db.exec(CREATE_TABLE_SQL)
      migrateSchema(db)
      db.exec(CREATE_FTS_SQL)
      migrateFts(db)
    })()

    const record: Record<string, unknown> = { ...manifest }
    const params: (string | number)[] = ALL_COLUMNS.map((col) => {
      const value = record[col]
      if (value === undefined || value === null) return ''
      return typeof value === 'number' ? value : String(value)
    })

    db.prepare(UPSERT_SQL).run(params)
    db.exec(REBUILD_FTS_SQL)
  } finally {
    db.close()
  }
}
