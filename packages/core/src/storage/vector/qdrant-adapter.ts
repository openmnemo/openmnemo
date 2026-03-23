import type { VectorAdapter, VectorMetadata, VectorMetadataFilter, VectorResult } from './vector-adapter.js'

export class QdrantVectorAdapter implements VectorAdapter {
  constructor(_url: string, _collection: string) {
    throw new Error('QdrantVectorAdapter: not implemented in Phase 1')
  }
  upsert(_id: string, _embedding: number[], _metadata: VectorMetadata): void { throw new Error('not implemented') }
  search(_embedding: number[], _topK: number): VectorResult[] { throw new Error('not implemented') }
  delete(_id: string): void { throw new Error('not implemented') }
  deleteByMetadata(_filter: VectorMetadataFilter): number { throw new Error('not implemented') }
  close(): void {}
}
