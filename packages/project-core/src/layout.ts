import type { ProjectEdge, ProjectNode } from './contracts'

export interface CanvasPosition {
  readonly x: number
  readonly y: number
}

/**
 * Deterministic layered DAG layout.
 * Columns follow topological depth (longest path from a root);
 * rows order nodes inside a layer by creation time.
 */
export function layoutGraph(
  nodes: readonly ProjectNode[],
  edges: readonly ProjectEdge[]
): Map<string, CanvasPosition> {
  const live = nodes
    .filter((node) => node.tombstonedAt === null)
    .toSorted(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    )
  const liveIds = new Set(live.map((node) => node.id))
  const liveEdges = edges.filter(
    (edge) =>
      edge.tombstonedAt === null &&
      liveIds.has(edge.sourceNodeId) &&
      liveIds.has(edge.targetNodeId)
  )

  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const node of live) {
    outgoing.set(node.id, [])
    indegree.set(node.id, 0)
  }
  for (const edge of liveEdges) {
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId)
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1)
  }

  const depth = new Map<string, number>()
  const queue: string[] = live
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
  for (const id of queue) depth.set(id, 0)

  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift() as string
    if (visited.has(current)) continue
    visited.add(current)
    const currentDepth = depth.get(current) ?? 0
    for (const target of outgoing.get(current) ?? []) {
      depth.set(target, Math.max(depth.get(target) ?? 0, currentDepth + 1))
      indegree.set(target, (indegree.get(target) ?? 1) - 1)
      if ((indegree.get(target) ?? 0) <= 0) queue.push(target)
    }
  }
  // cycles or stragglers: pin to the rightmost layer + 1
  const maxResolvedDepth = Math.max(0, ...depth.values())
  for (const node of live) {
    if (!depth.has(node.id)) depth.set(node.id, maxResolvedDepth + 1)
  }

  const layers = new Map<number, ProjectNode[]>()
  for (const node of live) {
    const layer = depth.get(node.id) ?? 0
    if (!layers.has(layer)) layers.set(layer, [])
    layers.get(layer)?.push(node)
  }

  const maxDepth = Math.max(0, ...layers.keys())
  const positions = new Map<string, CanvasPosition>()
  const xStart = maxDepth === 0 ? 50 : 11
  const xSpan = maxDepth === 0 ? 0 : 78

  for (const [layer, layerNodes] of layers) {
    const x = xStart + (layer / Math.max(maxDepth, 1)) * xSpan
    const count = layerNodes.length
    layerNodes.forEach((node, index) => {
      const y = count === 1 ? 46 : 12 + (index / (count - 1)) * 74
      positions.set(node.id, { x, y })
    })
  }
  return positions
}
