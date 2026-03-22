import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { GraphAdapter, GraphNode, GraphEdge, FindSessionsByEntityOptions } from './graph-adapter.js'

const CREATE_NODES_SQL = `
  CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    labels TEXT NOT NULL DEFAULT '[]',
    properties TEXT NOT NULL DEFAULT '{}'
  )
`

const CREATE_EDGES_SQL = `
  CREATE TABLE IF NOT EXISTS graph_edges (
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    type TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (from_id, to_id, type)
  )
`

const CREATE_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_graph_edges_from_id ON graph_edges(from_id);
  CREATE INDEX IF NOT EXISTS idx_graph_edges_to_id ON graph_edges(to_id);
`

function openDb(dbPath: string): InstanceType<typeof Database> {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  return db
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function parseProperties(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function toGraphNode(row: { id: string, labels: string, properties: string }): GraphNode {
  return {
    id: row.id,
    labels: parseStringArray(row.labels),
    properties: parseProperties(row.properties),
  }
}

function nodeHasLabel(node: GraphNode, label: string): boolean {
  const normalized = label.trim().toLowerCase()
  return node.labels.some((value) => value.toLowerCase() === normalized)
}

function collectSearchableStrings(value: unknown, bucket: string[]): void {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) bucket.push(trimmed)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSearchableStrings(item, bucket)
    return
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectSearchableStrings(nested, bucket)
    }
  }
}

function matchesEntityName(node: GraphNode, entityName: string): boolean {
  const normalized = entityName.trim().toLowerCase()
  if (!normalized) return true

  const searchable = [node.id, ...node.labels]
  collectSearchableStrings(node.properties, searchable)
  return searchable.some((value) => value.toLowerCase().includes(normalized))
}

interface GraphNodeWithDepth {
  node: GraphNode
  depth: number
}

export class SqliteGraphAdapter implements GraphAdapter {
  private readonly db: InstanceType<typeof Database>

  constructor(dbPath: string) {
    this.db = openDb(dbPath)
    this.db.exec(CREATE_NODES_SQL)
    this.db.exec(CREATE_EDGES_SQL)
    this.db.exec(CREATE_INDEXES_SQL)
  }

  upsertNode(node: GraphNode): void {
    this.db.prepare(`
      INSERT INTO graph_nodes (id, labels, properties)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        labels = excluded.labels,
        properties = excluded.properties
    `).run(node.id, JSON.stringify(node.labels), JSON.stringify(node.properties))
  }

  upsertEdge(edge: GraphEdge): void {
    this.db.prepare(`
      INSERT INTO graph_edges (from_id, to_id, type, properties)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(from_id, to_id, type) DO UPDATE SET
        properties = excluded.properties
    `).run(edge.fromId, edge.toId, edge.type, JSON.stringify(edge.properties ?? {}))
  }

  private findRelatedWithDepth(entityId: string, depth: number): GraphNodeWithDepth[] {
    if (depth <= 0) return []

    const rows = this.db.prepare(`
      WITH RECURSIVE walk(node_id, current_depth) AS (
        SELECT ?, 0
        UNION
        SELECT
          CASE
            WHEN graph_edges.from_id = walk.node_id THEN graph_edges.to_id
            ELSE graph_edges.from_id
          END AS node_id,
          walk.current_depth + 1
        FROM walk
        JOIN graph_edges
          ON graph_edges.from_id = walk.node_id
          OR graph_edges.to_id = walk.node_id
        WHERE walk.current_depth < ?
      )
      SELECT
        graph_nodes.id,
        graph_nodes.labels,
        graph_nodes.properties,
        MIN(walk.current_depth) AS min_depth
      FROM walk
      JOIN graph_nodes ON graph_nodes.id = walk.node_id
      WHERE walk.current_depth > 0
        AND graph_nodes.id <> ?
      GROUP BY graph_nodes.id, graph_nodes.labels, graph_nodes.properties
      ORDER BY min_depth ASC, graph_nodes.id ASC
    `).all(entityId, depth, entityId) as Array<{ id: string, labels: string, properties: string, min_depth: number }>

    return rows.map((row) => ({
      node: toGraphNode(row),
      depth: row.min_depth,
    }))
  }

  findRelated(entityId: string, depth: number): GraphNode[] {
    return this.findRelatedWithDepth(entityId, depth).map((match) => match.node)
  }

  findSessionsByEntity(options: FindSessionsByEntityOptions = {}): GraphNode[] {
    const entityName = options.entityName?.trim() ?? ''
    const entityLabel = options.entityLabel?.trim() ?? ''
    const depth = options.depth ?? 2
    const limit = options.limit ?? 20

    if (!entityName && !entityLabel) return []
    if (limit <= 0) return []

    const nodes = this.db.prepare(`
      SELECT id, labels, properties
      FROM graph_nodes
      ORDER BY id ASC
    `).all() as Array<{ id: string, labels: string, properties: string }>

    const matchedEntities = nodes
      .map(toGraphNode)
      .filter((node) => {
        if (entityLabel && !nodeHasLabel(node, entityLabel)) return false
        return matchesEntityName(node, entityName)
      })

    const sessions = new Map<string, GraphNodeWithDepth>()

    for (const entity of matchedEntities) {
      if (nodeHasLabel(entity, 'Session')) {
        const existing = sessions.get(entity.id)
        if (!existing || existing.depth > 0) {
          sessions.set(entity.id, { node: entity, depth: 0 })
        }
      }

      for (const related of this.findRelatedWithDepth(entity.id, depth)) {
        if (!nodeHasLabel(related.node, 'Session')) continue
        const existing = sessions.get(related.node.id)
        if (!existing || related.depth < existing.depth) {
          sessions.set(related.node.id, related)
        }
      }
    }

    return [...sessions.values()]
      .sort((left, right) => left.depth - right.depth || left.node.id.localeCompare(right.node.id))
      .slice(0, limit)
      .map((match) => match.node)
  }

  query(statement: string): unknown[] {
    const normalized = statement.trim().toLowerCase()
    if (!/^(select|with|pragma)\b/.test(normalized)) {
      throw new Error('SqliteGraphAdapter.query only supports read-only SQLite statements')
    }
    return this.db.prepare(statement).all()
  }

  close(): void {
    this.db.close()
  }
}
