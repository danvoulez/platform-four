/**
 * The shapes Platform Two puts on the wire, as this adapter expects to receive them.
 *
 * These are declared here rather than imported because Platform Four does not depend on Platform
 * Two's packages: the adapter is the only place that knows Platform Two exists, and keeping its
 * expectations explicit is what lets the translation be tested without a backend.
 *
 * **When Platform Two is added to the workspace, delete this file and import the real types from
 * `@gadgets/workshop-shared`.** Platform Two's own review rules forbid a hand-written mirror of an
 * RPC interface, and they are right: a structural copy that drifts is worse than a compile error.
 * The shapes below are deliberately minimal — only the fields the translation reads — so that swap
 * is mechanical and any drift surfaces as a type error at the boundary rather than as wrong data
 * in the Workbench.
 *
 * Field names and semantics follow `packages/workshop-shared/src/api.ts` in Platform Two.
 */

/** Platform Two: `WorkpieceSummary`. A Gadget — what the Workbench calls a repository. */
export interface WireWorkpieceSummary {
  id: number
  type: 'gadget'
  title: string
  /** Head commit in the workspace git store. Absent while the gadget is provisional in a chat. */
  commitId?: string
  /** Present while the gadget exists only inside a chat, i.e. is not yet permanent. */
  chatId?: number
}

/** Platform Two: `ActionState`. */
export type WireActionState = 'pending' | 'approved' | 'rejected'

/** Platform Two: `WorkspaceOperatorRunStatus`. */
export type WireRunStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'ready'
  | 'applied'
  | 'rejected'
  | 'cancelling'
  | 'cancelled'
  | 'blocked'
  | 'stale'
  | 'failed'

/** Platform Two: `WorkspaceOperatorRun`, trimmed to what the Workbench renders. */
export interface WireOperatorRun {
  id: string
  operatorName: string
  status: WireRunStatus
  createdAt: Date | string
  startedAt?: Date | string
  updatedAt: Date | string
  policyPassed?: boolean
  policyFailures?: string[]
  filesTouched?: number
}

/** Platform Two: `FileChange` — exactly one variant applies. */
export type WireFileChange = { edit: unknown } | { set: string } | { remove: true }

/** Platform Two: `CodeChange` — gadget id -> [path, change] entries. */
export type WireCodeChange = Record<string, [path: string, change: WireFileChange][]>

/** Platform Two: `ChatMergePoint`. The exact durable point a review is sealed against. */
export interface WireMergePoint {
  generation: number
  revision: number
  nextSequence: number
  transactionRevision: number
}

/** Platform Two: `AiChatStreamEvent`, trimmed to the variants the Workbench renders. */
export type WireStreamEvent =
  | { type: 'compacting' }
  | { type: 'compacted'; nothingToCompact?: boolean }
  | { type: 'textDelta'; delta: string }
  | { type: 'reasoningDelta'; delta: string }
  | { type: 'toolCallStarted'; toolCallId: string; toolName: string }
  | { type: 'toolCodeDelta'; toolCallId: string; delta: string }
  | { type: 'toolCallFinished'; toolCallId: string }
  | { type: 'setActiveFile'; file: { workpieceId: number; filename: string } | null }
  | { type: 'toolCallTarget'; toolCallId: string; file: { workpieceId: number; filename: string } }
  | { type: 'error'; message: string }
  | { type: 'done'; sequence: number; text: string }

/** Platform Two: `AccountDescription` + `VendorDescription`, as the Workbench needs them. */
export interface WireConnectedAccount {
  id: number
  vendorId: string
  vendorTitle: string
  label: string
  credentialsValid: boolean
}
