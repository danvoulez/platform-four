import type {
  GraphOperation,
  ProjectEdge,
  ProjectEvent,
  ProjectNode,
  ProjectProjection,
  ProjectStatus,
  ProjectSummary,
} from '@powerfarm/project-core'

/* ------------------------------------------------------------------ identity */

export type ProjectId = string
export type ConversationId = string
export type ChangeId = string
export type RepositoryId = string
export type RunId = string

/** Removes a subscription. Always safe to call twice. */
export type Unsubscribe = () => void

/**
 * Which substrate the Workbench is talking to.
 *
 * The UI surfaces this, because the difference is not cosmetic: in `local` mode nothing is
 * durable beyond this browser and the data is fixture data, and the user must never have to guess
 * which of those two worlds a number on screen came from.
 */
export type PowerfarmMode = 'local' | 'connected'

/* ------------------------------------------------------------------ commands */

/**
 * One intent the Workbench sends across the boundary.
 *
 * Every command carries the two fields that make a distributed write safe, and they are required
 * rather than optional so a caller cannot quietly drop them:
 *
 * - `expectedVersion` is the compare-and-swap point: the version the caller last saw. The
 *   substrate rejects the command if the Project has moved on.
 * - `mutationKey` identifies the *logical* mutation. Re-sending a command with the same key after
 *   an ambiguous failure must not duplicate the effect.
 */
export interface ProjectCommandBase {
  readonly projectId: ProjectId
  readonly expectedVersion: number
  readonly mutationKey: string
  /** Why this happened, in a person's words. Becomes part of the durable event. */
  readonly reason: string
  /** Who asked. Defaults to the signed-in operator when omitted. */
  readonly actor?: string
}

export type ProjectCommand =
  | (ProjectCommandBase & { readonly kind: 'mutate_graph'; readonly operations: readonly GraphOperation[] })
  | (ProjectCommandBase & { readonly kind: 'change_status'; readonly status: ProjectStatus })
  | (ProjectCommandBase & {
      readonly kind: 'update_tags'
      readonly add?: readonly string[]
      readonly remove?: readonly string[]
    })

/** Everything the Workbench knows about one Project at one version. */
export interface ProjectSnapshot {
  readonly summary: ProjectSummary
  readonly nodes: readonly ProjectNode[]
  readonly edges: readonly ProjectEdge[]
  readonly events: readonly ProjectEvent[]
  readonly projection: ProjectProjection
}

/** The authoritative outcome of an accepted command. */
export interface ProjectMutationResult {
  readonly snapshot: ProjectSnapshot
  /** The event the substrate recorded. */
  readonly event: ProjectEvent
  /** Node ids the command touched, for selection and focus. */
  readonly affectedNodeIds: readonly string[]
  readonly affectedEdgeIds: readonly string[]
  /** Short machine summary of what was applied, e.g. `2× add_node`. */
  readonly operationSummary: string
  /**
   * True when the substrate recognised this mutation key and returned the original outcome
   * instead of applying the command again. The UI treats this as success, not as an error.
   */
  readonly replayed: boolean
}

/* ------------------------------------------------------------------ projects */

/**
 * Receives authoritative Project state.
 *
 * The shape follows Platform Two's subscriber convention — a catch-up burst, then a `ready()`
 * boundary, then live deltas — so a reconnecting client can tell "I have the current state" from
 * "I am still catching up" without guessing from timing.
 */
export interface ProjectSubscriber {
  /** Full authoritative state. Sent on subscribe and after any reconnect. */
  snapshot(snapshot: ProjectSnapshot): void
  /** One durable event, after `ready()`. */
  event(event: ProjectEvent, snapshot: ProjectSnapshot): void
  /** Catch-up is complete; everything after this is live. */
  ready(): void
  /** The subscription dropped and is being retried. */
  interrupted(reason: string): void
}

export interface ProjectsClient {
  list(): Promise<readonly ProjectSummary[]>
  get(id: ProjectId): Promise<ProjectSnapshot>
  create(input: {
    readonly title: string
    readonly reason: string
    readonly tags?: readonly string[]
    readonly mutationKey: string
  }): Promise<ProjectMutationResult>
  mutate(command: ProjectCommand): Promise<ProjectMutationResult>
  subscribe(id: ProjectId, subscriber: ProjectSubscriber): Unsubscribe
}

/* ------------------------------------------------------------------ assistant */

/**
 * One semantic step of assistant work.
 *
 * Deliberately not a string: the Workbench renders progress, tool activity and proposals as
 * distinct surfaces, and flattening them to Markdown would throw that away. Not every event
 * earns a card — most are absorbed into a single calm progress line.
 */
export type AssistantEvent =
  | { readonly type: 'text_delta'; readonly text: string }
  | { readonly type: 'status'; readonly label: string }
  | { readonly type: 'tool_started'; readonly toolCallId: string; readonly title: string }
  | {
      readonly type: 'tool_completed'
      readonly toolCallId: string
      readonly title: string
      readonly ok: boolean
      readonly detail?: string
    }
  | { readonly type: 'file_inspected'; readonly path: string; readonly repositoryId?: RepositoryId }
  | { readonly type: 'change_proposed'; readonly changeId: ChangeId }
  | { readonly type: 'change_updated'; readonly changeId: ChangeId }
  | { readonly type: 'approval_requested'; readonly changeId: ChangeId; readonly summary: string }
  | { readonly type: 'run_started'; readonly runId: RunId }
  | { readonly type: 'run_status'; readonly runId: RunId; readonly status: string }
  | { readonly type: 'error'; readonly message: string }
  /**
   * Terminal event of one turn. `sequence` is the durable position the substrate assigned, which
   * is what lets a reconnecting client replace provisional stream content with the persisted
   * record rather than appending it twice.
   */
  | { readonly type: 'final'; readonly text: string; readonly sequence: number }

export interface Conversation {
  readonly id: ConversationId
  readonly projectId: ProjectId
  readonly title: string
  readonly createdAt: string
}

export interface AssistantInput {
  readonly text: string
  /** The node the user had selected, so the assistant starts where they are looking. */
  readonly selectedNodeId?: string
  /** Makes an interrupted send safe to retry. */
  readonly idempotencyKey: string
}

export interface AssistantClient {
  listConversations(projectId: ProjectId): Promise<readonly Conversation[]>
  createConversation(projectId: ProjectId, title?: string): Promise<Conversation>
  send(conversationId: ConversationId, input: AssistantInput): AsyncIterable<AssistantEvent>
}

/* ------------------------------------------------------------------ software */

export interface RepositorySummary {
  readonly id: RepositoryId
  readonly name: string
  /** The revision the Workbench is reading, e.g. a commit id. */
  readonly revision: string
  readonly defaultBranch?: string
}

export interface SoftwareTreeEntry {
  readonly path: string
  readonly type: 'file' | 'directory'
  readonly sizeBytes?: number
}

export interface SoftwareTree {
  readonly repositoryId: RepositoryId
  readonly revision: string
  readonly entries: readonly SoftwareTreeEntry[]
}

export interface FileRef {
  readonly repositoryId: RepositoryId
  readonly path: string
  readonly revision?: string
}

export interface FileContents {
  readonly ref: FileRef
  readonly revision: string
  readonly text: string
  /** True when the file was not returned as text (binary, or over the read limit). */
  readonly truncated: boolean
}

export interface SoftwareClient {
  listRepositories(projectId: ProjectId): Promise<readonly RepositorySummary[]>
  listTree(repositoryId: RepositoryId, revision?: string): Promise<SoftwareTree>
  readFile(ref: FileRef): Promise<FileContents>
}

/* ------------------------------------------------------------------ changes */

/**
 * A Change's lifecycle.
 *
 * `proposed` and `applied` are deliberately far apart: a model having edited something is not the
 * same event as reality having changed, and the Workbench never collapses the two.
 */
export type ChangeState =
  | 'proposed'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'stale'
  | 'failed'

export interface ChangedFile {
  readonly repositoryId: RepositoryId
  readonly path: string
  readonly operation: 'added' | 'modified' | 'removed'
  readonly additions: number
  readonly deletions: number
}

export interface ChangeSummary {
  readonly id: ChangeId
  readonly projectId: ProjectId
  readonly title: string
  readonly state: ChangeState
  /** What proposed it — an agent run, or a person. */
  readonly proposedBy: { readonly kind: 'agent' | 'human'; readonly label: string }
  readonly createdAt: string
  readonly updatedAt: string
  readonly fileCount: number
  /** True when the Change cannot be applied without being rebased on the current revision. */
  readonly stale: boolean
  /** True when applying requires an explicit human decision. */
  readonly requiresApproval: boolean
}

export interface ChangeDetail extends ChangeSummary {
  /** Why the change exists, in the proposer's words. */
  readonly reason: string
  readonly files: readonly ChangedFile[]
  /** The revision per repository the change was computed against. */
  readonly baseRevisions: Readonly<Record<RepositoryId, string>>
  /** Policy outcome, when the substrate evaluated one. */
  readonly policy?: {
    readonly passed: boolean
    readonly failures: readonly string[]
  }
  readonly conversationId?: ConversationId
}

export interface FileDiff {
  readonly path: string
  readonly repositoryId: RepositoryId
  readonly before: string | null
  readonly after: string | null
}

export interface ApplyResult {
  readonly outcome: 'applied' | 'stale' | 'rejected_by_policy'
  /** Resulting revision per repository, when the apply landed. */
  readonly revisions?: Readonly<Record<RepositoryId, string>>
  readonly failures?: readonly string[]
}

export interface ChangesClient {
  list(projectId: ProjectId): Promise<readonly ChangeSummary[]>
  get(changeId: ChangeId): Promise<ChangeDetail>
  diff(changeId: ChangeId, path?: string): Promise<readonly FileDiff[]>
  /**
   * Express a decision. The substrate — never the client — performs the state transition and
   * validates authority, so these return the authoritative resulting state.
   */
  approve(changeId: ChangeId, idempotencyKey: string): Promise<ChangeDetail>
  reject(changeId: ChangeId, reason: string, idempotencyKey: string): Promise<ChangeDetail>
  apply(changeId: ChangeId, idempotencyKey: string): Promise<ApplyResult>
  subscribe(projectId: ProjectId, onChange: (summary: ChangeSummary) => void): Unsubscribe
}

/* ------------------------------------------------------------------ activity */

/**
 * One thing that happened, in the terms a person would use.
 *
 * Activity is not a transport log: adapters synthesise these from whatever their substrate emits,
 * and raw detail stays behind `detail` for the Inspector rather than in the timeline.
 */
export interface ActivityEntry {
  readonly id: string
  readonly at: string
  readonly kind:
    | 'project_changed'
    | 'decision_recorded'
    | 'investigation_started'
    | 'investigation_completed'
    | 'change_proposed'
    | 'change_approved'
    | 'change_rejected'
    | 'change_applied'
    | 'run_started'
    | 'run_completed'
    | 'run_failed'
    | 'capability_used'
    | 'revision_advanced'
    | 'system'
  /** One sentence, already human-readable. */
  readonly message: string
  readonly actor?: string
  /** What this entry is about, so selecting it can move the Workbench there. */
  readonly subject?:
    | { readonly type: 'project'; readonly id: ProjectId }
    | { readonly type: 'node'; readonly id: string }
    | { readonly type: 'change'; readonly id: ChangeId }
    | { readonly type: 'run'; readonly id: RunId }
  /** Machine detail, shown only on request. */
  readonly detail?: Readonly<Record<string, unknown>>
}

export interface ActivityClient {
  list(projectId: ProjectId, limit?: number): Promise<readonly ActivityEntry[]>
  subscribe(projectId: ProjectId, onEntry: (entry: ActivityEntry) => void): Unsubscribe
}

/* ------------------------------------------------------------------ runs */

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface RunSummary {
  readonly id: RunId
  readonly projectId: ProjectId
  readonly label: string
  readonly status: RunStatus
  readonly startedAt: string
  readonly finishedAt?: string
}

export interface RunsClient {
  list(projectId: ProjectId): Promise<readonly RunSummary[]>
  get(runId: RunId): Promise<RunSummary>
  subscribe(projectId: ProjectId, onRun: (run: RunSummary) => void): Unsubscribe
}

/* ------------------------------------------------------------------ capabilities */

/**
 * A connected external system, in the user's vocabulary.
 *
 * Platform Two calls the mediating component a Gatekeeper; that is an implementation concept and
 * does not surface here. What the user reasons about is a Connection and the narrow list of things
 * it is permitted to do.
 */
export interface Connection {
  readonly id: string
  readonly vendor: string
  readonly label: string
  readonly connected: boolean
  /** False when the stored credentials are known to be expired. */
  readonly credentialsValid: boolean
}

export interface Capability {
  readonly id: string
  readonly connectionId: string
  /** e.g. `read repository`, `create branch`. */
  readonly label: string
  /**
   * Whether the assistant may currently exercise this without a human decision. Knowing how to
   * call something is never the same as being permitted to.
   */
  readonly autoApproved: boolean
}

export interface CapabilitiesClient {
  listConnections(): Promise<readonly Connection[]>
  listCapabilities(projectId: ProjectId): Promise<readonly Capability[]>
}

/* ------------------------------------------------------------------ root */

/**
 * The single seam between the Workbench and Powerfarm.
 *
 * UI components never reach past this: they do not know whether state lives in a Durable Object,
 * an in-process engine, or anything else, and they never learn the words Overseer, Gadget,
 * Gatekeeper or Workpiece. Everything below is an adapter's business.
 */
export interface PowerfarmClient {
  readonly mode: PowerfarmMode
  /** Human label for the substrate, shown in the status strip, e.g. `local fixtures`. */
  readonly description: string
  readonly projects: ProjectsClient
  readonly assistant: AssistantClient
  readonly software: SoftwareClient
  readonly changes: ChangesClient
  readonly activity: ActivityClient
  readonly runs: RunsClient
  readonly capabilities: CapabilitiesClient
}
