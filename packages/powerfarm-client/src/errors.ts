/**
 * The failure vocabulary the Workbench is allowed to reason about.
 *
 * Every adapter maps its substrate's failures onto these codes, so the UI can distinguish a
 * recoverable conflict from an authorization refusal without knowing whether it is talking to an
 * in-process engine, a Durable Object, or a future runtime. Anything the adapter cannot classify
 * becomes `backend` and keeps its diagnostic detail in `cause`.
 */
export type PowerfarmErrorCode =
  /** The caller's expected version is behind. Reconcile and retry; the write did not happen. */
  | 'conflict'
  /** The substrate is unreachable. The write may or may not have happened — retry with the same
   *  mutation key, which is what makes that ambiguity safe. */
  | 'offline'
  /** The caller is not authenticated, or its session expired. */
  | 'unauthenticated'
  /** The caller is authenticated but lacks authority for this operation. Never a UI-only check. */
  | 'unauthorized'
  /** The command was malformed or violated a domain rule. Retrying unchanged will fail again. */
  | 'validation'
  /** The addressed object does not exist, or is not visible to this caller. */
  | 'not_found'
  /** The object moved on beneath the caller (a Change whose base revision advanced). */
  | 'stale'
  /** The substrate failed in a way the adapter could not classify. */
  | 'backend'

/** An error crossing the Powerfarm client boundary. */
export class PowerfarmError extends Error {
  readonly code: PowerfarmErrorCode
  /** True when retrying the identical command (same mutation key) may succeed. */
  readonly retryable: boolean
  /** Underlying error, kept for logs and the Inspector's raw view — never rendered as the headline. */
  override readonly cause: unknown

  constructor(
    code: PowerfarmErrorCode,
    message: string,
    options: { readonly cause?: unknown; readonly retryable?: boolean } = {}
  ) {
    super(message)
    this.name = 'PowerfarmError'
    this.code = code
    this.cause = options.cause
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE[code]
  }

  static is(value: unknown): value is PowerfarmError {
    return value instanceof PowerfarmError
  }
}

const DEFAULT_RETRYABLE: Readonly<Record<PowerfarmErrorCode, boolean>> = {
  backend: false,
  conflict: false,
  not_found: false,
  offline: true,
  stale: false,
  unauthenticated: false,
  unauthorized: false,
  validation: false,
}

/** Short, human sentence for a failure. Diagnostic detail stays in `cause`. */
export function describeError(error: unknown): string {
  if (PowerfarmError.is(error)) return error.message
  if (error instanceof Error) return error.message
  return 'Something failed in a way Powerfarm could not describe.'
}
