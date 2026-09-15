import { useEffect, useState, type ChangeEvent } from 'react'
import { AlertTriangleIcon, PlusIcon, RouteIcon, Trash2Icon } from 'lucide-react'
import {
  ALLOWED_STATUS_TRANSITIONS,
  PROJECT_STATUS_LABELS,
  kindSpec,
  nodeWorkStatus,
} from '@powerfarm/project-core'
import { kindIcon } from '@/domain/icons'
import { useWorkspaceStore } from '@/state/workspace'
import { cn } from '@/lib/utils'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-night-bg/60 p-2.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-night-faint">{label}</div>
      <div className="mt-1 truncate font-mono text-[11px] text-night-text">{value}</div>
    </div>
  )
}

function ProjectDetail() {
  const summary = useWorkspaceStore((state) => state.snapshot?.summary ?? null)
  const projection = useWorkspaceStore((state) => state.snapshot?.projection ?? null)
  const changeStatus = useWorkspaceStore((state) => state.changeStatus)
  const busy = useWorkspaceStore((state) => state.pending.length > 0)

  if (!summary || !projection) {
    return (
      <div className="p-4 font-mono text-[10px] text-night-faint">
        no active project · create one from the hero
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-night-faint">
        Project #{summary.number}
      </div>
      <h3 className="mt-2 text-[14px] font-semibold leading-5 text-night-text">{summary.title}</h3>
      {projection.summary ? (
        <p className="mt-2 text-[12px] leading-5 text-night-muted">{projection.summary}</p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Status" value={PROJECT_STATUS_LABELS[summary.status]} />
        <Metric label="Version" value={`v${summary.version}`} />
        <Metric label="Live nodes" value={String(projection.metrics.liveNodes)} />
        <Metric label="Live edges" value={String(projection.metrics.liveEdges)} />
      </div>

      {projection.nextAction ? (
        <div className="mt-3 rounded-xl border border-signal-green/20 bg-signal-green/[0.06] p-3">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-signal-green">
            <RouteIcon className="h-3 w-3" /> next action
          </div>
          <div className="mt-1 text-[12px] leading-4 text-night-text">{projection.nextAction}</div>
        </div>
      ) : null}

      {projection.blockers.length ? (
        <div className="mt-3 rounded-xl border border-signal-red/20 bg-signal-red/[0.05] p-3">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-signal-red">
            <AlertTriangleIcon className="h-3 w-3" /> blockers
          </div>
          {projection.blockers.map((blocker) => (
            <div key={blocker} className="mt-1 text-[12px] leading-4 text-night-text">
              {blocker}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-night-faint">
          move status
        </div>
        <div className="flex flex-wrap gap-1">
          {ALLOWED_STATUS_TRANSITIONS[summary.status].map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy}
              onClick={() => void changeStatus(status)}
              className="rounded-md border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-night-muted transition-colors hover:border-white/[0.18] hover:text-night-text disabled:opacity-50"
            >
              {PROJECT_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 font-mono text-[10px] leading-4 text-night-faint">
        Provenance: v{summary.version}, owned by {summary.ownerId}, created{' '}
        {new Date(summary.createdAt).toLocaleDateString()}.
      </div>
    </div>
  )
}

const WORK_STATUSES = ['planned', 'active', 'done', 'blocked'] as const

function NodeDetail({ nodeId }: { nodeId: string }) {
  const snapshot = useWorkspaceStore((state) => state.snapshot)
  const updateNode = useWorkspaceStore((state) => state.updateNode)
  const tombstoneNode = useWorkspaceStore((state) => state.tombstoneNode)
  const setSelection = useWorkspaceStore((state) => state.setSelection)
  const busy = useWorkspaceStore((state) => state.pending.length > 0)

  const node = snapshot?.nodes.find(
    (candidate) => candidate.id === nodeId && candidate.tombstonedAt === null
  )
  const [label, setLabel] = useState(node?.label ?? '')
  const [metaKey, setMetaKey] = useState('')
  const [metaValue, setMetaValue] = useState('')

  useEffect(() => {
    setLabel(node?.label ?? '')
  }, [node?.id, node?.label])

  if (!node || !snapshot) return <ProjectDetail />

  const spec = kindSpec(node.kind)
  const Icon = kindIcon(node.kind)
  const work = nodeWorkStatus(node)
  const liveEdges = snapshot.edges.filter((edge) => edge.tombstonedAt === null)
  const inbound = liveEdges.filter((edge) => edge.targetNodeId === node.id)
  const outbound = liveEdges.filter((edge) => edge.sourceNodeId === node.id)

  const saveLabel = () => {
    if (label.trim() && label.trim() !== node.label) void updateNode(node.id, { label: label.trim() })
  }
  const addMetadata = () => {
    const key = metaKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    if (!key) return
    void updateNode(node.id, { metadata: { [key]: metaValue } })
    setMetaKey('')
    setMetaValue('')
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-night-bg/60">
          <Icon className="h-3.5 w-3.5 text-signal-blue" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-night-faint">
            {node.kind} · {spec.description}
          </div>
          <div className="truncate font-mono text-[10px] text-night-faint">{node.id}</div>
        </div>
      </div>

      <input
        value={label}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setLabel(event.target.value)}
        onBlur={saveLabel}
        onKeyDown={(event) => {
          if (event.key === 'Enter') saveLabel()
        }}
        aria-label="Node label"
        className="mt-3 w-full rounded-xl border border-white/[0.08] bg-night-bg/60 px-3 py-2 text-[13px] font-medium text-night-text outline-none focus:border-white/[0.18]"
      />

      <div className="mt-3">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-night-faint">
          work status
        </div>
        <div className="flex flex-wrap gap-1">
          {WORK_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => void updateNode(node.id, { metadata: { status } })}
              className={cn(
                'rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
                work === status
                  ? 'border-signal-blue/45 bg-signal-blue/15 text-signal-blue'
                  : 'border-white/[0.08] text-night-faint hover:text-night-text'
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-night-faint">
          metadata
        </div>
        <div className="overflow-hidden rounded-xl border border-white/[0.07]">
          {Object.entries(node.metadata).length === 0 ? (
            <div className="bg-night-bg/60 px-2.5 py-2 font-mono text-[10px] text-night-faint">
              no metadata fields
            </div>
          ) : null}
          {Object.entries(node.metadata).map(([key, value]) => (
            <div
              key={key}
              className="flex items-start justify-between gap-2 border-t border-white/[0.06] bg-night-bg/60 px-2.5 py-1.5 first:border-t-0"
            >
              <span className="font-mono text-[10px] text-night-faint">{key}</span>
              <span className="break-all text-right font-mono text-[10px] text-night-text">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          <input
            value={metaKey}
            onChange={(event) => setMetaKey(event.target.value)}
            placeholder="field"
            aria-label="Metadata field"
            className="h-7 w-20 rounded-lg border border-white/[0.07] bg-night-bg/70 px-2 font-mono text-[10px] text-night-text outline-none placeholder:text-night-faint focus:border-white/[0.16]"
          />
          <input
            value={metaValue}
            onChange={(event) => setMetaValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addMetadata()
            }}
            placeholder="value"
            aria-label="Metadata value"
            className="h-7 min-w-0 flex-1 rounded-lg border border-white/[0.07] bg-night-bg/70 px-2 font-mono text-[10px] text-night-text outline-none placeholder:text-night-faint focus:border-white/[0.16]"
          />
          <button
            type="button"
            onClick={addMetadata}
            aria-label="Add metadata"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.07] text-night-faint hover:text-night-text"
          >
            <PlusIcon className="h-3 w-3" />
          </button>
        </div>
      </div>

      {inbound.length + outbound.length > 0 ? (
        <div className="mt-4">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-night-faint">
            relationships
          </div>
          <div className="space-y-1">
            {inbound.map((edge) => (
              <button
                key={edge.id}
                type="button"
                onClick={() => setSelection(edge.sourceNodeId)}
                className="flex w-full items-center justify-between rounded-lg border border-white/[0.07] bg-night-bg/60 px-2.5 py-1.5 text-left font-mono text-[10px] text-night-muted hover:text-night-text"
              >
                <span className="truncate">← {edge.sourceNodeId}</span>
                <span className="ml-2 shrink-0 text-night-faint">{edge.relation}</span>
              </button>
            ))}
            {outbound.map((edge) => (
              <button
                key={edge.id}
                type="button"
                onClick={() => setSelection(edge.targetNodeId)}
                className="flex w-full items-center justify-between rounded-lg border border-white/[0.07] bg-night-bg/60 px-2.5 py-1.5 text-left font-mono text-[10px] text-night-muted hover:text-night-text"
              >
                <span className="truncate">→ {edge.targetNodeId}</span>
                <span className="ml-2 shrink-0 text-night-faint">{edge.relation}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 font-mono text-[10px] leading-4 text-night-faint">
        Provenance: created {new Date(node.createdAt).toLocaleString()}, last changed{' '}
        {new Date(node.updatedAt).toLocaleString()}.
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void tombstoneNode(node.id)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-signal-red/20 bg-signal-red/[0.05] py-2 font-mono text-[10px] text-signal-red transition-colors hover:bg-signal-red/10 disabled:opacity-50"
      >
        <Trash2Icon className="h-3 w-3" /> remove node
      </button>
    </div>
  )
}

/**
 * One Inspector, adapting to whatever is selected, rather than a route per object type.
 * Today it inspects a Project and a Project node; Changes, Runs and files land here too.
 */
export function InspectorView() {
  const selectedNodeId = useWorkspaceStore((state) => state.selectedNodeId)
  return selectedNodeId ? <NodeDetail nodeId={selectedNodeId} /> : <ProjectDetail />
}
