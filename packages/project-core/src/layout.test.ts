import { describe, expect, it } from 'vitest'
import { layoutGraph } from './layout'
import type { ProjectEdge, ProjectNode } from './contracts'

function node(id: string, createdAt = '2026-01-01T00:00:00.000Z'): ProjectNode {
  return {
    createdAt,
    id,
    kind: 'task',
    label: id,
    metadata: {},
    projectId: 'p',
    tombstonedAt: null,
    updatedAt: createdAt,
  }
}

function edge(id: string, source: string, target: string): ProjectEdge {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    id,
    metadata: {},
    projectId: 'p',
    relation: 'feeds',
    sourceNodeId: source,
    targetNodeId: target,
    tombstonedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('layoutGraph', () => {
  it('places a chain in successive columns', () => {
    const positions = layoutGraph(
      [node('a'), node('b'), node('c')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')],
      { columnGap: 100, rowGap: 50 }
    )
    expect(positions.get('a')?.x).toBe(0)
    expect(positions.get('b')?.x).toBe(100)
    expect(positions.get('c')?.x).toBe(200)
  })

  it('centres siblings within a layer', () => {
    const positions = layoutGraph(
      [node('root'), node('a', '2026-01-02T00:00:00.000Z'), node('b', '2026-01-03T00:00:00.000Z')],
      [edge('e1', 'root', 'a'), edge('e2', 'root', 'b')],
      { columnGap: 100, rowGap: 50 }
    )
    expect(positions.get('a')?.y).toBe(-25)
    expect(positions.get('b')?.y).toBe(25)
    expect(positions.get('root')?.y).toBe(0)
  })

  it('uses the longest path, so a node sits past every ancestor', () => {
    // a -> b -> c and a -> c: c belongs in column 2, not column 1.
    const positions = layoutGraph(
      [node('a'), node('b'), node('c')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'a', 'c')],
      { columnGap: 100, rowGap: 50 }
    )
    expect(positions.get('c')?.x).toBe(200)
  })

  it('is deterministic across calls', () => {
    const nodes = [node('a'), node('b', '2026-01-02T00:00:00.000Z')]
    const edges = [edge('e1', 'a', 'b')]
    expect([...layoutGraph(nodes, edges)]).toEqual([...layoutGraph(nodes, edges)])
  })

  it('ignores tombstoned nodes and their edges', () => {
    const removed = { ...node('gone'), tombstonedAt: '2026-01-02T00:00:00.000Z' }
    const positions = layoutGraph([node('a'), removed], [edge('e1', 'a', 'gone')], {})
    expect(positions.has('gone')).toBe(false)
    expect(positions.has('a')).toBe(true)
  })

  it('still places every node in a cycle', () => {
    const positions = layoutGraph(
      [node('a'), node('b')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
      { columnGap: 100, rowGap: 50 }
    )
    expect(positions.size).toBe(2)
  })

  it('returns nothing for an empty graph rather than throwing', () => {
    expect(layoutGraph([], [])).toEqual(new Map())
  })
})
