import { describe, expect, it } from 'vitest'
import { ProjectEngine, starterProjectOperations } from '@powerfarm/project-core'
import { LocalPowerfarmClient, memorySnapshotStore } from './index'
import { PowerfarmError } from '../errors'
import type { ProjectSnapshot, ProjectSubscriber } from '../client'

function seedOne() {
  const engine = new ProjectEngine()
  engine.createProject({
    initialOperations: starterProjectOperations('Slice'),
    reason: 'test seed',
    title: 'Slice',
  })
  return engine.toSnapshot()
}

function newClient(options: { latencyMs?: number } = {}) {
  return new LocalPowerfarmClient({
    latencyMs: options.latencyMs ?? 0,
    seed: seedOne,
    store: memorySnapshotStore(),
  })
}

async function firstProjectId(client: LocalPowerfarmClient): Promise<string> {
  const [project] = await client.projects.list()
  return project!.id
}

describe('LocalPowerfarmClient', () => {
  it('declares itself as local so the UI can say so', () => {
    const client = newClient()
    expect(client.mode).toBe('local')
    expect(client.description).toMatch(/local/i)
  })

  it('lists and reads a seeded project', async () => {
    const client = newClient()
    const projects = await client.projects.list()
    expect(projects).toHaveLength(1)
    const snapshot = await client.projects.get(projects[0]!.id)
    expect(snapshot.projection.metrics.liveNodes).toBe(3)
  })

  it('applies a command and advances the version', async () => {
    const client = newClient()
    const id = await firstProjectId(client)
    const result = await client.projects.mutate({
      expectedVersion: 1,
      kind: 'mutate_graph',
      mutationKey: 'k1',
      operations: [{ op: 'add_node', nodeId: 't1', kind: 'task', label: 'Task', metadata: {} }],
      projectId: id,
      reason: 'add a task',
    })
    expect(result.snapshot.summary.version).toBe(2)
    expect(result.replayed).toBe(false)
    expect(result.affectedNodeIds).toContain('t1')
  })

  it('surfaces a stale write as a conflict, not a generic failure', async () => {
    const client = newClient()
    const id = await firstProjectId(client)
    await client.projects.mutate({
      expectedVersion: 1,
      kind: 'update_tags',
      add: ['first'],
      mutationKey: 'k1',
      projectId: id,
      reason: 'first',
    })

    await expect(
      client.projects.mutate({
        expectedVersion: 1,
        kind: 'update_tags',
        add: ['second'],
        mutationKey: 'k2',
        projectId: id,
        reason: 'stale',
      })
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('reports a replayed retry as success rather than a conflict', async () => {
    const client = newClient()
    const id = await firstProjectId(client)
    const command = {
      expectedVersion: 1,
      kind: 'update_tags' as const,
      add: ['once'],
      mutationKey: 'ambiguous-key',
      projectId: id,
      reason: 'tag once',
    }

    const first = await client.projects.mutate(command)
    const retry = await client.projects.mutate(command)

    expect(first.replayed).toBe(false)
    expect(retry.replayed).toBe(true)
    expect(retry.snapshot.summary.version).toBe(first.snapshot.summary.version)
    expect(retry.snapshot.summary.tags).toEqual(['once'])
  })

  it('classifies a domain violation as validation, not backend', async () => {
    const client = newClient()
    const id = await firstProjectId(client)
    await expect(
      client.projects.mutate({
        expectedVersion: 1,
        kind: 'mutate_graph',
        mutationKey: 'k',
        operations: [{ op: 'tombstone_node', nodeId: 'ghost' }],
        projectId: id,
        reason: 'remove a node that is not there',
      })
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('reports an unknown project as not_found', async () => {
    const client = newClient()
    await expect(client.projects.get('nope')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('manufactures a concurrent writer so conflict recovery can be exercised', async () => {
    const client = newClient()
    const id = await firstProjectId(client)
    const before = await client.projects.get(id)

    client.simulateConcurrentMutation(id)

    await expect(
      client.projects.mutate({
        expectedVersion: before.summary.version,
        kind: 'update_tags',
        add: ['mine'],
        mutationKey: 'k',
        projectId: id,
        reason: 'my write',
      })
    ).rejects.toMatchObject({ code: 'conflict' })

    // The caller recovers by reading the authoritative state and retrying against it.
    const current = await client.projects.get(id)
    expect(current.summary.version).toBe(before.summary.version + 1)
    const retried = await client.projects.mutate({
      expectedVersion: current.summary.version,
      kind: 'update_tags',
      add: ['mine'],
      mutationKey: 'k',
      projectId: id,
      reason: 'my write',
    })
    expect(retried.snapshot.summary.tags).toContain('mine')
  })

  it('honours injected latency so pending states are exercised in development', async () => {
    const client = newClient({ latencyMs: 40 })
    const started = Date.now()
    await client.projects.list()
    expect(Date.now() - started).toBeGreaterThanOrEqual(30)
  })

  it('delivers catch-up then ready, then live events, to a subscriber', async () => {
    const client = newClient({ latencyMs: 1 })
    const id = await firstProjectId(client)
    const seen: string[] = []
    let latest: ProjectSnapshot | null = null

    const subscriber: ProjectSubscriber = {
      event: (_event, snapshot) => {
        seen.push('event')
        latest = snapshot
      },
      interrupted: () => seen.push('interrupted'),
      ready: () => seen.push('ready'),
      snapshot: (snapshot) => {
        seen.push('snapshot')
        latest = snapshot
      },
    }

    const unsubscribe = client.projects.subscribe(id, subscriber)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen).toEqual(['snapshot', 'ready'])

    await client.projects.mutate({
      expectedVersion: 1,
      kind: 'update_tags',
      add: ['live'],
      mutationKey: 'k',
      projectId: id,
      reason: 'tag',
    })
    expect(seen).toEqual(['snapshot', 'ready', 'event'])
    expect(latest!.summary.tags).toContain('live')

    unsubscribe()
    await client.projects.mutate({
      expectedVersion: 2,
      kind: 'update_tags',
      add: ['after'],
      mutationKey: 'k2',
      projectId: id,
      reason: 'tag again',
    })
    expect(seen).toEqual(['snapshot', 'ready', 'event'])
  })

  it('does not notify subscribers for an idempotent replay', async () => {
    const client = newClient({ latencyMs: 1 })
    const id = await firstProjectId(client)
    let events = 0
    client.projects.subscribe(id, {
      event: () => {
        events += 1
      },
      interrupted: () => {},
      ready: () => {},
      snapshot: () => {},
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    const command = {
      expectedVersion: 1,
      kind: 'update_tags' as const,
      add: ['once'],
      mutationKey: 'same',
      projectId: id,
      reason: 'tag',
    }
    await client.projects.mutate(command)
    await client.projects.mutate(command)
    expect(events).toBe(1)
  })

  it('persists across a restart through its store', async () => {
    const store = memorySnapshotStore()
    const first = new LocalPowerfarmClient({ seed: seedOne, store })
    const id = await firstProjectId(first)
    await first.projects.mutate({
      expectedVersion: 1,
      kind: 'update_tags',
      add: ['durable'],
      mutationKey: 'k',
      projectId: id,
      reason: 'tag',
    })

    const second = new LocalPowerfarmClient({ seed: seedOne, store })
    const snapshot = await second.projects.get(id)
    expect(snapshot.summary.tags).toContain('durable')
  })

  it('creates a project with its starter graph', async () => {
    const client = newClient()
    const result = await client.projects.create({
      mutationKey: 'create-1',
      reason: 'new work',
      title: 'Second Project',
    })
    expect(result.snapshot.summary.number).toBe(2)
    expect(result.snapshot.projection.metrics.liveNodes).toBe(3)
  })

  it('synthesises human activity from durable events, keeping machine detail underneath', async () => {
    const client = newClient()
    const id = await firstProjectId(client)
    await client.projects.mutate({
      expectedVersion: 1,
      kind: 'change_status',
      mutationKey: 'k',
      projectId: id,
      status: 'waiting',
      reason: 'waiting on review',
    })

    const entries = await client.activity.list(id)
    const latest = entries.at(-1)!
    expect(latest.message).toMatch(/Status moved from/)
    expect(latest.detail?.operationType).toBe('change_project_status')
  })

  it('refuses software, changes and runs rather than faking them', async () => {
    const client = newClient()
    const id = await firstProjectId(client)
    expect(await client.software.listRepositories(id)).toEqual([])
    expect(await client.changes.list(id)).toEqual([])
    expect(await client.runs.list(id)).toEqual([])
    await expect(client.changes.approve('c1', 'k')).rejects.toBeInstanceOf(PowerfarmError)
  })
})

describe('local assistant', () => {
  it('answers from the project graph and says what it cannot do', async () => {
    const client = newClient()
    const id = await firstProjectId(client)
    const conversation = await client.assistant.createConversation(id)

    const events = []
    for await (const event of client.assistant.send(conversation.id, {
      idempotencyKey: 'turn-1',
      text: "what's next?",
    })) {
      events.push(event)
    }

    expect(events[0]).toMatchObject({ type: 'status' })
    const final = events.at(-1)
    expect(final).toMatchObject({ type: 'final' })
    expect((final as { text: string }).text).toContain('Define scope')
  })

  it('reports an unknown conversation rather than inventing one', async () => {
    const client = newClient()
    const iterator = client.assistant.send('nope', { idempotencyKey: 'k', text: 'hi' })
    await expect((async () => {
      for await (const _event of iterator) void _event
    })()).rejects.toMatchObject({ code: 'not_found' })
  })
})
