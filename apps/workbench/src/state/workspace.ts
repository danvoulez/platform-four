import { create } from 'zustand'
import {
  PROJECT_STATUS_LABELS,
  humanEventLabel,
  semanticNodeId,
  edgeIdFor,
  type GraphOperation,
  type ProjectStatus,
  type ProjectSummary,
} from '@powerfarm/project-core'
import {
  PowerfarmError,
  describeError,
  type ActivityEntry,
  type PowerfarmErrorCode,
  type ProjectCommand,
  type ProjectSnapshot,
} from '@powerfarm/client'
import { powerfarm } from '@/state/client'
import { useCanvasStore } from '@/state/canvas'
import { useLayoutStore } from '@/state/layout'

export type SideTab = 'inspect' | 'board' | 'activity' | 'chat' | 'terminal'
export type WorkspacePreset = 'Design' | 'Board' | 'History' | 'Operate'

/**
 * What the Workbench is doing right now.
 *
 * Kept explicit rather than inferred from "is some promise outstanding", because the surfaces
 * differ: a conflict needs a decision, a failure needs an explanation, and neither is a spinner.
 */
export type WorkspaceStatus =
  | 'loading'
  | 'idle'
  | 'mutating'
  | 'streaming'
  | 'conflicted'
  | 'failed'
  | 'reconnecting'

export type ConnectionState = 'connecting' | 'ready' | 'interrupted'

export interface WorkspaceFailure {
  readonly code: PowerfarmErrorCode
  readonly message: string
  readonly retryable: boolean
}

/** One in-flight command, so the UI can show what is happening without guessing. */
export interface PendingOperation {
  readonly id: number
  readonly label: string
  readonly startedAt: number
}

/**
 * A node the user has asked for but the substrate has not yet confirmed.
 *
 * Held apart from authoritative `nodes` on purpose: a provisional row can never be mistaken for
 * durable truth, and clearing it is a single assignment rather than a diff.
 */
export interface ProvisionalNode {
  readonly id: string
  readonly kind: string
  readonly label: string
}

export type ChatCard =
  | {
      type: 'status'
      number: number
      title: string
      status: string
      version: number
      nodes: number
      edges: number
      summary: string | null
    }
  | { type: 'next'; nextAction: string | null; pending: string[] }
  | { type: 'blockers'; items: string[] }
  | { type: 'history'; items: { label: string; version: number }[] }
  | { type: 'node'; id: string; label: string; kind: string; updatedAt: string }
  | { type: 'projects'; items: { id: string; number: number; title: string; status: string }[] }

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  card?: ChatCard
  /** True while the assistant is still streaming this turn. */
  streaming?: boolean
  /** Short label for what the assistant is doing, e.g. `reading the project graph`. */
  status?: string
}

export interface WorkspaceActivity {
  readonly id: string
  readonly at: string
  readonly kind: 'system' | 'action' | 'terminal' | 'governance'
  readonly message: string
}

interface WorkspaceStore {
  /* substrate */
  mode: 'local' | 'connected'
  substrateDescription: string
  connection: ConnectionState

  /* authoritative project state */
  projects: readonly ProjectSummary[]
  activeProjectId: string | null
  snapshot: ProjectSnapshot | null

  /* async state */
  status: WorkspaceStatus
  pending: readonly PendingOperation[]
  failure: WorkspaceFailure | null
  /** Set when a command lost a compare-and-swap race and needs a human decision. */
  conflict: { readonly message: string; readonly label: string } | null
  provisionalNodes: readonly ProvisionalNode[]

  /* activity and chat */
  activity: readonly WorkspaceActivity[]
  chat: readonly ChatMessage[]
  conversationId: string | null

  /* workspace ergonomics (personal, never Project truth) */
  selectedNodeId: string | null
  sideTab: SideTab
  sideOpen: boolean
  heroVisible: boolean
  preset: WorkspacePreset
  linkSourceId: string | null

  /* lifecycle */
  start: () => Promise<void>
  openProject: (projectId: string) => Promise<void>
  refresh: () => Promise<void>

  /* project commands */
  newProject: (title: string) => Promise<void>
  addNode: (kind: string, label: string, metadata?: Record<string, string>) => Promise<void>
  updateNode: (
    nodeId: string,
    patch: { label?: string; metadata?: Record<string, string> }
  ) => Promise<void>
  tombstoneNode: (nodeId: string) => Promise<void>
  linkNodes: (sourceNodeId: string, targetNodeId: string, relation?: string) => Promise<void>
  changeStatus: (status: ProjectStatus) => Promise<void>
  addTag: (tag: string) => Promise<void>
  removeTag: (tag: string) => Promise<void>

  /* assistant */
  askPowerfarm: (text: string) => Promise<void>

  /* ops */
  submitTerminal: (command: string) => Promise<void>

  /* ui */
  setSelection: (id: string | null) => void
  setSideTab: (tab: SideTab) => void
  toggleSide: () => void
  setHeroVisible: (visible: boolean) => void
  setPreset: (preset: WorkspacePreset) => void
  beginLink: (nodeId: string) => void
  cancelLink: () => void
  invokeAction: (action: string) => void
  dismissFailure: () => void
  dismissConflict: () => void
}

let operationSequence = 0
let chatSequence = 0
let activitySequence = 0
let unsubscribeProject: (() => void) | null = null

function newMutationKey(): string {
  return `workbench:${crypto.randomUUID()}`
}

function localActivity(
  message: string,
  kind: WorkspaceActivity['kind'] = 'system'
): WorkspaceActivity {
  activitySequence += 1
  return {
    at: new Date().toISOString(),
    id: `local-${activitySequence}`,
    kind,
    message,
  }
}

function toWorkspaceActivity(entry: ActivityEntry): WorkspaceActivity {
  return {
    at: entry.at,
    id: entry.id,
    kind: entry.kind === 'system' ? 'system' : 'action',
    message: entry.message,
  }
}

function toFailure(error: unknown): WorkspaceFailure {
  if (PowerfarmError.is(error)) {
    return { code: error.code, message: error.message, retryable: error.retryable }
  }
  return { code: 'backend', message: describeError(error), retryable: false }
}

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => {
  /**
   * The one path every Project mutation takes.
   *
   * intent -> pending (and optimistic echo where safe) -> request -> authoritative result ->
   * reconcile. A lost compare-and-swap race is not an error here: the store refreshes to the
   * authoritative state, and retries once with the *same* mutation key when the intent is still
   * meaningful against it. Reusing the key is what makes that retry safe — if the first attempt
   * had in fact landed, the substrate replays it instead of applying it twice.
   */
  async function runMutation(request: {
    readonly label: string
    readonly autoRetryOnConflict: boolean
    readonly provisional?: ProvisionalNode
    readonly toCommand: (input: {
      readonly projectId: string
      readonly expectedVersion: number
      readonly mutationKey: string
    }) => ProjectCommand
  }): Promise<void> {
    const state = get()
    const projectId = state.activeProjectId
    const snapshot = state.snapshot
    if (!projectId || !snapshot) return

    operationSequence += 1
    const operation: PendingOperation = {
      id: operationSequence,
      label: request.label,
      startedAt: Date.now(),
    }
    const mutationKey = newMutationKey()

    set((current) => ({
      failure: null,
      conflict: null,
      pending: [...current.pending, operation],
      provisionalNodes: request.provisional
        ? [...current.provisionalNodes, request.provisional]
        : current.provisionalNodes,
      status: 'mutating',
    }))

    // Retires the operation without discarding a terminal state: the failure and conflict paths
    // set their status *before* calling this, and settling to idle here would erase it.
    const finish = () =>
      set((current) => {
        const pending = current.pending.filter((item) => item.id !== operation.id)
        const settled: WorkspaceStatus = current.failure
          ? 'failed'
          : current.conflict
            ? 'conflicted'
            : 'idle'
        return {
          pending,
          provisionalNodes: request.provisional
            ? current.provisionalNodes.filter((node) => node.id !== request.provisional!.id)
            : current.provisionalNodes,
          status: pending.length > 0 ? current.status : settled,
        }
      })

    const attempt = async (expectedVersion: number) =>
      powerfarm.projects.mutate(
        request.toCommand({ expectedVersion, mutationKey, projectId })
      )

    try {
      const result = await attempt(snapshot.summary.version)
      applySnapshot(result.snapshot)
      finish()
    } catch (error) {
      if (PowerfarmError.is(error) && error.code === 'conflict') {
        // Someone else moved the Project. Re-read the authoritative state before deciding.
        let latest: ProjectSnapshot
        try {
          latest = await powerfarm.projects.get(projectId)
        } catch (refreshError) {
          set({ failure: toFailure(refreshError), status: 'failed' })
          finish()
          return
        }
        applySnapshot(latest)

        if (request.autoRetryOnConflict) {
          try {
            const retried = await attempt(latest.summary.version)
            applySnapshot(retried.snapshot)
            pushActivity(
              localActivity(`${request.label} · reconciled onto v${latest.summary.version}`, 'system')
            )
            finish()
            return
          } catch (retryError) {
            set({
              conflict: {
                label: request.label,
                message: describeError(retryError),
              },
              status: 'conflicted',
            })
            finish()
            return
          }
        }

        set({
          conflict: {
            label: request.label,
            message: `The project moved to v${latest.summary.version} while you were working. Your change was not applied — review the current state and try again.`,
          },
          status: 'conflicted',
        })
        finish()
        return
      }

      set({ failure: toFailure(error), status: 'failed' })
      finish()
    }
  }

  function applySnapshot(snapshot: ProjectSnapshot): void {
    useCanvasStore.getState().ensurePositions(snapshot.nodes, snapshot.edges)
    set((current) => ({
      activeProjectId: snapshot.summary.id,
      projects: current.projects.some((project) => project.id === snapshot.summary.id)
        ? current.projects.map((project) =>
            project.id === snapshot.summary.id ? snapshot.summary : project
          )
        : [snapshot.summary, ...current.projects],
      snapshot,
    }))
  }

  function pushActivity(entry: WorkspaceActivity): void {
    set((current) => ({ activity: [...current.activity, entry].slice(-500) }))
  }

  function subscribe(projectId: string): void {
    unsubscribeProject?.()
    set({ connection: 'connecting' })

    unsubscribeProject = powerfarm.projects.subscribe(projectId, {
      event: (event, snapshot) => {
        applySnapshot(snapshot)
        pushActivity({
          at: event.createdAt,
          id: event.id,
          kind: 'action',
          message: humanEventLabel(event),
        })
      },
      interrupted: (reason) => {
        set({ connection: 'interrupted', status: 'reconnecting' })
        pushActivity(localActivity(`connection interrupted · ${reason}`, 'governance'))
      },
      ready: () => set({ connection: 'ready' }),
      snapshot: (snapshot) => applySnapshot(snapshot),
    })
  }

  return {
    activeProjectId: null,
    activity: [],
    chat: [],
    conflict: null,
    connection: 'connecting',
    conversationId: null,
    failure: null,
    heroVisible: false,
    linkSourceId: null,
    mode: powerfarm.mode,
    pending: [],
    preset: 'Design',
    projects: [],
    provisionalNodes: [],
    selectedNodeId: null,
    sideOpen: true,
    sideTab: 'inspect',
    snapshot: null,
    status: 'loading',
    substrateDescription: powerfarm.description,

    start: async () => {
      set({ status: 'loading' })
      try {
        const projects = await powerfarm.projects.list()
        set({ projects })
        pushActivity(localActivity(`Powerfarm Workbench · ${powerfarm.description}`, 'system'))
        if (projects.length === 0) {
          set({ heroVisible: true, status: 'idle' })
          pushActivity(localActivity('no projects yet · create one from the hero', 'system'))
          return
        }
        await get().openProject(projects[0]!.id)
      } catch (error) {
        set({ failure: toFailure(error), status: 'failed' })
      }
    },

    openProject: async (projectId) => {
      set({ heroVisible: false, selectedNodeId: null, status: 'loading' })
      useLayoutStore.getState().loadFor(projectId)
      useCanvasStore.getState().loadFor(projectId)
      try {
        const snapshot = await powerfarm.projects.get(projectId)
        applySnapshot(snapshot)
        const entries = await powerfarm.activity.list(projectId, 100)
        set({
          activity: entries.map(toWorkspaceActivity),
          chat: [],
          conversationId: null,
          status: 'idle',
        })
        pushActivity(
          localActivity(
            `project #${snapshot.summary.number} "${snapshot.summary.title}" open · v${snapshot.summary.version}`,
            'system'
          )
        )
        subscribe(projectId)
      } catch (error) {
        set({ failure: toFailure(error), status: 'failed' })
      }
    },

    refresh: async () => {
      const projectId = get().activeProjectId
      if (!projectId) return
      try {
        applySnapshot(await powerfarm.projects.get(projectId))
        set({ conflict: null, failure: null, status: 'idle' })
      } catch (error) {
        set({ failure: toFailure(error), status: 'failed' })
      }
    },

    newProject: async (title) => {
      const trimmed = title.trim()
      if (!trimmed) return
      set({ status: 'mutating' })
      try {
        const result = await powerfarm.projects.create({
          mutationKey: newMutationKey(),
          reason: 'created from the Workbench hero',
          title: trimmed,
        })
        set({ projects: await powerfarm.projects.list() })
        await get().openProject(result.snapshot.summary.id)
      } catch (error) {
        set({ failure: toFailure(error), status: 'failed' })
      }
    },

    addNode: async (kind, label, metadata = {}) => {
      const snapshot = get().snapshot
      if (!snapshot) return
      const taken = new Set(snapshot.nodes.map((node) => node.id))
      const nodeId = semanticNodeId(label, taken)
      await runMutation({
        autoRetryOnConflict: true,
        label: `add ${kind}`,
        provisional: { id: nodeId, kind, label },
        toCommand: ({ expectedVersion, mutationKey, projectId }) => ({
          expectedVersion,
          kind: 'mutate_graph',
          mutationKey,
          operations: [{ kind, label, metadata, nodeId, op: 'add_node' }],
          projectId,
          reason: `add ${kind} "${label}"`,
        }),
      })
    },

    updateNode: async (nodeId, patch) => {
      await runMutation({
        // Two people editing the same node is a genuine disagreement, not something to resolve
        // by replaying the later write.
        autoRetryOnConflict: false,
        label: 'update node',
        toCommand: ({ expectedVersion, mutationKey, projectId }) => ({
          expectedVersion,
          kind: 'mutate_graph',
          mutationKey,
          operations: [{ nodeId, op: 'update_node', ...patch }] as GraphOperation[],
          projectId,
          reason: `update node "${nodeId}"`,
        }),
      })
    },

    tombstoneNode: async (nodeId) => {
      await runMutation({
        // The target may already be gone; a blind retry would report a confusing second failure.
        autoRetryOnConflict: false,
        label: 'remove node',
        toCommand: ({ expectedVersion, mutationKey, projectId }) => ({
          expectedVersion,
          kind: 'mutate_graph',
          mutationKey,
          operations: [{ nodeId, op: 'tombstone_node' }],
          projectId,
          reason: `tombstone node "${nodeId}"`,
        }),
      })
      if (get().selectedNodeId === nodeId) set({ selectedNodeId: null })
    },

    linkNodes: async (sourceNodeId, targetNodeId, relation = 'feeds') => {
      await runMutation({
        autoRetryOnConflict: true,
        label: 'link nodes',
        toCommand: ({ expectedVersion, mutationKey, projectId }) => ({
          expectedVersion,
          kind: 'mutate_graph',
          mutationKey,
          operations: [
            {
              edgeId: edgeIdFor(sourceNodeId, targetNodeId, relation),
              metadata: {},
              op: 'link_nodes',
              relation,
              sourceNodeId,
              targetNodeId,
            },
          ],
          projectId,
          reason: `link ${sourceNodeId} → ${targetNodeId}`,
        }),
      })
    },

    changeStatus: async (status) => {
      await runMutation({
        // The transition that was legal a moment ago may not be legal from the new status.
        autoRetryOnConflict: false,
        label: `status → ${PROJECT_STATUS_LABELS[status]}`,
        toCommand: ({ expectedVersion, mutationKey, projectId }) => ({
          expectedVersion,
          kind: 'change_status',
          mutationKey,
          projectId,
          reason: `status set to ${status} from the Workbench`,
          status,
        }),
      })
    },

    addTag: async (tag) => {
      await runMutation({
        autoRetryOnConflict: true,
        label: `tag +${tag}`,
        toCommand: ({ expectedVersion, mutationKey, projectId }) => ({
          add: [tag],
          expectedVersion,
          kind: 'update_tags',
          mutationKey,
          projectId,
          reason: `add tag "${tag}"`,
        }),
      })
    },

    removeTag: async (tag) => {
      await runMutation({
        autoRetryOnConflict: true,
        label: `tag −${tag}`,
        toCommand: ({ expectedVersion, mutationKey, projectId }) => ({
          expectedVersion,
          kind: 'update_tags',
          mutationKey,
          projectId,
          reason: `remove tag "${tag}"`,
          remove: [tag],
        }),
      })
    },

    askPowerfarm: async (text) => {
      const trimmed = text.trim()
      const projectId = get().activeProjectId
      if (!trimmed || !projectId) return

      chatSequence += 1
      const userMessage: ChatMessage = { id: chatSequence, role: 'user', text: trimmed }
      chatSequence += 1
      const replyId = chatSequence
      const reply: ChatMessage = {
        id: replyId,
        role: 'assistant',
        status: 'thinking',
        streaming: true,
        text: '',
      }

      set((current) => ({
        chat: [...current.chat, userMessage, reply],
        sideOpen: true,
        sideTab: 'chat',
        status: 'streaming',
      }))

      const patchReply = (patch: Partial<ChatMessage>) =>
        set((current) => ({
          chat: current.chat.map((message) =>
            message.id === replyId ? { ...message, ...patch } : message
          ),
        }))

      try {
        let conversationId = get().conversationId
        if (!conversationId) {
          conversationId = (await powerfarm.assistant.createConversation(projectId)).id
          set({ conversationId })
        }

        const stream = powerfarm.assistant.send(conversationId, {
          idempotencyKey: newMutationKey(),
          selectedNodeId: get().selectedNodeId ?? undefined,
          text: trimmed,
        })

        let streamed = ''
        for await (const event of stream) {
          switch (event.type) {
            case 'status':
              patchReply({ status: event.label })
              break
            case 'text_delta':
              streamed += event.text
              patchReply({ status: undefined, text: streamed })
              break
            case 'tool_started':
              patchReply({ status: event.title })
              break
            case 'tool_completed':
              patchReply({ status: undefined })
              break
            case 'error':
              patchReply({ status: undefined, streaming: false, text: event.message })
              break
            case 'final':
              patchReply({ status: undefined, streaming: false, text: event.text })
              break
            default:
              // change_proposed, run_started and friends belong to the connected substrate; the
              // Workbench renders them once Changes and Runs are real rather than inventing a
              // card for something it cannot open.
              break
          }
        }
        patchReply({ streaming: false })
        set((current) => ({ status: current.pending.length > 0 ? 'mutating' : 'idle' }))
      } catch (error) {
        patchReply({ status: undefined, streaming: false, text: describeError(error) })
        set({ failure: toFailure(error), status: 'failed' })
      }
    },

    submitTerminal: async (command) => {
      const trimmed = command.trim()
      if (!trimmed) return
      const state = get()

      const echo = (lines: string[]) => {
        pushActivity(localActivity(`$ ${trimmed}`, 'terminal'))
        for (const line of lines) pushActivity(localActivity(line, 'system'))
      }

      const [head = '', ...rest] = trimmed.split(/\s+/)
      const verb = head.toLowerCase()
      const tail = rest.join(' ')

      switch (verb) {
        case 'clear':
          set({ activity: [] })
          return
        case 'help':
          echo([
            'projects · open <n> · new <title> · status [target] · add <kind> <label>',
            'link <src> <dst> [relation] · remove <node> · tag <t> · untag <t> · refresh · clear',
          ])
          return
        case 'projects':
          echo(
            state.projects.length
              ? state.projects.map(
                  (project) =>
                    `#${project.number} · ${project.title} · ${project.status} · v${project.version}${
                      project.id === state.activeProjectId ? ' ← active' : ''
                    }`
                )
              : ['no projects — run: new <title>']
          )
          return
        case 'open': {
          const target = state.projects.find(
            (project) => project.number === Number(rest[0]) || project.id === rest[0]
          )
          echo(target ? [`opening #${target.number}`] : [`no project matches "${tail}"`])
          if (target) await get().openProject(target.id)
          return
        }
        case 'new':
          if (!tail) return echo(['usage: new <title>'])
          echo([`creating "${tail}"…`])
          await get().newProject(tail)
          return
        case 'refresh':
          echo(['refreshing from the substrate…'])
          await get().refresh()
          return
        case 'status': {
          if (!tail) {
            const summary = state.snapshot?.summary
            return echo([
              summary
                ? `#${summary.number} · ${summary.status} · v${summary.version} · ${state.snapshot!.projection.metrics.liveNodes} nodes · ${state.snapshot!.projection.metrics.liveEdges} edges`
                : 'no active project',
            ])
          }
          const target = tail.toLowerCase().replace(/\s+/g, '_') as ProjectStatus
          if (target in PROJECT_STATUS_LABELS) {
            echo([`status → ${target}`])
            await get().changeStatus(target)
          } else {
            echo([`unknown status "${tail}"`])
          }
          return
        }
        case 'add': {
          const [kind, ...labelParts] = rest
          const label = labelParts.join(' ')
          if (!kind || !label) return echo(['usage: add <kind> <label>'])
          echo([`adding ${kind} "${label}"`])
          await get().addNode(kind, label)
          return
        }
        case 'link': {
          const [source, target, relation] = rest
          if (!source || !target) return echo(['usage: link <src> <dst> [relation]'])
          echo([`linking ${source} → ${target}`])
          await get().linkNodes(source, target, relation ?? 'feeds')
          return
        }
        case 'remove': {
          if (!rest[0]) return echo(['usage: remove <node>'])
          echo([`removing ${rest[0]}`])
          await get().tombstoneNode(rest[0])
          return
        }
        case 'tag':
          if (!tail) return echo(['usage: tag <tag>'])
          echo([`tagging ${tail}`])
          await get().addTag(tail)
          return
        case 'untag':
          if (!tail) return echo(['usage: untag <tag>'])
          echo([`untagging ${tail}`])
          await get().removeTag(tail)
          return
        default:
          echo([`unknown command "${verb}" — try: help`])
      }
    },

    setSelection: (id) => set({ selectedNodeId: id }),
    setSideTab: (tab) => set({ sideOpen: true, sideTab: tab }),
    toggleSide: () => set((current) => ({ sideOpen: !current.sideOpen })),
    setHeroVisible: (heroVisible) => set({ heroVisible }),
    setPreset: (preset) => {
      const tab: SideTab =
        preset === 'Board'
          ? 'board'
          : preset === 'History'
            ? 'activity'
            : preset === 'Operate'
              ? 'terminal'
              : 'inspect'
      set({ preset, sideOpen: true, sideTab: tab })
    },
    beginLink: (nodeId) => set({ linkSourceId: nodeId }),
    cancelLink: () => set({ linkSourceId: null }),

    invokeAction: (action) => {
      const state = get()
      const normalized = action.toLowerCase()
      const selected = state.selectedNodeId
      switch (normalized) {
        case 'inspect':
          set({ sideOpen: true, sideTab: 'inspect' })
          return
        case 'link from here':
          if (selected) set({ linkSourceId: selected })
          return
        case 'add task':
          void state.addNode('task', 'New task')
          return
        case 'remove':
          if (selected) void state.tombstoneNode(selected)
          return
        default:
          return
      }
    },

    dismissFailure: () => set((current) => ({
      failure: null,
      status: current.pending.length > 0 ? 'mutating' : current.conflict ? 'conflicted' : 'idle',
    })),
    dismissConflict: () => set((current) => ({
      conflict: null,
      status: current.pending.length > 0 ? 'mutating' : 'idle',
    })),
  }
})

/** Live nodes plus any provisional ones, for surfaces that render the graph. */
export function selectRenderableNodes(state: WorkspaceStore) {
  return state.snapshot?.nodes.filter((node) => node.tombstonedAt === null) ?? []
}

export function selectLiveEdges(state: WorkspaceStore) {
  return state.snapshot?.edges.filter((edge) => edge.tombstonedAt === null) ?? []
}
