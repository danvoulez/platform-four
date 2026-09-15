import { PowerfarmError } from '../errors'
import type {
  ActivityClient,
  AssistantClient,
  CapabilitiesClient,
  ChangesClient,
  PowerfarmClient,
  ProjectsClient,
  RunsClient,
  SoftwareClient,
} from '../client'
import type {
  WireCodeChange,
  WireConnectedAccount,
  WireOperatorRun,
  WireStreamEvent,
  WireWorkpieceSummary,
} from './wire'

export * from './mapping'
export type * from './wire'

/**
 * Everything the adapter needs from Platform Two, and nothing else.
 *
 * Platform Two speaks Cap'n Web over a WebSocket to `/api`, and its stubs are disposable
 * capabilities rather than plain data. That is exactly the kind of detail the Workbench must never
 * learn, so it is confined to an implementation of this interface: the adapter above it deals only
 * in wire shapes and promises.
 *
 * Two of Platform Two's transport rules matter to whoever implements this, and are easy to get
 * wrong from the outside:
 *
 * - **Stubs must be disposed.** A stub obtained and never released leaks on the server. Every
 *   implementation is responsible for `Symbol.dispose` on what it acquires.
 * - **Promise pipelining is intentional.** An RPC promise may be passed as an argument without
 *   being awaited; an unawaited stub promise is not a floating promise.
 */
export interface PlatformTwoTransport {
  /** Human label for the deployment, shown in the Workbench status strip. */
  readonly description: string

  listWorkpieces(workspaceId: string): Promise<readonly WireWorkpieceSummary[]>
  getCodeAtCommit(workpieceId: string, commit: string): Promise<ReadonlyMap<string, string>>

  listConnectedAccounts(): Promise<readonly WireConnectedAccount[]>
  listOperatorRuns(workspaceId: string): Promise<readonly WireOperatorRun[]>

  /** The proposed change on a chat, as Platform Two's compact `CodeChange`. */
  getProposedChange(chatId: number): Promise<WireCodeChange>

  /**
   * Seals a review at an exact durable point and merges only if nothing moved since.
   *
   * Returning `"changed"` or `"stale"` as a *value* rather than throwing is Platform Two's design
   * and it is preserved here: losing a merge race is ordinary control flow, not a fault.
   */
  mergeAtPoint(
    chatId: number,
    point: { generation: number; revision: number; nextSequence: number; transactionRevision: number }
  ): Promise<{ outcome: 'merged' | 'stale' | 'changed' }>

  streamChat(chatId: number, prompt: string): AsyncIterable<WireStreamEvent>
}

export interface PlatformTwoClientOptions {
  readonly transport: PlatformTwoTransport
  readonly workspaceId: string
}

/**
 * The connected adapter.
 *
 * **Status: not wired.** The translation layer in `mapping.ts` is complete and tested, and the
 * transport seam above states exactly what Platform Two must provide. What does not exist yet is
 * an implementation of `PlatformTwoTransport` — that needs a running Platform Two deployment,
 * authenticated sessions, and a real workspace, none of which can be stood up from the Workbench
 * repository alone.
 *
 * This class is therefore deliberately a shell: constructing it without a transport throws rather
 * than answering with plausible-looking data. A connected mode that silently served fixtures would
 * be worse than no connected mode at all, because the user could not tell which world a number on
 * screen came from.
 */
export class PlatformTwoPowerfarmClient implements PowerfarmClient {
  readonly mode = 'connected' as const
  readonly description: string

  readonly projects: ProjectsClient
  readonly assistant: AssistantClient
  readonly software: SoftwareClient
  readonly changes: ChangesClient
  readonly activity: ActivityClient
  readonly runs: RunsClient
  readonly capabilities: CapabilitiesClient

  constructor(_options: PlatformTwoClientOptions) {
    throw new PowerfarmError(
      'backend',
      'The Platform Two adapter has no transport yet. See docs/status.md — the translation layer is complete and tested; the Cap\'n Web transport is the remaining work.'
    )
  }
}
