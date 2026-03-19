export interface GraphNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

export interface GraphEdge {
  fromId: string
  toId: string
  type: string
  properties?: Record<string, unknown>
}

export interface GraphAdapter {
  upsertNode(node: GraphNode): void
  upsertEdge(edge: GraphEdge): void
  findRelated(entityId: string, depth: number): GraphNode[]
  query(cypher: string): unknown[]
  close(): void
}
