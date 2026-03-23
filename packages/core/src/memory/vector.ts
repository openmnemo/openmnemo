import { join } from 'node:path'
import type { MemoryUnit, RetrievalQuery, RetrievalReference } from '@openmnemo/types'
import { createVectorAdapter } from '../storage/factory.js'
import {
  DEFAULT_VECTOR_DIMS,
  deterministicTextEmbedding,
  isZeroVector,
} from '../storage/vector/deterministic.js'
import type { VectorAdapter, VectorMetadata } from '../storage/vector/vector-adapter.js'
import type { MemoryExtractionBundle } from './extraction.js'
import { normalizeRetrievalQuery, toEffectiveRetrievalLimit } from './domain.js'

export const MEMORY_UNIT_VECTOR_NAMESPACE = 'memory_units'
export const TRANSCRIPT_MEMORY_VECTORIZER = 'deterministic-memory-unit-baseline'
export const MEMORY_UNIT_VECTOR_DIMS = DEFAULT_VECTOR_DIMS

const VECTOR_SCAN_FLOOR = 50
const VECTOR_SCAN_MULTIPLIER = 8
const VECTOR_SCAN_CAP = 500

function extractionSessionRootId(bundle: MemoryExtractionBundle): string {
  const sessionNode = bundle.graph.nodes.find((node) =>
    node.labels.includes('Session')
      && node.properties['session_id'] === bundle.session_id)

  if (!sessionNode) {
    throw new Error('MemoryExtractionBundle is missing its Session root node')
  }

  return sessionNode.id
}

function memoryUnitVectorText(unit: MemoryUnit): string {
  return [unit.title, unit.summary, unit.body]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
}

function buildMemoryUnitVectorMetadata(
  bundle: MemoryExtractionBundle,
  unit: MemoryUnit,
): VectorMetadata {
  return {
    managed_by: TRANSCRIPT_MEMORY_VECTORIZER,
    managed_root_id: extractionSessionRootId(bundle),
    managed_scope: 'session',
    project: unit.project,
    session_id: bundle.session_id,
    unit_type: unit.unit_type,
    source_kind: unit.source_kind,
    ...(unit.partition ? { partition: unit.partition } : {}),
  }
}

function matchesQueryScope(metadata: VectorMetadata, query: RetrievalQuery): boolean {
  const scope = query.scope
  if (!scope) return true
  if (scope.project && metadata.project !== scope.project) return false
  if (scope.partition && metadata.partition !== scope.partition) return false
  if (scope.session_id && metadata.session_id !== scope.session_id) return false
  if (scope.unit_types && scope.unit_types.length > 0) {
    const unitType = metadata.unit_type
    if (typeof unitType !== 'string' || !scope.unit_types.includes(unitType as MemoryUnit['unit_type'])) {
      return false
    }
  }
  return true
}

function candidateSearchLimit(limit: number): number {
  if (limit === Number.MAX_SAFE_INTEGER) return VECTOR_SCAN_CAP
  return Math.min(Math.max(limit * VECTOR_SCAN_MULTIPLIER, VECTOR_SCAN_FLOOR), VECTOR_SCAN_CAP)
}

export function syncMemoryUnitVectors(
  vector: VectorAdapter,
  bundle: MemoryExtractionBundle,
): void {
  const managedRootId = extractionSessionRootId(bundle)
  vector.deleteByMetadata({
    managed_by: TRANSCRIPT_MEMORY_VECTORIZER,
    managed_root_id: managedRootId,
  })

  for (const unit of bundle.memory_units) {
    vector.upsert(
      unit.id,
      deterministicTextEmbedding(memoryUnitVectorText(unit), MEMORY_UNIT_VECTOR_DIMS),
      buildMemoryUnitVectorMetadata(bundle, unit),
    )
  }
}

export function searchMemoryUnitVectors(
  globalRoot: string,
  queryInput: string | RetrievalQuery,
): RetrievalReference[] {
  const query = normalizeRetrievalQuery(queryInput)
  const limit = toEffectiveRetrievalLimit(query.limit)
  const queryEmbedding = deterministicTextEmbedding(query.text, MEMORY_UNIT_VECTOR_DIMS)
  if (isZeroVector(queryEmbedding)) {
    return []
  }

  const vector = createVectorAdapter({
    indexDir: join(globalRoot, 'index'),
    embedding_dims: MEMORY_UNIT_VECTOR_DIMS,
    vector_namespace: MEMORY_UNIT_VECTOR_NAMESPACE,
  })

  try {
    return vector
      .search(
        queryEmbedding,
        candidateSearchLimit(limit),
      )
      .filter((result) => matchesQueryScope(result.metadata, query))
      .slice(0, limit)
      .map((result) => ({
        kind: 'memory_unit',
        id: result.id,
        score: result.score,
        source: 'vector',
        ...(typeof result.metadata.project === 'string'
          ? { project: result.metadata.project }
          : {}),
        ...(typeof result.metadata.partition === 'string'
          ? { partition: result.metadata.partition }
          : {}),
      }))
  } finally {
    vector.close()
  }
}
