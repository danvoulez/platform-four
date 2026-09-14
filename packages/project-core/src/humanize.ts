import type { ProjectEvent } from './contracts'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from './contracts'

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** Turns a raw engine event into a sentence a person would write. */
export function humanEventLabel(event: ProjectEvent): string {
  switch (event.operationType) {
    case 'create_project':
      return `Project created with ${Number(event.payload.operations ?? 0)} starter operations`
    case 'mutate_graph': {
      const nodes = asStringArray(event.payload.affectedNodeIds)
      const edges = asStringArray(event.payload.affectedEdgeIds)
      const parts: string[] = []
      if (nodes.length) parts.push(`${nodes.length} node${nodes.length === 1 ? '' : 's'}`)
      if (edges.length) parts.push(`${edges.length} edge${edges.length === 1 ? '' : 's'}`)
      return parts.length ? `Graph updated · ${parts.join(' and ')} touched` : 'Graph projection updated'
    }
    case 'change_project_status': {
      const from = event.payload.from as ProjectStatus | undefined
      const to = event.payload.to as ProjectStatus | undefined
      if (from && to) return `Status moved from ${PROJECT_STATUS_LABELS[from]} to ${PROJECT_STATUS_LABELS[to]}`
      return 'Status changed'
    }
    case 'update_project_tags': {
      const added = asStringArray(event.payload.add)
      const removed = asStringArray(event.payload.remove)
      const parts: string[] = []
      if (added.length) parts.push(`+${added.join(', +')}`)
      if (removed.length) parts.push(`−${removed.join(', −')}`)
      return parts.length ? `Tags updated · ${parts.join(' ')}` : 'Tags updated'
    }
    default:
      return event.operationType.replace(/_/g, ' ')
  }
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function actorLabel(actor: string): string {
  return actor === 'local-operator' ? 'you' : actor
}
