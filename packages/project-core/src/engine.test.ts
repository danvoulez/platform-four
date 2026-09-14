import { describe, expect, it } from 'vitest'
import { EngineError, ProjectEngine, type MutationResult } from './engine'
import { starterProjectOperations } from './templates'
import type { GraphOperation } from './contracts'

function newEngine(): { engine: ProjectEngine; created: MutationResult } {
  const engine = new ProjectEngine()
  const created = engine.createProject({
    reason: 'test fixture',
    title: 'Test Project',
    initialOperations: starterProjectOperations('Test Project'),
  })
  return { engine, created }
}

function addTask(id: string, label = id): GraphOperation[] {
  return [{ op: 'add_node', nodeId: id, kind: 'task', label, metadata: {} }]
}

describe('createProject', () => {
  it('creates a numbered project at version 1 with its starter graph applied', () => {
    const { created } = newEngine()
    expect(created.project.number).toBe(1)
    expect(created.project.version).toBe(1)
    expect(created.project.status).toBe('in_progress')
    expect(created.projection.metrics.liveNodes).toBe(3)
    expect(created.projection.metrics.liveEdges).toBe(1)
  })

  it('numbers projects monotonically', () => {
    const engine = new ProjectEngine()
    const first = engine.createProject({ reason: 'r', title: 'One' })
    const second = engine.createProject({ reason: 'r', title: 'Two' })
    expect(second.project.number).toBe(first.project.number + 1)
  })

  it('rejects a blank title and a blank reason', () => {
    const engine = new ProjectEngine()
    expect(() => engine.createProject({ reason: 'r', title: '   ' })).toThrow(EngineError)
    expect(() => engine.createProject({ reason: '  ', title: 'Fine' })).toThrow(EngineError)
  })
})

describe('version and compare-and-swap', () => {
  it('increments the version on every accepted mutation', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    const first = engine.mutateGraph(id, addTask('t1'), { expectedVersion: 1, reason: 'add t1' })
    expect(first.version).toBe(2)
    const second = engine.mutateGraph(id, addTask('t2'), { expectedVersion: 2, reason: 'add t2' })
    expect(second.version).toBe(3)
  })

  it('rejects a mutation submitted against a stale version, and writes nothing', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    engine.mutateGraph(id, addTask('winner'), { expectedVersion: 1, reason: 'client A' })

    // Client B still believes the project is at version 1.
    expect(() =>
      engine.mutateGraph(id, addTask('loser'), { expectedVersion: 1, reason: 'client B' })
    ).toThrowError(expect.objectContaining({ code: 'version_conflict' }))

    const record = engine.getRecord(id)
    expect(record?.summary.version).toBe(2)
    expect(record?.nodes.some((node) => node.id === 'loser')).toBe(false)
  })

  it('reports the current version in the conflict message so a client can reconcile', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    engine.mutateGraph(id, addTask('t1'), { expectedVersion: 1, reason: 'first' })
    try {
      engine.mutateGraph(id, addTask('t2'), { expectedVersion: 1, reason: 'stale' })
      expect.unreachable('expected a version conflict')
    } catch (error) {
      expect((error as EngineError).message).toContain('found 2')
    }
  })
})

describe('idempotency', () => {
  it('replays a repeated mutation key instead of applying the effect twice', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    const key = 'session-1:turn-7'

    const first = engine.mutateGraph(id, addTask('once'), {
      expectedVersion: 1,
      mutationKey: key,
      reason: 'add once',
    })
    const retry = engine.mutateGraph(id, addTask('once'), {
      expectedVersion: 1,
      mutationKey: key,
      reason: 'add once',
    })

    expect(retry.version).toBe(first.version)
    expect(retry.event.id).toBe(first.event.id)
    expect(engine.getRecord(id)?.nodes.filter((node) => node.id === 'once')).toHaveLength(1)
    expect(engine.getRecord(id)?.events).toHaveLength(2) // create + one mutation
  })

  it('replays a retry whose expected version went stale because the first attempt landed', () => {
    // The network-ambiguity case: the caller never learned its write succeeded, so it retries
    // carrying the version it last saw. Idempotency must outrank staleness, or the caller cannot
    // tell "my write landed" from "someone raced me".
    const { engine, created } = newEngine()
    const id = created.project.id
    const key = 'session-1:turn-9'

    const accepted = engine.mutateGraph(id, addTask('ambiguous'), {
      expectedVersion: 1,
      mutationKey: key,
      reason: 'add under an ambiguous response',
    })
    expect(accepted.version).toBe(2)

    const retry = engine.mutateGraph(id, addTask('ambiguous'), {
      expectedVersion: 1, // stale, and stale *because* the first attempt succeeded
      mutationKey: key,
      reason: 'add under an ambiguous response',
    })

    expect(retry.version).toBe(2)
    expect(retry.event.id).toBe(accepted.event.id)
    expect(retry.operationSummary).toContain('idempotent replay')
    expect(engine.getRecord(id)?.nodes.filter((node) => node.id === 'ambiguous')).toHaveLength(1)
  })

  it('applies distinct mutation keys separately', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    engine.mutateGraph(id, addTask('a'), { expectedVersion: 1, mutationKey: 'k1', reason: 'a' })
    engine.mutateGraph(id, addTask('b'), { expectedVersion: 2, mutationKey: 'k2', reason: 'b' })
    expect(engine.getRecord(id)?.summary.version).toBe(3)
  })

  it('replays an idempotent status change too', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    const first = engine.changeState(id, 'waiting', {
      expectedVersion: 1,
      mutationKey: 'status-key',
      reason: 'pause',
    })
    const retry = engine.changeState(id, 'waiting', {
      expectedVersion: 1,
      mutationKey: 'status-key',
      reason: 'pause',
    })
    expect(retry.version).toBe(first.version)
    expect(retry.event.id).toBe(first.event.id)
  })
})

describe('graph operations', () => {
  it('tombstones a node and cascades to its edges, leaving the rows in place', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    const result = engine.mutateGraph(id, [{ op: 'tombstone_node', nodeId: 'milestone-1' }], {
      expectedVersion: 1,
      reason: 'drop the milestone',
    })

    const record = engine.getRecord(id)
    const node = record?.nodes.find((candidate) => candidate.id === 'milestone-1')
    const edge = record?.edges.find((candidate) => candidate.id === 'brief-contains-milestone-1')

    expect(node).toBeDefined()
    expect(node?.tombstonedAt).not.toBeNull()
    expect(edge?.tombstonedAt).not.toBeNull()
    expect(result.projection.metrics.liveNodes).toBe(2)
    expect(result.projection.metrics.liveEdges).toBe(0)
  })

  it('refuses to operate on a tombstoned node', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    engine.mutateGraph(id, [{ op: 'tombstone_node', nodeId: 'milestone-1' }], {
      expectedVersion: 1,
      reason: 'drop',
    })
    expect(() =>
      engine.mutateGraph(
        id,
        [{ op: 'update_node', nodeId: 'milestone-1', label: 'back from the dead' }],
        { expectedVersion: 2, reason: 'revive' }
      )
    ).toThrowError(expect.objectContaining({ code: 'invalid_graph_operation' }))
  })

  it('rejects an edge whose endpoint does not exist', () => {
    const { engine, created } = newEngine()
    expect(() =>
      engine.mutateGraph(
        created.project.id,
        [
          {
            op: 'link_nodes',
            edgeId: 'dangling',
            relation: 'feeds',
            sourceNodeId: 'brief',
            targetNodeId: 'nowhere',
            metadata: {},
          },
        ],
        { expectedVersion: 1, reason: 'link' }
      )
    ).toThrowError(expect.objectContaining({ code: 'invalid_graph_operation' }))
  })

  it('rejects a self-edge at the schema boundary', () => {
    const { engine, created } = newEngine()
    expect(() =>
      engine.mutateGraph(
        created.project.id,
        [
          {
            op: 'link_nodes',
            edgeId: 'loop',
            relation: 'feeds',
            sourceNodeId: 'brief',
            targetNodeId: 'brief',
            metadata: {},
          },
        ],
        { expectedVersion: 1, reason: 'loop' }
      )
    ).toThrow()
  })

  it('rejects a duplicate live node id', () => {
    const { engine, created } = newEngine()
    expect(() =>
      engine.mutateGraph(created.project.id, addTask('brief'), {
        expectedVersion: 1,
        reason: 'duplicate',
      })
    ).toThrowError(expect.objectContaining({ code: 'invalid_graph_operation' }))
  })

  it('applies a whole batch or none of it', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    expect(() =>
      engine.mutateGraph(
        id,
        [...addTask('good'), { op: 'tombstone_node', nodeId: 'does-not-exist' }],
        { expectedVersion: 1, reason: 'mixed batch' }
      )
    ).toThrow()

    const record = engine.getRecord(id)
    expect(record?.summary.version).toBe(1)
    expect(record?.nodes.some((node) => node.id === 'good')).toBe(false)
  })

  it('rejects a batch larger than the operation limit', () => {
    const { engine, created } = newEngine()
    const tooMany = Array.from({ length: 21 }, (_, index) => addTask(`t${index}`)[0]!)
    expect(() =>
      engine.mutateGraph(created.project.id, tooMany, { expectedVersion: 1, reason: 'flood' })
    ).toThrow()
  })
})

describe('status transitions', () => {
  it('allows a declared transition', () => {
    const { engine, created } = newEngine()
    const result = engine.changeState(created.project.id, 'waiting', {
      expectedVersion: 1,
      reason: 'waiting on review',
    })
    expect(result.project.status).toBe('waiting')
  })

  it('refuses an undeclared transition', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    engine.changeState(id, 'archived', { expectedVersion: 1, reason: 'archive' })
    expect(() =>
      engine.changeState(id, 'completed', { expectedVersion: 2, reason: 'resurrect' })
    ).toThrowError(expect.objectContaining({ code: 'invalid_status_transition' }))
  })

  it('treats an archived project as read-only for graph mutations but reopenable', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    engine.changeState(id, 'archived', { expectedVersion: 1, reason: 'archive' })

    expect(() =>
      engine.mutateGraph(id, addTask('late'), { expectedVersion: 2, reason: 'sneak in' })
    ).toThrowError(expect.objectContaining({ code: 'project_archived' }))

    const reopened = engine.changeState(id, 'in_progress', { expectedVersion: 2, reason: 'reopen' })
    expect(reopened.project.status).toBe('in_progress')
    expect(reopened.project.archivedAt).toBeNull()
  })

  it('records a same-status change without requiring a declared transition', () => {
    const { engine, created } = newEngine()
    const result = engine.changeState(created.project.id, 'in_progress', {
      expectedVersion: 1,
      reason: 'no-op restate',
    })
    expect(result.project.status).toBe('in_progress')
    expect(result.version).toBe(2)
  })
})

describe('events', () => {
  it('appends events in a dense ascending sequence starting at 1', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    engine.mutateGraph(id, addTask('t1'), { expectedVersion: 1, reason: 'one' })
    engine.changeState(id, 'waiting', { expectedVersion: 2, reason: 'two' })
    engine.updateTags(id, { add: ['alpha'] }, { expectedVersion: 3, reason: 'three' })

    const events = engine.getRecord(id)?.events ?? []
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4])
    expect(events.map((event) => event.operationType)).toEqual([
      'create_project',
      'mutate_graph',
      'change_project_status',
      'update_project_tags',
    ])
  })

  it('carries actor, reason and the version the event produced', () => {
    const { engine, created } = newEngine()
    const result = engine.mutateGraph(created.project.id, addTask('t1'), {
      actor: 'powerfarm-agent',
      expectedVersion: 1,
      reason: 'agent proposed a task',
    })
    expect(result.event.actor).toBe('powerfarm-agent')
    expect(result.event.reason).toBe('agent proposed a task')
    expect(result.event.projectVersion).toBe(result.version)
  })

  it('refuses a reason longer than the bound', () => {
    const { engine, created } = newEngine()
    expect(() =>
      engine.mutateGraph(created.project.id, addTask('t1'), {
        expectedVersion: 1,
        reason: 'x'.repeat(501),
      })
    ).toThrowError(expect.objectContaining({ code: 'invalid_graph_operation' }))
  })
})

describe('tags', () => {
  it('normalises, de-duplicates and sorts tags', () => {
    const { engine, created } = newEngine()
    const result = engine.updateTags(
      created.project.id,
      { add: ['Zeta', 'alpha', 'ALPHA', '  beta  '] },
      { expectedVersion: 1, reason: 'tag' }
    )
    expect(result.project.tags).toEqual(['alpha', 'beta', 'zeta'])
  })

  it('removes tags', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    engine.updateTags(id, { add: ['keep', 'drop'] }, { expectedVersion: 1, reason: 'tag' })
    const result = engine.updateTags(id, { remove: ['drop'] }, { expectedVersion: 2, reason: 'untag' })
    expect(result.project.tags).toEqual(['keep'])
  })

  it('rejects a tag that breaks the tag grammar', () => {
    const { engine, created } = newEngine()
    expect(() =>
      engine.updateTags(created.project.id, { add: ['9lives'] }, { expectedVersion: 1, reason: 'tag' })
    ).toThrowError(expect.objectContaining({ code: 'invalid_graph_operation' }))
  })
})

describe('snapshots', () => {
  it('round-trips through a snapshot without changing observable state', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    engine.mutateGraph(id, addTask('t1'), { expectedVersion: 1, reason: 'one' })

    const restored = new ProjectEngine(engine.toSnapshot())
    expect(restored.listProjects()).toEqual(engine.listProjects())
    expect(restored.getProjection(id)).toEqual(engine.getProjection(id))
  })

  it('continues numbering across a restore', () => {
    const { engine } = newEngine()
    const restored = new ProjectEngine(engine.toSnapshot())
    expect(restored.createProject({ reason: 'r', title: 'Next' }).project.number).toBe(2)
  })

  it('preserves idempotency keys across a restore', () => {
    const { engine, created } = newEngine()
    const id = created.project.id
    const first = engine.mutateGraph(id, addTask('t1'), {
      expectedVersion: 1,
      mutationKey: 'durable-key',
      reason: 'one',
    })

    const restored = new ProjectEngine(engine.toSnapshot())
    const retry = restored.mutateGraph(id, addTask('t1'), {
      expectedVersion: 1,
      mutationKey: 'durable-key',
      reason: 'one',
    })
    expect(retry.event.id).toBe(first.event.id)
    expect(retry.version).toBe(first.version)
  })
})

describe('unknown projects', () => {
  it('reports a missing project distinctly from a conflict', () => {
    const engine = new ProjectEngine()
    expect(() =>
      engine.mutateGraph('nope', addTask('t1'), { expectedVersion: 1, reason: 'r' })
    ).toThrowError(expect.objectContaining({ code: 'project_not_found' }))
  })
})
