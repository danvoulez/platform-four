import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalPowerfarmClient, memorySnapshotStore } from '@powerfarm/client'
import { ProjectEngine, starterProjectOperations } from '@powerfarm/project-core'

/**
 * The store reads its client through a live binding, so swapping `client` between tests gives
 * each one a clean substrate without reloading the module graph.
 */
let client: LocalPowerfarmClient
vi.mock('@/state/client', () => ({
  get powerfarm() {
    return client
  },
  createPowerfarmClient: () => client,
}))

function seed() {
  const engine = new ProjectEngine()
  engine.createProject({
    initialOperations: starterProjectOperations('Slice'),
    reason: 'test seed',
    tags: ['core'],
    title: 'Slice',
  })
  return engine.toSnapshot()
}

function makeClient(latencyMs = 0) {
  return new LocalPowerfarmClient({ latencyMs, seed, store: memorySnapshotStore() })
}

// The store captures mode and description when its module evaluates, so a client must exist
// before the import — hence the dynamic import here rather than at the top of the file.
client = makeClient()
const { useWorkspaceStore } = await import('./workspace')
const { useCanvasStore } = await import('./canvas')

const initialState = useWorkspaceStore.getState()

async function bootWith(latencyMs = 0) {
  client = makeClient(latencyMs)
  useWorkspaceStore.setState({
    ...initialState,
    activity: [],
    chat: [],
    conflict: null,
    failure: null,
    pending: [],
    projects: [],
    provisionalNodes: [],
    snapshot: null,
    status: 'loading',
  })
  useCanvasStore.setState({ positions: {}, projectKey: 'test' })
  await useWorkspaceStore.getState().start()
}

const store = () => useWorkspaceStore.getState()

beforeEach(async () => {
  await bootWith()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('start', () => {
  it('loads projects, opens the first one, and settles idle', () => {
    expect(store().projects).toHaveLength(1)
    expect(store().snapshot?.summary.title).toBe('Slice')
    expect(store().status).toBe('idle')
  })

  it('reports the substrate so the UI can say which world it is in', () => {
    expect(store().mode).toBe('local')
    expect(store().substrateDescription).toMatch(/local/i)
  })

  it('seeds canvas positions for the project it opened', () => {
    const positions = useCanvasStore.getState().positions
    expect(Object.keys(positions).length).toBeGreaterThan(0)
  })
})

describe('mutations', () => {
  it('advances the version and reconciles onto authoritative state', async () => {
    const before = store().snapshot!.summary.version
    await store().addNode('task', 'Write the adapter')
    expect(store().snapshot!.summary.version).toBe(before + 1)
    expect(store().snapshot!.nodes.some((node) => node.label === 'Write the adapter')).toBe(true)
    expect(store().status).toBe('idle')
  })

  it('shows an in-flight operation and a provisional node, then clears both', async () => {
    await bootWith(30)
    const promise = store().addNode('task', 'Slow task')

    await vi.waitFor(() => {
      expect(store().pending).toHaveLength(1)
    })
    expect(store().status).toBe('mutating')
    expect(store().provisionalNodes.map((node) => node.label)).toEqual(['Slow task'])

    await promise
    expect(store().pending).toHaveLength(0)
    expect(store().provisionalNodes).toHaveLength(0)
    expect(store().status).toBe('idle')
  })

  it('records the change in activity in human terms', async () => {
    await store().changeStatus('waiting')
    expect(store().activity.at(-1)?.message).toMatch(/Status moved from/)
  })

  it('surfaces a domain violation as a failure without corrupting state', async () => {
    const before = store().snapshot!.summary.version
    await store().tombstoneNode('does-not-exist')
    expect(store().status).toBe('failed')
    expect(store().failure?.code).toBe('validation')
    expect(store().snapshot!.summary.version).toBe(before)
  })

  it('clears a failure when dismissed', async () => {
    await store().tombstoneNode('does-not-exist')
    store().dismissFailure()
    expect(store().failure).toBeNull()
    expect(store().status).toBe('idle')
  })
})

describe('conflict reconciliation', () => {
  it('recovers from a lost race by reconciling and retrying a safe intent', async () => {
    const projectId = store().activeProjectId!
    const startingVersion = store().snapshot!.summary.version

    // A concurrent writer lands between the store reading its version and submitting.
    const original = client.projects.mutate.bind(client.projects)
    let raced = false
    vi.spyOn(client.projects, 'mutate').mockImplementation(async (command) => {
      if (!raced) {
        raced = true
        client.simulateConcurrentMutation(projectId)
      }
      return original(command)
    })

    await store().addTag('mine')

    // The other writer's change and ours are both present, and nothing was silently overwritten.
    expect(store().snapshot!.summary.tags).toContain('mine')
    expect(store().snapshot!.summary.tags.some((tag) => tag.startsWith('race-'))).toBe(true)
    expect(store().snapshot!.summary.version).toBe(startingVersion + 2)
    expect(store().conflict).toBeNull()
    expect(store().status).toBe('idle')
  })

  it('leaves a conflicted status change for a person to decide rather than replaying it', async () => {
    const projectId = store().activeProjectId!
    const original = client.projects.mutate.bind(client.projects)
    let raced = false
    vi.spyOn(client.projects, 'mutate').mockImplementation(async (command) => {
      if (!raced) {
        raced = true
        client.simulateConcurrentMutation(projectId)
      }
      return original(command)
    })

    await store().changeStatus('waiting')

    expect(store().status).toBe('conflicted')
    expect(store().conflict?.message).toMatch(/moved to v/)
    // The store refreshed to authoritative state instead of holding a stale view.
    expect(store().snapshot!.summary.status).toBe('in_progress')
    expect(store().snapshot!.summary.tags.some((tag) => tag.startsWith('race-'))).toBe(true)
  })

  it('clears a conflict when dismissed', async () => {
    useWorkspaceStore.setState({ conflict: { label: 'x', message: 'y' }, status: 'conflicted' })
    store().dismissConflict()
    expect(store().conflict).toBeNull()
    expect(store().status).toBe('idle')
  })

  it('refreshes back onto authoritative state on demand', async () => {
    const projectId = store().activeProjectId!
    client.simulateConcurrentMutation(projectId)
    await store().refresh()
    const authoritative = await client.projects.get(projectId)
    expect(store().snapshot!.summary.version).toBe(authoritative.summary.version)
    expect(store().snapshot!.summary.tags).toEqual(authoritative.summary.tags)
  })

  it('reconciles a concurrent write through the subscription, without being asked', async () => {
    const projectId = store().activeProjectId!
    const before = store().snapshot!.summary.version
    client.simulateConcurrentMutation(projectId)
    expect(store().snapshot!.summary.version).toBe(before + 1)
  })
})

describe('idempotency', () => {
  it('treats a replayed mutation as success, not as a conflict', async () => {
    const projectId = store().activeProjectId!
    const original = client.projects.mutate.bind(client.projects)
    // Simulate an ambiguous network failure: the write lands, the response is lost, the store
    // retries. The same mutation key must make that safe.
    vi.spyOn(client.projects, 'mutate').mockImplementationOnce(async (command) => {
      await original(command)
      throw Object.assign(new Error('connection reset'), {
        code: 'conflict',
        name: 'PowerfarmError',
      })
    })

    await store().addTag('once')

    const snapshot = await client.projects.get(projectId)
    expect(snapshot.summary.tags.filter((tag) => tag === 'once')).toHaveLength(1)
  })
})

describe('assistant', () => {
  it('streams a grounded answer and settles', async () => {
    await store().askPowerfarm("what's next?")
    const reply = store().chat.at(-1)!
    expect(reply.role).toBe('assistant')
    expect(reply.streaming).toBeFalsy()
    expect(reply.text).toContain('Define scope')
    expect(store().status).toBe('idle')
  })

  it('opens the assistant panel when asked', async () => {
    await store().askPowerfarm('status?')
    expect(store().sideTab).toBe('chat')
    expect(store().sideOpen).toBe(true)
  })
})

describe('ops terminal', () => {
  it('routes a command through the same client boundary as the buttons', async () => {
    const before = store().snapshot!.summary.version
    await store().submitTerminal('add task Wire the adapter')
    expect(store().snapshot!.summary.version).toBe(before + 1)
    expect(store().snapshot!.nodes.some((node) => node.label === 'Wire the adapter')).toBe(true)
  })

  it('explains an unknown command instead of failing silently', async () => {
    await store().submitTerminal('teleport')
    expect(store().activity.at(-1)?.message).toMatch(/unknown command/)
  })

  it('changes status through the domain, respecting transitions', async () => {
    await store().submitTerminal('status waiting')
    expect(store().snapshot!.summary.status).toBe('waiting')
  })
})

describe('presets', () => {
  it('rearranges the workspace without touching Project truth', async () => {
    const version = store().snapshot!.summary.version
    store().setPreset('Board')
    expect(store().sideTab).toBe('board')
    expect(store().snapshot!.summary.version).toBe(version)
  })
})
