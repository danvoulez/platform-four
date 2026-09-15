import {
  PROJECT_STATUS_LABELS,
  type JsonValue,
  type ProjectStatus,
  type ProjectedColumn,
} from '@powerfarm/project-core'
import { useWorkspaceStore } from '@/state/workspace'
import { cn } from '@/lib/utils'

function formatValue(column: ProjectedColumn): string {
  const value = column.value
  if (value === null || value === undefined) return '—'
  if (column.valueType === 'status')
    return PROJECT_STATUS_LABELS[value as ProjectStatus] ?? String(value)
  if (column.valueType === 'date') {
    const parsed = new Date(String(value))
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString()
  }
  if (column.valueType === 'list')
    return Array.isArray(value) ? (value.length ? value.join(' · ') : '—') : String(value)
  return String(value as JsonValue)
}

function ColumnCard({ column }: { column: ProjectedColumn }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        column.emphasis === 'strong'
          ? 'border-signal-blue/20 bg-signal-blue/[0.06]'
          : 'border-white/[0.07] bg-night-bg/60'
      )}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-night-faint">
        {column.label}
      </div>
      <div
        className={cn(
          'mt-1 break-words font-mono text-[11px] leading-4',
          column.emphasis === 'muted' ? 'text-night-faint' : 'text-night-text'
        )}
      >
        {formatValue(column)}
      </div>
    </div>
  )
}

/**
 * The Board is a projection of the Project Graph, never a second store of task state.
 * Everything here is derived at read time from authoritative Project state.
 */
export function BoardView() {
  const projection = useWorkspaceStore((state) => state.snapshot?.projection ?? null)
  if (!projection) {
    return <div className="p-4 font-mono text-[10px] text-night-faint">no active projection</div>
  }
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 rounded-xl border border-signal-blue/20 bg-signal-blue/[0.07] p-3">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-night-faint">
          #{projection.projectNumber} · projection v{projection.projectionVersion} from source v
          {projection.sourceProjectVersion}
        </div>
        <div className="text-[12.5px] font-semibold leading-5 text-night-text">
          {projection.title}
        </div>
        {projection.summary ? (
          <div className="mt-1 text-[11px] leading-4 text-night-muted">{projection.summary}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {projection.columns.map((column) => (
          <ColumnCard key={column.key} column={column} />
        ))}
      </div>

      {projection.nextAction ? (
        <div className="mt-3 rounded-xl border border-signal-green/20 bg-signal-green/[0.06] p-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-signal-green">
            next action
          </div>
          <div className="mt-1 text-[12px] text-night-text">{projection.nextAction}</div>
        </div>
      ) : null}

      {projection.pendingItems.length ? (
        <div className="mt-3 rounded-xl border border-white/[0.07] bg-night-bg/60 p-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-night-faint">
            pending
          </div>
          {projection.pendingItems.map((item) => (
            <div key={item} className="py-0.5 font-mono text-[11px] text-night-muted">
              · {item}
            </div>
          ))}
        </div>
      ) : null}

      {projection.blockers.length ? (
        <div className="mt-3 rounded-xl border border-signal-red/20 bg-signal-red/[0.05] p-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-signal-red">
            blockers
          </div>
          {projection.blockers.map((item) => (
            <div key={item} className="py-0.5 font-mono text-[11px] text-night-text">
              · {item}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-dashed border-white/[0.1] p-2.5 font-mono text-[10px] leading-4 text-night-faint">
        Columns are declarative: each is a selector over the live graph (project field, node
        metadata, latest value, node count). Kinds summary, next_action, blocker and pending surface
        here automatically.
      </div>
    </div>
  )
}
