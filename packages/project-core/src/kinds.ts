/**
 * The Project Graph's node vocabulary.
 *
 * These are Workbench Project concepts, deliberately NOT a frozen Powerfarm ontology — the
 * registry is open, and `kindSpec` degrades to a neutral default for any kind it does not know,
 * so a Project may carry node kinds this build has never heard of.
 *
 * Icons live in the UI layer: this module stays runtime-neutral so the same registry can be
 * evaluated in a worker, a test, or the browser.
 */

/** Semantic colour role. The Workbench maps these onto its `signal` palette. */
export type KindTint = 'blue' | 'amber' | 'green' | 'red' | 'muted'

export interface KindSpec {
  /** One-line human description, shown in the Inspector. */
  readonly description: string
  /** Semantic colour role for this kind's default (unselected, unblocked) presentation. */
  readonly tint: KindTint
  /** Stable icon name the UI layer resolves to a concrete icon component. */
  readonly icon: string
}

const DEFAULT_SPEC: KindSpec = {
  description: 'graph node',
  icon: 'circle-dot',
  tint: 'muted',
}

const REGISTRY: Readonly<Record<string, KindSpec>> = {
  brief: { description: 'project brief', icon: 'file-text', tint: 'blue' },
  milestone: { description: 'milestone', icon: 'flag', tint: 'blue' },
  task: { description: 'task', icon: 'check-square', tint: 'muted' },
  decision: { description: 'decision record', icon: 'shield-check', tint: 'amber' },
  blocker: { description: 'active blocker', icon: 'alert-triangle', tint: 'red' },
  pending: { description: 'pending item', icon: 'clock', tint: 'amber' },
  next_action: { description: 'next action', icon: 'route', tint: 'green' },
  summary: { description: 'rolling summary', icon: 'sparkles', tint: 'blue' },
  note: { description: 'note', icon: 'sticky-note', tint: 'muted' },
  subsystem: { description: 'subgraph', icon: 'network', tint: 'blue' },
}

/** Returns the spec for `kind`, or a neutral default for an unregistered kind. */
export function kindSpec(kind: string): KindSpec {
  return REGISTRY[kind] ?? DEFAULT_SPEC
}

/** The kinds this build knows about. An unregistered kind is still valid Project data. */
export const KNOWN_KINDS: readonly string[] = Object.keys(REGISTRY)

/** `metadata.status` values that change how a node renders. */
export type NodeWorkStatus = 'planned' | 'active' | 'done' | 'blocked'

interface NodeWithMetadata {
  readonly metadata: Readonly<Record<string, unknown>>
}

/** Reads a node's work status, or null when it carries none this build recognises. */
export function nodeWorkStatus(node: NodeWithMetadata): NodeWorkStatus | null {
  const raw = node.metadata.status
  return raw === 'planned' || raw === 'active' || raw === 'done' || raw === 'blocked'
    ? raw
    : null
}
