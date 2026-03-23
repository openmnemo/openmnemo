import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type {
  GraphAdapter,
  GraphNode,
  GraphEdge,
  FindNodesByEntityOptions,
  FindSessionsByEntityOptions,
  ManagedSubgraphSelector,
} from './graph-adapter.js'

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

const NON_SEARCHABLE_PROPERTY_KEYS = new Set([
  'entity_kind',
  'asset_kind',
  'unit_type',
  'unit_type_display',
  'scope',
  'project',
  'client',
  'session_id',
  'started_at',
  'cwd',
  'branch',
  'source_uri',
  'import_ref',
  'source_ref',
  'managed_by',
  'managed_root_id',
  'managed_scope',
])

const LEGACY_DERIVED_SESSION_LABELS = ['SourceAsset', 'ArchiveAnchor', 'MemoryUnit'] as const

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
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (NON_SEARCHABLE_PROPERTY_KEYS.has(key)) continue
      collectSearchableStrings(nested, bucket)
    }
  }
}

function stringMatchRank(value: string, normalizedQuery: string): number | null {
  const normalizedValue = value.trim().toLowerCase()
  if (!normalizedValue) return null
  if (normalizedValue === normalizedQuery) return 0
  if (normalizedValue.startsWith(normalizedQuery)) return 1
  return normalizedValue.includes(normalizedQuery) ? 2 : null
}

function entityNameMatchRank(node: GraphNode, entityName: string): number | null {
  const normalized = entityName.trim().toLowerCase()
  if (!normalized) return 0

  const searchable: string[] = []
  collectSearchableStrings(node.properties, searchable)
  let bestRank: number | null = null
  for (const value of searchable) {
    const rank = stringMatchRank(value, normalized)
    if (rank === null) continue
    if (bestRank === null || rank < bestRank) bestRank = rank
  }

  return bestRank
}

function sqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
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

  deleteManagedSubgraph(selector: ManagedSubgraphSelector): void {
    const managedRows = this.db.prepare(`
      SELECT DISTINCT id
      FROM graph_nodes
      WHERE id <> ?
        AND json_extract(properties, '$.managed_by') = ?
        AND json_extract(properties, '$.managed_root_id') = ?
    `).all(
      selector.managedRootId,
      selector.managedBy,
      selector.managedRootId,
    ) as Array<{ id: string }>

    const legacyLabelPlaceholders = sqlPlaceholders(LEGACY_DERIVED_SESSION_LABELS.length)
    const legacyRows = this.db.prepare(`
      SELECT DISTINCT graph_nodes.id
      FROM graph_nodes
      JOIN graph_edges
        ON (graph_edges.from_id = ? AND graph_edges.to_id = graph_nodes.id)
        OR (graph_edges.to_id = ? AND graph_edges.from_id = graph_nodes.id)
      WHERE graph_nodes.id <> ?
        AND EXISTS (
          SELECT 1
          FROM json_each(graph_nodes.labels)
          WHERE json_each.value IN (${legacyLabelPlaceholders})
        )
    `).all(
      selector.managedRootId,
      selector.managedRootId,
      selector.managedRootId,
      ...LEGACY_DERIVED_SESSION_LABELS,
    ) as Array<{ id: string }>

    const nodeIds = [...new Set([...managedRows, ...legacyRows].map((row) => row.id))]
    const deleteManagedSubgraph = this.db.transaction((ids: string[]) => {
      this.db.prepare(`
        DELETE FROM graph_edges
        WHERE json_extract(properties, '$.managed_by') = ?
          AND json_extract(properties, '$.managed_root_id') = ?
      `).run(selector.managedBy, selector.managedRootId)

      if (ids.length === 0) return

      const placeholders = sqlPlaceholders(ids.length)
      this.db.prepare(`
        DELETE FROM graph_edges
        WHERE from_id IN (${placeholders})
          OR to_id IN (${placeholders})
      `).run(...ids, ...ids)

      this.db.prepare(`
        DELETE FROM graph_nodes
        WHERE id IN (${placeholders})
      `).run(...ids)
    })

    deleteManagedSubgraph(nodeIds)
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

  private findMatchingEntities(
    entityName: string,
    entityLabel: string,
  ): GraphNodeWithDepth[] {
    const nodes = this.db.prepare(`
      SELECT id, labels, properties
      FROM graph_nodes
      ORDER BY id ASC
    `).all() as Array<{ id: string, labels: string, properties: string }>

    return nodes
      .map(toGraphNode)
      .flatMap((node) => {
        if (entityLabel && !nodeHasLabel(node, entityLabel)) return []

        const matchRank = entityNameMatchRank(node, entityName)
        if (matchRank === null) return []

        return [{ node, depth: matchRank }]
      })
      .sort((left, right) => left.depth - right.depth || left.node.id.localeCompare(right.node.id))
  }

  findNodesByEntity(options: FindNodesByEntityOptions = {}): GraphNode[] {
    const entityName = options.entityName?.trim() ?? ''
    const entityLabel = options.entityLabel?.trim() ?? ''
    const limit = options.limit ?? 20

    if (!entityName && !entityLabel) return []
    if (limit <= 0) return []

    return this.findMatchingEntities(entityName, entityLabel)
      .slice(0, limit)
      .map((match) => match.node)
  }

  findSessionsByEntity(options: FindSessionsByEntityOptions = {}): GraphNode[] {
    const entityName = options.entityName?.trim() ?? ''
    const entityLabel = options.entityLabel?.trim() ?? ''
    const depth = options.depth ?? 2
    const limit = options.limit ?? 20

    if (!entityName && !entityLabel) return []
    if (limit <= 0) return []

    const matchedEntities = this.findMatchingEntities(entityName, entityLabel)
      .map((match) => match.node)

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
