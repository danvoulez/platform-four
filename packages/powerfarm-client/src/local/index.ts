import {
  EngineError,
  ProjectEngine,
  humanEventLabel,
  seedWorkspace,
  starterProjectOperations,
  type EngineSnapshot,
  type ProjectEvent,
  type ProjectSummary,
} from '@powerfarm/project-core'
import { PowerfarmError } from '../errors'
import type {
  ActivityClient,
  ActivityEntry,
  AssistantClient,
  AssistantEvent,
  AssistantInput,
  CapabilitiesClient,
  ChangesClient,
  Conversation,
  ConversationId,
  PowerfarmClient,
  ProjectCommand,
  ProjectId,
  ProjectMutationResult,
  ProjectSnapshot,
  ProjectSubscriber,
  ProjectsClient,
  RunsClient,
  SoftwareClient,
  Unsubscribe,
} from '../client'
import { memorySnapshotStore, type SnapshotStore } from './storage'

export { browserSnapshotStore, memorySnapshotStore, type SnapshotStore } from './storage'

export interface LocalPowerfarmClientOptions {
  /** Where the snapshot lives. Defaults to memory. */
  readonly store?: SnapshotStore
  /**
   * Artificial round-trip latency in milliseconds, or a function returning one.
   *
   * This exists so the Workbench's asynchronous behaviour is exercised in development rather than
   * only against a real network: a local adapter that answers instantly hides every missing
   * pending state.
   */
  readonly latencyMs?: number | (() => number)
  /** Seeds a fresh workspace when the store is empty. Defaults to the fixture workspace. */
  readonly seed?: () => EngineSnapshot
}

/**
 * The in-process adapter.
 *
 * It runs the real `ProjectEngine`, so version conflicts, idempotent replays, tombstones and
 * status transitions behave exactly as they will against a durable substrate — only the storage
 * and the transport are fake. That is deliberate: it is the difference between a mock and a local
 * implementation, and it is what makes Phase 4's reconciliation work testable without a backend.
 *
 * Software, Changes and Runs are **not** simulated. They answer empty, because inventing fake
 * repositories and fake proposals would put unreachable product surfaces in front of the user.
 */
export class LocalPowerfarmClient implements PowerfarmClient {
  readonly mode = 'local' as const
  readonly description = 'local fixtures · nothing here is durable beyond this browser'

  readonly projects: ProjectsClient
  readonly assistant: AssistantClient
  readonly software: SoftwareClient
  readonly changes: ChangesClient
  readonly activity: ActivityClient
  readonly runs: RunsClient
  readonly capabilities: CapabilitiesClient

  private readonly engine: ProjectEngine
  private readonly store: SnapshotStore
  private readonly latency: () => number
  private readonly projectSubscribers = new Map<ProjectId, Set<ProjectSubscriber>>()
  private readonly activitySubscribers = new Map<ProjectId, Set<(entry: ActivityEntry) => void>>()
  private readonly conversations = new Map<ConversationId, Conversation>()
  private conversationSequence = 0

  constructor(options: LocalPowerfarmClientOptions = {}) {
    this.store = options.store ?? memorySnapshotStore()
    const seed = options.seed ?? seedWorkspace
    this.engine = new ProjectEngine(this.store.load() ?? seed())
    const latency = options.latencyMs ?? 0
    this.latency = typeof latency === 'function' ? latency : () => latency
    this.persist()

    this.projects = this.buildProjectsClient()
    this.assistant = this.buildAssistantClient()
    this.activity = this.buildActivityClient()
    this.software = {
      listRepositories: async () => [],
      listTree: async () => {
        throw new PowerfarmError('not_found', 'Local mode has no software. Connect a Project to read real source.')
      },
      readFile: async () => {
        throw new PowerfarmError('not_found', 'Local mode has no software. Connect a Project to read real source.')
      },
    }
    this.changes = {
      list: async () => [],
      get: async () => {
        throw new PowerfarmError('not_found', 'Local mode has no Changes. Connect a Project to propose real changes.')
      },
      diff: async () => [],
      approve: async () => {
        throw new PowerfarmError('unauthorized', 'Local mode cannot approve: there is no substrate to hold the decision.')
      },
      reject: async () => {
        throw new PowerfarmError('unauthorized', 'Local mode cannot reject: there is no substrate to hold the decision.')
      },
      apply: async () => {
        throw new PowerfarmError('unauthorized', 'Local mode cannot apply a Change.')
      },
      subscribe: () => () => {},
    }
    this.runs = {
      list: async () => [],
      get: async () => {
        throw new PowerfarmError('not_found', 'Local mode has no Runs.')
      },
      subscribe: () => () => {},
    }
    this.capabilities = {
      listConnections: async () => [],
      listCapabilities: async () => [],
    }
  }

  /**
   * Test and development handle: applies a mutation *behind* the client, as a second client would.
   *
   * Use it to manufacture the version conflict a real concurrent writer would cause, so the
   * Workbench's reconciliation path can be exercised deterministically.
   */
  simulateConcurrentMutation(projectId: ProjectId, reason = 'concurrent writer'): void {
    const record = this.engine.getRecord(projectId)
    if (!record) throw new PowerfarmError('not_found', `No project ${projectId}`)
    this.engine.updateTags(
      projectId,
      { add: [`race-${record.summary.version}`] },
      { actor: 'other-operator', expectedVersion: record.summary.version, reason }
    )
    this.persist()
    this.broadcast(projectId)
  }

  private buildProjectsClient(): ProjectsClient {
    return {
      list: async () => {
        await this.delay()
        return this.engine.listProjects()
      },

      get: async (id) => {
        await this.delay()
        return this.snapshotOf(id)
      },

      create: async ({ title, reason, tags, mutationKey }) => {
        await this.delay()
        return this.translate(() => {
          const result = this.engine.createProject({
            initialOperations: starterProjectOperations(title),
            reason,
            tags,
            title,
          })
          this.persist()
          const snapshot = this.snapshotOf(result.project.id)
          this.broadcast(result.project.id, result.event)
          return {
            affectedEdgeIds: result.affectedEdgeIds,
            affectedNodeIds: result.affectedNodeIds,
            event: result.event,
            operationSummary: result.operationSummary,
            replayed: false,
            snapshot,
          }
        }, mutationKey)
      },

      mutate: async (command) => {
        await this.delay()
        return this.translate(() => this.applyCommand(command), command.mutationKey)
      },

      subscribe: (id, subscriber) => this.subscribeToProject(id, subscriber),
    }
  }

  private applyCommand(command: ProjectCommand): ProjectMutationResult {
    const before = this.engine.getRecord(command.projectId)?.summary.version
    const shared = {
      actor: command.actor,
      expectedVersion: command.expectedVersion,
      mutationKey: command.mutationKey,
      reason: command.reason,
    }

    const result =
      command.kind === 'mutate_graph'
        ? this.engine.mutateGraph(command.projectId, command.operations, shared)
        : command.kind === 'change_status'
          ? this.engine.changeState(command.projectId, command.status, shared)
          : this.engine.updateTags(
              command.projectId,
              { add: command.add, remove: command.remove },
              shared
            )

    // An idempotent replay leaves the version where it was; a fresh apply advances it.
    const replayed = before !== undefined && result.version === before
    this.persist()
    const snapshot = this.snapshotOf(command.projectId)
    if (!replayed) this.broadcast(command.projectId, result.event)

    return {
      affectedEdgeIds: result.affectedEdgeIds,
      affectedNodeIds: result.affectedNodeIds,
      event: result.event,
      operationSummary: result.operationSummary,
      replayed,
      snapshot,
    }
  }

  private buildAssistantClient(): AssistantClient {
    return {
      listConversations: async (projectId) => {
        await this.delay()
        return [...this.conversations.values()].filter(
          (conversation) => conversation.projectId === projectId
        )
      },

      createConversation: async (projectId, title) => {
        await this.delay()
        this.conversationSequence += 1
        const conversation: Conversation = {
          createdAt: new Date().toISOString(),
          id: `local-conversation-${this.conversationSequence}`,
          projectId,
          title: title ?? 'Conversation',
        }
        this.conversations.set(conversation.id, conversation)
        return conversation
      },

      send: (conversationId, input) => this.localAssistantTurn(conversationId, input),
    }
  }

  /**
   * The local assistant answers from the Project graph only.
   *
   * It performs no model call and claims no software access, so what it says is always something
   * the Workbench can actually show. Anything it cannot answer locally, it says so plainly rather
   * than inventing an answer that would look identical to a real one.
   */
  private async *localAssistantTurn(
    conversationId: ConversationId,
    input: AssistantInput
  ): AsyncIterable<AssistantEvent> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      throw new PowerfarmError('not_found', `No conversation ${conversationId}`)
    }

    yield { label: 'reading the project graph', type: 'status' }
    await this.delay()

    const snapshot = this.snapshotOf(conversation.projectId)
    const text = answerFromGraph(snapshot, input)
    for (const chunk of chunkText(text)) {
      yield { text: chunk, type: 'text_delta' }
      await this.delay()
    }
    yield { sequence: Date.now(), text, type: 'final' }
  }

  private buildActivityClient(): ActivityClient {
    return {
      list: async (projectId, limit = 100) => {
        await this.delay()
        const record = this.engine.getRecord(projectId)
        if (!record) return []
        return record.events.slice(-limit).map(toActivityEntry)
      },
      subscribe: (projectId, onEntry) => {
        const set = this.activitySubscribers.get(projectId) ?? new Set()
        set.add(onEntry)
        this.activitySubscribers.set(projectId, set)
        return () => set.delete(onEntry)
      },
    }
  }

  private subscribeToProject(id: ProjectId, subscriber: ProjectSubscriber): Unsubscribe {
    const set = this.projectSubscribers.get(id) ?? new Set()
    set.add(subscriber)
    this.projectSubscribers.set(id, set)

    // Catch-up, then the ready boundary — the same contract the connected adapter honours.
    void (async () => {
      try {
        await this.delay()
        if (!set.has(subscriber)) return
        subscriber.snapshot(this.snapshotOf(id))
        subscriber.ready()
      } catch (error) {
        subscriber.interrupted(error instanceof Error ? error.message : 'subscription failed')
      }
    })()

    return () => set.delete(subscriber)
  }

  private broadcast(id: ProjectId, event?: ProjectEvent): void {
    const snapshot = this.snapshotOf(id)
    for (const subscriber of this.projectSubscribers.get(id) ?? []) {
      if (event) subscriber.event(event, snapshot)
      else subscriber.snapshot(snapshot)
    }
    if (event) {
      const entry = toActivityEntry(event)
      for (const listener of this.activitySubscribers.get(id) ?? []) listener(entry)
    }
  }

  private snapshotOf(id: ProjectId): ProjectSnapshot {
    const record = this.engine.getRecord(id)
    if (!record) throw new PowerfarmError('not_found', `No project ${id}`)
    return {
      edges: record.edges,
      events: record.events,
      nodes: record.nodes,
      projection: this.engine.getProjection(id),
      summary: record.summary,
    }
  }

  private persist(): void {
    this.store.save(this.engine.toSnapshot())
  }

  private async delay(): Promise<void> {
    const ms = this.latency()
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
  }

  /** Maps the engine's failure vocabulary onto the boundary's. */
  private translate<T>(run: () => T, _mutationKey: string): T {
    try {
      return run()
    } catch (error) {
      throw toPowerfarmError(error)
    }
  }
}

/** Translates an engine or schema failure into the boundary's error vocabulary. */
export function toPowerfarmError(error: unknown): PowerfarmError {
  if (PowerfarmError.is(error)) return error
  if (error instanceof EngineError) {
    switch (error.code) {
      case 'version_conflict':
        return new PowerfarmError('conflict', error.message, { cause: error })
      case 'project_not_found':
        return new PowerfarmError('not_found', error.message, { cause: error })
      case 'project_archived':
        return new PowerfarmError('validation', error.message, { cause: error })
      case 'invalid_status_transition':
      case 'invalid_graph_operation':
      case 'duplicate_mutation':
        return new PowerfarmError('validation', error.message, { cause: error })
    }
  }
  // A zod failure is still the caller's malformed command, not a substrate fault.
  if (error instanceof Error && error.name === 'ZodError') {
    return new PowerfarmError('validation', 'That change does not fit the Project schema.', {
      cause: error,
    })
  }
  return new PowerfarmError('backend', 'The local engine failed unexpectedly.', { cause: error })
}

function toActivityEntry(event: ProjectEvent): ActivityEntry {
  return {
    actor: event.actor,
    at: event.createdAt,
    detail: {
      mutationKey: event.mutationKey,
      operationType: event.operationType,
      payload: event.payload,
      projectVersion: event.projectVersion,
      sequence: event.sequence,
    },
    id: event.id,
    kind: event.operationType === 'create_project' ? 'system' : 'project_changed',
    message: humanEventLabel(event),
    subject: { id: event.projectId, type: 'project' },
  }
}

function chunkText(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text]
}

/** Answers a small set of questions directly from Project state. */
function answerFromGraph(snapshot: ProjectSnapshot, input: AssistantInput): string {
  const question = input.text.trim().toLowerCase()
  const { projection, summary } = snapshot
  const live = snapshot.nodes.filter((node) => node.tombstonedAt === null)

  if (input.selectedNodeId) {
    const node = live.find((candidate) => candidate.id === input.selectedNodeId)
    if (node && /what|why|explain|tell/.test(question)) {
      return `"${node.label}" is a ${node.kind} in project #${summary.number}, last touched ${node.updatedAt}. Local mode reads the Project graph only — connect this Project to inspect the software behind it.`
    }
  }
  if (/block/.test(question)) {
    return projection.blockers.length
      ? `${projection.blockers.length} blocker(s): ${projection.blockers.join('; ')}.`
      : 'Nothing is recorded as blocking this project.'
  }
  if (/next|todo|should/.test(question)) {
    return projection.nextAction
      ? `Next action: ${projection.nextAction}.`
      : 'No next action is recorded. Add a next_action node to set one.'
  }
  if (/status|state|happening|going on/.test(question)) {
    return `Project #${summary.number} "${summary.title}" is ${summary.status} at v${summary.version}, with ${projection.metrics.liveNodes} nodes and ${projection.metrics.liveEdges} edges.`
  }
  if (/chang/.test(question)) {
    const recent = snapshot.events.slice(-3).map((event) => humanEventLabel(event))
    return recent.length ? `Recently: ${recent.join(' · ')}.` : 'Nothing has changed yet.'
  }
  return `Local mode answers from the Project graph only. Project #${summary.number} is ${summary.status} at v${summary.version} with ${projection.metrics.liveNodes} live nodes. Connect this Project to a Powerfarm substrate for real investigation.`
}

/** Convenience: the summaries a fresh local workspace starts with. */
export function localProjectSummaries(client: LocalPowerfarmClient): Promise<readonly ProjectSummary[]> {
  return client.projects.list()
}
