/**
 * Transcript search index — SQLite upsert for the global transcript catalog.
 *
 * Uses better-sqlite3 (native binding) for synchronous SQLite access.
 * Supports FTS4 full-text search on title, cwd, branch columns.
 */

import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
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

// ---------------------------------------------------------------------------
// FTS4 full-text search
// ---------------------------------------------------------------------------

const CREATE_FTS_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts4(
    content='transcripts',
    title, cwd, branch
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

export interface SearchResult {
  client: string
  project: string
  session_id: string
  title: string
  cwd: string
  branch: string
  started_at: string
}

/**
 * Sanitize a user-supplied query string for safe use in an FTS4 MATCH clause.
 */
export function sanitizeFtsQuery(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Open (or create) the SQLite database at dbPath.
 * Ensures the parent directory exists.
 */
function openDb(dbPath: string): InstanceType<typeof Database> {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  return db
}

/**
 * Full-text search over the transcript index using FTS4.
 * Returns an empty array when the database does not exist or the sanitized
 * query is empty.
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
    // Create FTS table if missing (legacy DB).
    db.exec(CREATE_FTS_SQL)

    // Lazy rebuild if FTS index is empty.
    const segCount = (db.prepare('SELECT COUNT(*) as cnt FROM transcripts_fts_segdir').get() as { cnt: number }).cnt
    if (segCount === 0) {
      db.exec(REBUILD_FTS_SQL)
    }

    const stmt = db.prepare(SEARCH_SQL)
    return stmt.all(sanitized, limit) as SearchResult[]
  } finally {
    db.close()
  }
}

/**
 * Insert or update a single transcript manifest row in the SQLite search
 * index at dbPath. Creates the database, content table, and FTS index if
 * they do not exist, and rebuilds the FTS index after each write.
 */
export function upsertSearchIndex(
  dbPath: string,
  manifest: ManifestEntry,
): void {
  const db = openDb(dbPath)
  try {
    db.exec(CREATE_TABLE_SQL)

    const record: Record<string, unknown> = { ...manifest }
    const params = ALL_COLUMNS.map((col) => {
      const value = record[col]
      if (value === undefined || value === null) return ''
      return typeof value === 'number' ? value : String(value)
    })

    db.prepare(UPSERT_SQL).run(...params)

    db.exec(CREATE_FTS_SQL)
    db.exec(REBUILD_FTS_SQL)
  } finally {
    db.close()
  }
}
