import { PowerfarmError, type PowerfarmErrorCode } from '../errors'
import type {
  AssistantEvent,
  ChangeState,
  ChangedFile,
  Connection,
  RepositorySummary,
  RunStatus,
  RunSummary,
} from '../client'
import type {
  WireActionState,
  WireCodeChange,
  WireConnectedAccount,
  WireOperatorRun,
  WireRunStatus,
  WireStreamEvent,
  WireWorkpieceSummary,
} from './wire'

/**
 * Translation between Platform Two's vocabulary and the Workbench's.
 *
 * Every function here is pure, which is the point: the mapping is the part of the adapter that
 * carries product meaning, and it can be tested exhaustively long before a backend exists. The
 * transport around it is comparatively boring.
 *
 * The translation is deliberately lossy in one direction and never in the other. Platform Two's
 * implementation vocabulary — Gadget, Workpiece, Overseer, Gatekeeper — stops here; what reaches
 * the Workbench is Repository, Connection, Change and Run. Nothing about a Change's *authority*
 * is decided here: the substrate owns that, and this only reports what it said.
 */

/* ------------------------------------------------------------------ software */

/**
 * A Gadget is what the Workbench calls a repository.
 *
 * A gadget still provisional inside a chat has no head commit. It is deliberately not given a
 * placeholder revision: a repository whose revision is a lie is worse than one the Workbench
 * declines to show, so callers filter these out rather than rendering them.
 */
export function toRepositorySummary(workpiece: WireWorkpieceSummary): RepositorySummary | null {
  if (!workpiece.commitId) return null
  return {
    id: String(workpiece.id),
    name: workpiece.title,
    revision: workpiece.commitId,
  }
}

export function toRepositorySummaries(
  workpieces: readonly WireWorkpieceSummary[]
): readonly RepositorySummary[] {
  return workpieces
    .map(toRepositorySummary)
    .filter((repository): repository is RepositorySummary => repository !== null)
}

/* ------------------------------------------------------------------ changes */

/**
 * Derives a Change's state from Platform Two's action state and merge status.
 *
 * `proposed` and `applied` stay far apart on purpose: the model having produced a change is not
 * the event of reality changing, and collapsing the two would be the single most damaging
 * simplification the Workbench could make.
 */
export function toChangeState(input: {
  readonly action: WireActionState
  readonly merged: boolean
  readonly stale: boolean
  readonly policyPassed?: boolean
}): ChangeState {
  if (input.merged) return 'applied'
  if (input.action === 'rejected') return 'rejected'
  if (input.stale) return 'stale'
  if (input.policyPassed === false) return 'failed'
  if (input.action === 'approved') return 'approved'
  return 'awaiting_approval'
}

/** Flattens Platform Two's `CodeChange` into the per-file rows a diff view renders. */
export function toChangedFiles(change: WireCodeChange): readonly ChangedFile[] {
  const files: ChangedFile[] = []
  for (const [gadgetId, entries] of Object.entries(change)) {
    for (const [path, fileChange] of entries) {
      files.push({
        // Counts are unknown until the diff is computed; the summary row reports files, not lines.
        additions: 0,
        deletions: 0,
        operation: 'remove' in fileChange ? 'removed' : 'set' in fileChange ? 'added' : 'modified',
        path,
        repositoryId: gadgetId,
      })
    }
  }
  // Numeric collation, because a gadget id is a decimal number carried as a string: plain
  // lexicographic order would file repository 12 before repository 3.
  return files.toSorted(
    (left, right) =>
      left.repositoryId.localeCompare(right.repositoryId, undefined, { numeric: true }) ||
      left.path.localeCompare(right.path)
  )
}

/**
 * A `set` on a path that already exists is a wholesale replacement, not a creation.
 *
 * `toChangedFiles` cannot tell the difference — a `CodeChange` carries no base — so callers that
 * know the base tree refine the operation with this.
 */
export function refineOperation(
  file: ChangedFile,
  existingPaths: ReadonlySet<string>
): ChangedFile {
  if (file.operation !== 'added') return file
  return existingPaths.has(file.path) ? { ...file, operation: 'modified' } : file
}

/* ------------------------------------------------------------------ runs */

/**
 * Collapses Platform Two's eleven run states into the five the Workbench shows.
 *
 * `ready` and `blocked` both mean the run finished its work and is waiting on a human or a policy
 * decision, so both land on `succeeded` — the run itself did not fail. What happens to the
 * proposal it produced is the Change's state, not the Run's.
 */
export function toRunStatus(status: WireRunStatus): RunStatus {
  switch (status) {
    case 'queued':
      return 'queued'
    case 'starting':
    case 'running':
    case 'cancelling':
      return 'running'
    case 'ready':
    case 'applied':
    case 'blocked':
      return 'succeeded'
    case 'cancelled':
      return 'cancelled'
    case 'rejected':
    case 'stale':
    case 'failed':
      return 'failed'
  }
}

export function toRunSummary(run: WireOperatorRun, projectId: string): RunSummary {
  const finished = toRunStatus(run.status)
  return {
    id: run.id,
    label: run.operatorName,
    projectId,
    startedAt: asIso(run.startedAt ?? run.createdAt),
    status: finished,
    ...(finished === 'succeeded' || finished === 'failed' || finished === 'cancelled'
      ? { finishedAt: asIso(run.updatedAt) }
      : {}),
  }
}

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

/* ------------------------------------------------------------------ assistant */

/**
 * Translates one Platform Two stream event, or null for events the Workbench absorbs silently.
 *
 * Returning null is a real answer, not a gap: compaction, reasoning deltas and streaming edit
 * previews are machinery the conversation should not narrate. A calm transcript is worth more
 * than a complete one.
 */
export function toAssistantEvent(event: WireStreamEvent): AssistantEvent | null {
  switch (event.type) {
    case 'textDelta':
      return { text: event.delta, type: 'text_delta' }
    case 'toolCallStarted':
      return { title: describeTool(event.toolName), toolCallId: event.toolCallId, type: 'tool_started' }
    case 'toolCallFinished':
      return { ok: true, title: '', toolCallId: event.toolCallId, type: 'tool_completed' }
    case 'setActiveFile':
      return event.file
        ? {
            path: event.file.filename,
            repositoryId: String(event.file.workpieceId),
            type: 'file_inspected',
          }
        : null
    case 'toolCallTarget':
      return {
        path: event.file.filename,
        repositoryId: String(event.file.workpieceId),
        type: 'file_inspected',
      }
    case 'compacting':
      return { label: 'summarising earlier context', type: 'status' }
    case 'error':
      return { message: event.message, type: 'error' }
    case 'done':
      return { sequence: event.sequence, text: event.text, type: 'final' }
    case 'compacted':
    case 'reasoningDelta':
    case 'toolCodeDelta':
      return null
  }
}

/** Platform Two tool names, said the way a person would say them. */
export function describeTool(toolName: string): string {
  const spoken: Readonly<Record<string, string>> = {
    editFile: 'editing a file',
    executeCode: 'running code',
    listFiles: 'listing files',
    readFile: 'reading a file',
    webFetch: 'fetching a page',
    writeFile: 'writing a file',
  }
  return spoken[toolName] ?? toolName.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

/* ------------------------------------------------------------------ connections */

/**
 * A Gatekeeper account is what the Workbench calls a Connection.
 *
 * The word Gatekeeper does not cross this line. What the user reasons about is the system they
 * connected and whether it still works.
 */
export function toConnection(account: WireConnectedAccount): Connection {
  return {
    connected: true,
    credentialsValid: account.credentialsValid,
    id: String(account.id),
    label: account.label,
    vendor: account.vendorTitle || account.vendorId,
  }
}

/* ------------------------------------------------------------------ errors */

/**
 * Classifies a Platform Two failure into the Workbench's error vocabulary.
 *
 * Platform Two reports a lost merge race as a *value* (`outcome: "stale"`) rather than an error,
 * because someone else's accept landing is ordinary control flow. That distinction is preserved
 * here: `stale` is not a crash, and the Workbench must not render it as one.
 */
export function toErrorCode(error: unknown): PowerfarmErrorCode {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const code = (error as { code?: unknown } | null)?.code

  if (typeof code === 'string') {
    if (code === 'NOT_AUTHENTICATED' || code === 'SESSION_EXPIRED') return 'unauthenticated'
    if (code === 'NOT_AUTHORIZED' || code === 'FORBIDDEN') return 'unauthorized'
    if (code === 'NOT_FOUND') return 'not_found'
  }
  if (/\bstale\b/i.test(message)) return 'stale'
  if (/not authenticated|session expired|unauthenticated/i.test(message)) return 'unauthenticated'
  if (/not authorized|forbidden|permission denied/i.test(message)) return 'unauthorized'
  if (/not found|no such/i.test(message)) return 'not_found'
  if (/version conflict|expected version/i.test(message)) return 'conflict'
  if (/disconnect|websocket|network|econnreset|timed out/i.test(message)) return 'offline'
  if (/invalid|must be|too (long|large)|schema/i.test(message)) return 'validation'
  return 'backend'
}

export function toPowerfarmError(error: unknown, context: string): PowerfarmError {
  if (PowerfarmError.is(error)) return error
  const code = toErrorCode(error)
  const detail = error instanceof Error ? error.message : String(error ?? 'unknown failure')
  return new PowerfarmError(code, `${context}: ${detail}`, { cause: error })
}
