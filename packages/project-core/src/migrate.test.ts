import { describe, expect, it } from 'vitest'
import { SNAPSHOT_VERSION, migrateSnapshot } from './migrate'
import { ProjectEngine } from './engine'
import { starterProjectOperations } from './templates'

/** A Platform Three snapshot, in the shape `atlas-workspace-v1` actually stored. */
function legacySnapshot() {
  return {
    nextNumber: 2,
    projects: [
      {
        summary: {
          id: 'p1',
          number: 1,
          title: 'Legacy',
          status: 'in_progress',
          version: 3,
          tags: [],
          ownerId: 'local-operator',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          archivedAt: null,
          graphSchemaVersion: 1,
          projectionSchema: {
            version: 1,
            columns: [
              {
                emphasis: 'strong',
                key: 'status',
                label: 'Status',
                position: 0,
                selector: { field: 'status', selector: 'process_field' },
                valueType: 'status',
              },
              {
                emphasis: 'normal',
                key: 'tasks',
                label: 'Open tasks',
                position: 20,
                selector: { entity: 'node', kind: 'task', limit: 10000, selector: 'node_count' },
                valueType: 'number',
              },
            ],
          },
        },
        nodes: [],
        edges: [],
        events: [
          { id: 'e1', operationType: 'create_process', sequence: 1 },
          { id: 'e2', operationType: 'mutate_graph', sequence: 2 },
          { id: 'e3', operationType: 'change_process_state', sequence: 3 },
          { id: 'e4', operationType: 'update_process_tags', sequence: 4 },
        ],
      },
    ],
  }
}

describe('migrateSnapshot', () => {
  it('rewrites process_field selectors to project_field', () => {
    const migrated = migrateSnapshot(legacySnapshot())
    const columns = migrated!.projects[0]!.summary.projectionSchema.columns
    expect(columns[0]!.selector).toEqual({ field: 'status', selector: 'project_field' })
  })

  it('leaves selectors that were never renamed alone', () => {
    const migrated = migrateSnapshot(legacySnapshot())
    const columns = migrated!.projects[0]!.summary.projectionSchema.columns
    expect(columns[1]!.selector).toEqual({
      entity: 'node',
      kind: 'task',
      limit: 10000,
      selector: 'node_count',
    })
  })

  it('rewrites the renamed event operation types and keeps the rest', () => {
    const migrated = migrateSnapshot(legacySnapshot())
    const events = migrated!.projects[0]!.events
    expect(events.map((event) => event.operationType)).toEqual([
      'create_project',
      'mutate_graph',
      'change_project_status',
      'update_project_tags',
    ])
  })

  it('stamps the current snapshot version', () => {
    expect(migrateSnapshot(legacySnapshot())!.snapshotVersion).toBe(SNAPSHOT_VERSION)
  })

  it('passes a current snapshot through untouched', () => {
    const engine = new ProjectEngine()
    engine.createProject({
      reason: 'r',
      title: 'Current',
      initialOperations: starterProjectOperations('Current'),
    })
    const current = { ...engine.toSnapshot(), snapshotVersion: SNAPSHOT_VERSION }
    expect(migrateSnapshot(current)).toEqual(current)
  })

  it('produces a snapshot the engine can load and keep mutating', () => {
    const migrated = migrateSnapshot(legacySnapshot())!
    const engine = new ProjectEngine(migrated)
    const projects = engine.listProjects()
    expect(projects).toHaveLength(1)
    expect(engine.getProjection('p1').status).toBe('in_progress')

    const result = engine.mutateGraph(
      'p1',
      [{ op: 'add_node', nodeId: 'after-migration', kind: 'task', label: 'Still works', metadata: {} }],
      { expectedVersion: 3, reason: 'post-migration write' }
    )
    expect(result.version).toBe(4)
  })

  it('refuses a snapshot from a future version rather than guessing', () => {
    expect(migrateSnapshot({ ...legacySnapshot(), snapshotVersion: 99 })).toBeNull()
  })

  it('returns null for junk instead of throwing', () => {
    expect(migrateSnapshot(null)).toBeNull()
    expect(migrateSnapshot('nope')).toBeNull()
    expect(migrateSnapshot({})).toBeNull()
    expect(migrateSnapshot({ nextNumber: 1 })).toBeNull()
  })
})
