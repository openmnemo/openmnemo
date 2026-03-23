import type {
  GraphAdapter,
  GraphNode,
  GraphEdge,
  FindNodesByEntityOptions,
  FindSessionsByEntityOptions,
  ManagedSubgraphSelector,
} from './graph-adapter.js'

export class Neo4jGraphAdapter implements GraphAdapter {
  constructor(_uri: string, _user: string, _password: string) {
    throw new Error('Neo4jGraphAdapter: not implemented in Phase 1')
  }
  upsertNode(_node: GraphNode): void { throw new Error('not implemented') }
  upsertEdge(_edge: GraphEdge): void { throw new Error('not implemented') }
  deleteManagedSubgraph(_selector: ManagedSubgraphSelector): void { throw new Error('not implemented') }
  findRelated(_entityId: string, _depth: number): GraphNode[] { throw new Error('not implemented') }
  findNodesByEntity(_options?: FindNodesByEntityOptions): GraphNode[] { throw new Error('not implemented') }
  findSessionsByEntity(_options?: FindSessionsByEntityOptions): GraphNode[] { throw new Error('not implemented') }
  query(_cypher: string): unknown[] { throw new Error('not implemented') }
  close(): void {}
}
