import { join } from 'node:path'
import { SqliteFtsAdapter } from './search/sqlite-fts-adapter.js'
import { QdrantVectorAdapter } from './vector/qdrant-adapter.js'
import { Neo4jGraphAdapter } from './graph/neo4j-adapter.js'
import type { SearchAdapter } from './search/search-adapter.js'
import type { VectorAdapter } from './vector/vector-adapter.js'
import type { GraphAdapter } from './graph/graph-adapter.js'

export interface StorageConfig {
  indexDir: string
  vector_backend?: 'sqlite-vec' | 'qdrant'
  graph_backend?: 'sqlite' | 'neo4j'
  qdrant_url?: string
  qdrant_collection?: string
  neo4j_uri?: string
  neo4j_user?: string
  neo4j_password?: string
}

export function createSearchAdapter(cfg: StorageConfig): SearchAdapter {
  return new SqliteFtsAdapter(join(cfg.indexDir, 'search.sqlite'))
}

export function createVectorAdapter(cfg: StorageConfig): VectorAdapter {
  if (cfg.vector_backend === 'qdrant') {
    return new QdrantVectorAdapter(
      cfg.qdrant_url ?? 'http://localhost:6333',
      cfg.qdrant_collection ?? 'transcripts',
    )
  }
  throw new Error('sqlite-vec VectorAdapter not implemented in Phase 1')
}

export function createGraphAdapter(cfg: StorageConfig): GraphAdapter {
  if (cfg.graph_backend === 'neo4j') {
    return new Neo4jGraphAdapter(
      cfg.neo4j_uri ?? 'bolt://localhost:7687',
      cfg.neo4j_user ?? 'neo4j',
      cfg.neo4j_password ?? '',
    )
  }
  throw new Error('sqlite GraphAdapter not implemented in Phase 1')
}
