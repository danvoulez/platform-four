import { describe, expect, it } from 'vitest'
import { ProjectEngine } from './engine'
import { projectSnapshot } from './projection'
import { starterProjectOperations } from './templates'

function seeded() {
  const engine = new ProjectEngine()
  const created = engine.createProject({
    reason: 'projection fixture',
    title: 'Projected',
    tags: ['core'],
    initialOperations: starterProjectOperations('Projected'),
  })
  return { engine, id: created.project.id }
}

describe('projection', () => {
  it('derives every value from authoritative project state, never from cached rows', () => {
    const { engine, id } = seeded()
    const before = engine.getProjection(id)
    expect(before.status).toBe('in_progress')
    expect(before.nextAction).toBe('Define scope and first deliverable')

    engine.changeState(id, 'blocked', { expectedVersion: 1, reason: 'blocked on review' })

    const after = engine.getProjection(id)
    expect(after.status).toBe('blocked')
    expect(after.sourceProjectVersion).toBe(2)
    // Recomputing from the record yields exactly the same projection.
    const record = engine.getRecord(id)!
    expect(
      projectSnapshot({
        columns: record.summary.projectionSchema.columns,
        edges: record.edges,
        nodes: record.nodes,
        project: record.summary,
      })
    ).toEqual(after)
  })

  it('counts only live nodes and edges', () => {
    const { engine, id } = seeded()
    engine.mutateGraph(id, [{ op: 'tombstone_node', nodeId: 'milestone-1' }], {
      expectedVersion: 1,
      reason: 'drop',
    })
    const projection = engine.getProjection(id)
    expect(projection.metrics.liveNodes).toBe(2)
    expect(projection.metrics.liveEdges).toBe(0)
  })

  it('surfaces blockers and pending items from the graph', () => {
    const { engine, id } = seeded()
    engine.mutateGraph(
      id,
      [
        { op: 'add_node', nodeId: 'b1', kind: 'blocker', label: 'Waiting on credentials', metadata: {} },
        { op: 'add_node', nodeId: 'p1', kind: 'pending', label: 'Security sign-off', metadata: {} },
      ],
      { expectedVersion: 1, reason: 'add blockers' }
    )
    const projection = engine.getProjection(id)
    expect(projection.blockers).toEqual(['Waiting on credentials'])
    expect(projection.pendingItems).toEqual(['Security sign-off'])
  })

  it('orders columns by position then key, and reflects the project field selectors', () => {
    const { engine, id } = seeded()
    const projection = engine.getProjection(id)
    expect(projection.columns.map((column) => column.key)).toEqual([
      'status',
      'tags',
      'tasks',
      'updated',
    ])
    expect(projection.columns.find((column) => column.key === 'status')?.value).toBe('in_progress')
    expect(projection.columns.find((column) => column.key === 'tags')?.value).toEqual(['core'])
  })

  it('bumps the projection version when a column is defined', () => {
    const { engine, id } = seeded()
    const before = engine.getProjection(id).projectionVersion
    const result = engine.mutateGraph(
      id,
      [
        {
          op: 'define_projection_column',
          column: {
            emphasis: 'normal',
            key: 'blockers',
            label: 'Blockers',
            position: 5,
            selector: { selector: 'node_count', entity: 'node', kind: 'blocker', limit: 100 },
            valueType: 'number',
          },
        },
      ],
      { expectedVersion: 1, reason: 'add a column' }
    )
    expect(result.projection.projectionVersion).toBe(before + 1)
    expect(result.projection.columns.map((column) => column.key)).toContain('blockers')
  })

  it('caps a node count at the selector limit', () => {
    const { engine, id } = seeded()
    engine.mutateGraph(
      id,
      [
        {
          op: 'define_projection_column',
          column: {
            emphasis: 'normal',
            key: 'capped',
            label: 'Capped',
            position: 99,
            selector: { selector: 'node_count', entity: 'node', kind: 'brief', limit: 1 },
            valueType: 'number',
          },
        },
        { op: 'add_node', nodeId: 'brief-2', kind: 'brief', label: 'Second brief', metadata: {} },
      ],
      { expectedVersion: 1, reason: 'cap' }
    )
    expect(engine.getProjection(id).columns.find((column) => column.key === 'capped')?.value).toBe(1)
  })
})
