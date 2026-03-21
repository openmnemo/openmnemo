import { join } from 'node:path'
import { SqliteFtsAdapter } from './search/sqlite-fts-adapter.js'
import { SqliteVecAdapter } from './vector/sqlite-vec-adapter.js'
import { QdrantVectorAdapter } from './vector/qdrant-adapter.js'
import { SqliteGraphAdapter } from './graph/sqlite-graph-adapter.js'
import { Neo4jGraphAdapter } from './graph/neo4j-adapter.js'
import type { SearchAdapter } from './search/search-adapter.js'
import type { VectorAdapter } from './vector/vector-adapter.js'
import type { GraphAdapter } from './graph/graph-adapter.js'

export interface StorageConfig {
  indexDir: string
  vector_backend?: 'sqlite-vec' | 'qdrant'
  graph_backend?: 'sqlite' | 'neo4j'
  embedding_model?: string
  embedding_dims?: number
  qdrant_url?: string
  qdrant_collection?: string
  neo4j_uri?: string
  neo4j_user?: string
  neo4j_password?: string
}

function sqliteDbPath(cfg: StorageConfig): string {
  return join(cfg.indexDir, 'search.sqlite')
}

export function createSearchAdapter(cfg: StorageConfig): SearchAdapter {
  return new SqliteFtsAdapter(sqliteDbPath(cfg))
}

export function createVectorAdapter(cfg: StorageConfig): VectorAdapter {
  if (cfg.vector_backend === 'qdrant') {
    return new QdrantVectorAdapter(
      cfg.qdrant_url ?? 'http://localhost:6333',
      cfg.qdrant_collection ?? 'transcripts',
    )
  }
  return new SqliteVecAdapter(sqliteDbPath(cfg), {
    embeddingDimensions: cfg.embedding_dims ?? 1536,
  })
}

export function createGraphAdapter(cfg: StorageConfig): GraphAdapter {
  if (cfg.graph_backend === 'neo4j') {
    return new Neo4jGraphAdapter(
      cfg.neo4j_uri ?? 'bolt://localhost:7687',
      cfg.neo4j_user ?? 'neo4j',
      cfg.neo4j_password ?? '',
    )
  }
  return new SqliteGraphAdapter(sqliteDbPath(cfg))
}
