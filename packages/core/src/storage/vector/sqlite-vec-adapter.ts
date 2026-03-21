import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { load as loadSqliteVec } from 'sqlite-vec'
import type { VectorAdapter, VectorMetadata, VectorResult } from './vector-adapter.js'

const VECTOR_TABLE = 'vec_sessions'
const META_TABLE = 'vec_session_meta'

const CREATE_META_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS vec_session_meta (
    id TEXT NOT NULL UNIQUE,
    metadata TEXT NOT NULL DEFAULT '{}'
  )
`

function openDb(dbPath: string): InstanceType<typeof Database> {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  return db
}

function parseMetadata(raw: string): VectorMetadata {
  try {
    const parsed = JSON.parse(raw) as VectorMetadata
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function createVectorTableSql(embeddingDimensions: number): string {
  return `
    CREATE VIRTUAL TABLE IF NOT EXISTS ${VECTOR_TABLE}
    USING vec0(embedding float[${embeddingDimensions}])
  `
}

function bufferFromEmbedding(embedding: number[]): Buffer {
  return Buffer.from(Float32Array.from(embedding).buffer)
}

function scoreFromDistance(distance: number): number {
  return 1 / (1 + distance)
}

function vectorTableSql(db: InstanceType<typeof Database>): string | null {
  const row = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE name = ?
  `).get(VECTOR_TABLE) as { sql: string | null } | undefined
  return row?.sql ?? null
}

function vectorTableDimensions(sql: string | null): number | null {
  const match = sql?.match(/float\[(\d+)\]/)
  if (!match) return null
  return Number.parseInt(match[1]!, 10)
}

function isVecVirtualTable(sql: string | null): boolean {
  return Boolean(sql?.includes('vec0('))
}

function parseLegacyEmbedding(raw: string, embeddingDimensions: number, id: string): number[] {
  let embedding: unknown
  try {
    embedding = JSON.parse(raw)
  } catch {
    throw new Error(`SqliteVecAdapter cannot migrate legacy embedding for "${id}": invalid JSON`)
  }

  if (!Array.isArray(embedding)) {
    throw new Error(`SqliteVecAdapter cannot migrate legacy embedding for "${id}": expected number[]`)
  }
  if (!embedding.every((value) => typeof value === 'number')) {
    throw new Error(`SqliteVecAdapter cannot migrate legacy embedding for "${id}": expected numeric values`)
  }
  if (embedding.length !== embeddingDimensions) {
    throw new Error(
      `SqliteVecAdapter cannot migrate legacy embedding for "${id}": expected dimension ${embeddingDimensions}, received ${embedding.length}`,
    )
  }

  return embedding as number[]
}

function migrateLegacyTable(
  db: InstanceType<typeof Database>,
  embeddingDimensions: number,
): void {
  const legacyRows = db.prepare(`
    SELECT id, embedding, metadata
    FROM ${VECTOR_TABLE}
  `).all() as Array<{ id: string, embedding: string, metadata: string }>
  const parsedRows = legacyRows.map((row) => ({
    id: row.id,
    metadata: row.metadata,
    embedding: parseLegacyEmbedding(row.embedding, embeddingDimensions, row.id),
  }))

  db.transaction(() => {
    db.exec(`ALTER TABLE ${VECTOR_TABLE} RENAME TO ${VECTOR_TABLE}_legacy`)
    db.exec(`DROP TABLE IF EXISTS ${META_TABLE}`)
    db.exec(CREATE_META_TABLE_SQL)
    db.exec(createVectorTableSql(embeddingDimensions))

    const insertMeta = db.prepare(`
      INSERT INTO ${META_TABLE} (id, metadata)
      VALUES (?, ?)
    `)
    const insertVec = db.prepare(`
      INSERT INTO ${VECTOR_TABLE} (rowid, embedding)
      VALUES (CAST(? AS INTEGER), ?)
    `)

    for (const row of parsedRows) {
      const result = insertMeta.run(row.id, row.metadata)
      const rowid = Number(result.lastInsertRowid)
      insertVec.run(rowid, bufferFromEmbedding(row.embedding))
    }

    db.exec(`DROP TABLE ${VECTOR_TABLE}_legacy`)
  })()
}

function ensureSchema(
  db: InstanceType<typeof Database>,
  embeddingDimensions: number,
): void {
  loadSqliteVec(db)

  const currentSql = vectorTableSql(db)
  if (currentSql !== null && !isVecVirtualTable(currentSql)) {
    migrateLegacyTable(db, embeddingDimensions)
    return
  }

  const currentDimensions = vectorTableDimensions(currentSql)
  if (currentSql !== null && currentDimensions !== embeddingDimensions) {
    throw new Error(
      `SqliteVecAdapter existing vec_sessions uses dimension ${currentDimensions}, requested ${embeddingDimensions}; refusing to auto-drop vector data`,
    )
  }

  db.exec(CREATE_META_TABLE_SQL)
  db.exec(createVectorTableSql(embeddingDimensions))
}

export interface SqliteVecAdapterOptions {
  embeddingDimensions?: number
}

export class SqliteVecAdapter implements VectorAdapter {
  private readonly db: InstanceType<typeof Database>
  private readonly embeddingDimensions: number

  constructor(
    dbPath: string,
    options: SqliteVecAdapterOptions = {},
  ) {
    this.embeddingDimensions = options.embeddingDimensions ?? 1536
    const db = openDb(dbPath)
    try {
      ensureSchema(db, this.embeddingDimensions)
      this.db = db
    } catch (error) {
      db.close()
      throw error
    }
  }

  private validateEmbedding(embedding: number[]): void {
    if (embedding.length !== this.embeddingDimensions) {
      throw new Error(
        `SqliteVecAdapter expected embedding length ${this.embeddingDimensions}, received ${embedding.length}`,
      )
    }
  }

  upsert(id: string, embedding: number[], metadata: VectorMetadata): void {
    this.validateEmbedding(embedding)
    const embeddingBuffer = bufferFromEmbedding(embedding)
    const metadataJson = JSON.stringify(metadata)

    this.db.transaction(() => {
      const existing = this.db.prepare(`
        SELECT rowid
        FROM ${META_TABLE}
        WHERE id = ?
      `).get(id) as { rowid: number } | undefined

      let rowid: number
      if (existing) {
        rowid = Number(existing.rowid)
        this.db.prepare(`
          UPDATE ${META_TABLE}
          SET metadata = ?
          WHERE rowid = ?
        `).run(metadataJson, rowid)
        this.db.prepare(`DELETE FROM ${VECTOR_TABLE} WHERE rowid = ?`).run(rowid)
      } else {
        const result = this.db.prepare(`
          INSERT INTO ${META_TABLE} (id, metadata)
          VALUES (?, ?)
        `).run(id, metadataJson)
        rowid = Number(result.lastInsertRowid)
      }

      this.db.prepare(`
        INSERT INTO ${VECTOR_TABLE} (rowid, embedding)
        VALUES (CAST(? AS INTEGER), ?)
      `).run(rowid, embeddingBuffer)
    })()
  }

  search(embedding: number[], topK: number): VectorResult[] {
    if (topK <= 0) return []
    this.validateEmbedding(embedding)

    const rows = this.db.prepare(`
      SELECT
        m.id AS id,
        m.metadata AS metadata,
        v.distance AS distance
      FROM ${VECTOR_TABLE} AS v
      JOIN ${META_TABLE} AS m ON m.rowid = v.rowid
      WHERE v.embedding MATCH ?
        AND k = ?
      ORDER BY v.distance ASC
    `).all(bufferFromEmbedding(embedding), topK) as Array<{
      id: string
      metadata: string
      distance: number
    }>

    return rows.map((row) => ({
      id: row.id,
      score: scoreFromDistance(row.distance),
      metadata: parseMetadata(row.metadata),
    }))
  }

  delete(id: string): void {
    this.db.transaction(() => {
      const existing = this.db.prepare(`
        SELECT rowid
        FROM ${META_TABLE}
        WHERE id = ?
      `).get(id) as { rowid: number } | undefined

      if (!existing) return
      const rowid = Number(existing.rowid)
      this.db.prepare(`DELETE FROM ${VECTOR_TABLE} WHERE rowid = ?`).run(rowid)
      this.db.prepare(`DELETE FROM ${META_TABLE} WHERE rowid = ?`).run(rowid)
    })()
  }

  close(): void {
    this.db.close()
  }
}
