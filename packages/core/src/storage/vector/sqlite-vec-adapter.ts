import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { load as loadSqliteVec } from 'sqlite-vec'
import type {
  VectorAdapter,
  VectorMetadata,
  VectorMetadataFilter,
  VectorResult,
} from './vector-adapter.js'

const DEFAULT_VECTOR_NAMESPACE = 'sessions'

interface VectorTableNames {
  vectorTable: string
  metaTable: string
}

function openDb(dbPath: string): InstanceType<typeof Database> {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  return db
}

function normalizeNamespace(namespace?: string): string {
  const normalized = (namespace ?? DEFAULT_VECTOR_NAMESPACE)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!normalized) {
    throw new Error('SqliteVecAdapter namespace must not be empty')
  }

  return normalized
}

function tableNamesForNamespace(namespace: string): VectorTableNames {
  if (namespace === DEFAULT_VECTOR_NAMESPACE) {
    return {
      vectorTable: 'vec_sessions',
      metaTable: 'vec_session_meta',
    }
  }

  return {
    vectorTable: `vec_${namespace}`,
    metaTable: `vec_${namespace}_meta`,
  }
}

function createMetaTableSql(metaTable: string): string {
  return `
    CREATE TABLE IF NOT EXISTS ${metaTable} (
      id TEXT NOT NULL UNIQUE,
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `
}

function parseMetadata(raw: string): VectorMetadata {
  try {
    const parsed = JSON.parse(raw) as VectorMetadata
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function createVectorTableSql(
  tableNames: VectorTableNames,
  embeddingDimensions: number,
): string {
  return `
    CREATE VIRTUAL TABLE IF NOT EXISTS ${tableNames.vectorTable}
    USING vec0(embedding float[${embeddingDimensions}])
  `
}

function bufferFromEmbedding(embedding: number[]): Buffer {
  return Buffer.from(Float32Array.from(embedding).buffer)
}

function scoreFromDistance(distance: number): number {
  return 1 / (1 + distance)
}

function vectorTableSql(
  db: InstanceType<typeof Database>,
  vectorTable: string,
): string | null {
  const row = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE name = ?
  `).get(vectorTable) as { sql: string | null } | undefined
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
  tableNames: VectorTableNames,
  embeddingDimensions: number,
): void {
  const legacyRows = db.prepare(`
    SELECT id, embedding, metadata
    FROM ${tableNames.vectorTable}
  `).all() as Array<{ id: string, embedding: string, metadata: string }>
  const parsedRows = legacyRows.map((row) => ({
    id: row.id,
    metadata: row.metadata,
    embedding: parseLegacyEmbedding(row.embedding, embeddingDimensions, row.id),
  }))

  db.transaction(() => {
    db.exec(`ALTER TABLE ${tableNames.vectorTable} RENAME TO ${tableNames.vectorTable}_legacy`)
    db.exec(`DROP TABLE IF EXISTS ${tableNames.metaTable}`)
    db.exec(createMetaTableSql(tableNames.metaTable))
    db.exec(createVectorTableSql(tableNames, embeddingDimensions))

    const insertMeta = db.prepare(`
      INSERT INTO ${tableNames.metaTable} (id, metadata)
      VALUES (?, ?)
    `)
    const insertVec = db.prepare(`
      INSERT INTO ${tableNames.vectorTable} (rowid, embedding)
      VALUES (CAST(? AS INTEGER), ?)
    `)

    for (const row of parsedRows) {
      const result = insertMeta.run(row.id, row.metadata)
      const rowid = Number(result.lastInsertRowid)
      insertVec.run(rowid, bufferFromEmbedding(row.embedding))
    }

    db.exec(`DROP TABLE ${tableNames.vectorTable}_legacy`)
  })()
}

function ensureSchema(
  db: InstanceType<typeof Database>,
  tableNames: VectorTableNames,
  embeddingDimensions: number,
): void {
  loadSqliteVec(db)

  const currentSql = vectorTableSql(db, tableNames.vectorTable)
  if (currentSql !== null && !isVecVirtualTable(currentSql)) {
    migrateLegacyTable(db, tableNames, embeddingDimensions)
    return
  }

  const currentDimensions = vectorTableDimensions(currentSql)
  if (currentSql !== null && currentDimensions !== embeddingDimensions) {
    throw new Error(
      `SqliteVecAdapter existing ${tableNames.vectorTable} uses dimension ${currentDimensions}, requested ${embeddingDimensions}; refusing to auto-drop vector data`,
    )
  }

  db.exec(createMetaTableSql(tableNames.metaTable))
  db.exec(createVectorTableSql(tableNames, embeddingDimensions))
}

function sqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

function jsonPathForMetadataKey(key: string): string {
  return `$."${key.replace(/"/g, '""')}"`
}

function normalizeMetadataFilterValue(value: string | number | boolean): string | number {
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

function buildMetadataFilter(
  filter: VectorMetadataFilter,
): { whereClause: string, values: Array<string | number> } {
  const entries = Object.entries(filter)
  if (entries.length === 0) {
    return { whereClause: '1 = 0', values: [] }
  }

  return {
    whereClause: entries
      .map(([key]) => `json_extract(metadata, ?) = ?`)
      .join(' AND '),
    values: entries.flatMap(([key, value]) => [
      jsonPathForMetadataKey(key),
      normalizeMetadataFilterValue(value),
    ]),
  }
}

export interface SqliteVecAdapterOptions {
  embeddingDimensions?: number
  namespace?: string
}

export class SqliteVecAdapter implements VectorAdapter {
  private readonly db: InstanceType<typeof Database>
  private readonly embeddingDimensions: number
  private readonly tableNames: VectorTableNames

  constructor(
    dbPath: string,
    options: SqliteVecAdapterOptions = {},
  ) {
    this.embeddingDimensions = options.embeddingDimensions ?? 1536
    this.tableNames = tableNamesForNamespace(normalizeNamespace(options.namespace))
    const db = openDb(dbPath)
    try {
      ensureSchema(db, this.tableNames, this.embeddingDimensions)
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
        FROM ${this.tableNames.metaTable}
        WHERE id = ?
      `).get(id) as { rowid: number } | undefined

      let rowid: number
      if (existing) {
        rowid = Number(existing.rowid)
        this.db.prepare(`
          UPDATE ${this.tableNames.metaTable}
          SET metadata = ?
          WHERE rowid = ?
        `).run(metadataJson, rowid)
        this.db.prepare(`DELETE FROM ${this.tableNames.vectorTable} WHERE rowid = ?`).run(rowid)
      } else {
        const result = this.db.prepare(`
          INSERT INTO ${this.tableNames.metaTable} (id, metadata)
          VALUES (?, ?)
        `).run(id, metadataJson)
        rowid = Number(result.lastInsertRowid)
      }

      this.db.prepare(`
        INSERT INTO ${this.tableNames.vectorTable} (rowid, embedding)
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
      FROM ${this.tableNames.vectorTable} AS v
      JOIN ${this.tableNames.metaTable} AS m ON m.rowid = v.rowid
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
        FROM ${this.tableNames.metaTable}
        WHERE id = ?
      `).get(id) as { rowid: number } | undefined

      if (!existing) return
      const rowid = Number(existing.rowid)
      this.db.prepare(`DELETE FROM ${this.tableNames.vectorTable} WHERE rowid = ?`).run(rowid)
      this.db.prepare(`DELETE FROM ${this.tableNames.metaTable} WHERE rowid = ?`).run(rowid)
    })()
  }

  deleteByMetadata(filter: VectorMetadataFilter): number {
    const metadataFilter = buildMetadataFilter(filter)
    const rows = this.db.prepare(`
      SELECT rowid
      FROM ${this.tableNames.metaTable}
      WHERE ${metadataFilter.whereClause}
    `).all(...metadataFilter.values) as Array<{ rowid: number }>

    if (rows.length === 0) return 0

    const rowids = rows.map((row) => Number(row.rowid))
    const placeholders = sqlPlaceholders(rowids.length)
    this.db.transaction(() => {
      this.db.prepare(`
        DELETE FROM ${this.tableNames.vectorTable}
        WHERE rowid IN (${placeholders})
      `).run(...rowids)
      this.db.prepare(`
        DELETE FROM ${this.tableNames.metaTable}
        WHERE rowid IN (${placeholders})
      `).run(...rowids)
    })()

    return rowids.length
  }

  close(): void {
    this.db.close()
  }
}
