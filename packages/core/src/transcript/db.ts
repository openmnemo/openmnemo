/**
 * Transcript search index — SQLite upsert for the global transcript catalog.
 *
 * Uses better-sqlite3 (native binding) for synchronous SQLite access.
 * FTS4 full-text search on title, cwd, branch columns.
 *
 * Design notes:
 * - Schema init (CREATE TABLE + CREATE VIRTUAL TABLE) happens only in the
 *   write path (upsertSearchIndex / initSchema). The read path (searchTranscripts)
 *   opens readonly and never writes.
 * - FTS rebuild is deferred: upsertSearchIndex does NOT rebuild per-row.
 *   Call rebuildFtsIndex() once after a batch of upserts.
 * - busy_timeout = 5000ms guards against concurrent writer collisions.
 * - Single-quotes are stripped from FTS queries to prevent MATCH parse errors.
 */

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ManifestEntry } from '@openmnemo/types'

// ---------------------------------------------------------------------------
// Column definitions — must stay in sync with CREATE_TABLE_SQL
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
  'repo_raw_path',
  'repo_clean_path',
  'repo_manifest_path',
  'message_count',
  'tool_event_count',
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
    repo_raw_path       TEXT    NOT NULL,
    repo_clean_path     TEXT    NOT NULL,
    repo_manifest_path  TEXT    NOT NULL,
    message_count       INTEGER NOT NULL,
    tool_event_count    INTEGER NOT NULL,
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

// FTS4 content table — tracks title, cwd, branch for keyword search.
// The content table keeps FTS in sync with the source table via rebuild.
const CREATE_FTS_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts4(
    content='transcripts',
    title, cwd, branch
  )
`

// Full rebuild re-reads all rows from the content table.
// Must be called after any write batch to keep FTS in sync.
const REBUILD_FTS_SQL = `
  INSERT INTO transcripts_fts(transcripts_fts) VALUES('rebuild')
`

// Join on rowid (stable as long as no DELETE + re-INSERT or VACUUM).
// After any DELETE or VACUUM, call rebuildFtsIndex() to re-sync docid→rowid.
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
 * Strips FTS4 metacharacters AND single quotes (which cause MATCH parse errors).
 */
export function sanitizeFtsQuery(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // strip all non-letter/digit/space (incl. single quotes)
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Open (or create) a writable SQLite database.
 * Sets WAL mode and busy_timeout to handle concurrent access.
 */
function openDb(dbPath: string): InstanceType<typeof Database> {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  return db
}

/**
 * Initialise schema (transcripts table + FTS virtual table).
 * Safe to call multiple times — uses IF NOT EXISTS.
 */
export function initSchema(dbPath: string): void {
  const db = openDb(dbPath)
  try {
    db.exec(CREATE_TABLE_SQL)
    db.exec(CREATE_FTS_SQL)
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
    db.exec(CREATE_FTS_SQL)  // ensure FTS table exists
    db.exec(REBUILD_FTS_SQL)
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full-text search over the transcript index using FTS4.
 * Returns an empty array when the database does not exist or the sanitized
 * query is empty. Opens readonly — never writes.
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
    // FTS table missing or index corrupt — return empty rather than throw
    return []
  } finally {
    db.close()
  }
}

/**
 * Insert or update a single transcript manifest row in the SQLite search
 * index at dbPath. Creates the database and schema if they do not exist.
 *
 * NOTE: Does NOT rebuild the FTS index. Call rebuildFtsIndex(dbPath) once
 * after a batch of upserts so that searchTranscripts returns fresh results.
 */
export function upsertSearchIndex(
  dbPath: string,
  manifest: ManifestEntry,
): void {
  const db = openDb(dbPath)
  try {
    db.exec(CREATE_TABLE_SQL)
    db.exec(CREATE_FTS_SQL)

    const record: Record<string, unknown> = { ...manifest }
    const params: (string | number)[] = ALL_COLUMNS.map((col) => {
      const value = record[col]
      if (value === undefined || value === null) return ''
      return typeof value === 'number' ? value : String(value)
    })

    // Pass array directly (not spread) for type-safe binding
    db.prepare(UPSERT_SQL).run(params)

    // Rebuild FTS after every single upsert to keep search in sync.
    // For bulk imports, callers may skip this and call rebuildFtsIndex() once.
    db.exec(REBUILD_FTS_SQL)
  } finally {
    db.close()
  }
}
