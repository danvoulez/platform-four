import type { GraphOperation } from './contracts'

/** Starter graph every new project is born with. */
export function starterProjectOperations(title: string): GraphOperation[] {
  return [
    {
      kind: 'brief',
      label: `${title} — brief`,
      metadata: { text: `Scope, goals and constraints for ${title}.` },
      nodeId: 'brief',
      op: 'add_node',
    },
    {
      kind: 'milestone',
      label: 'First milestone',
      metadata: { status: 'planned' },
      nodeId: 'milestone-1',
      op: 'add_node',
    },
    {
      kind: 'next_action',
      label: 'Define scope and first deliverable',
      metadata: {},
      nodeId: 'next-action',
      op: 'add_node',
    },
    {
      edgeId: 'brief-contains-milestone-1',
      metadata: {},
      op: 'link_nodes',
      relation: 'contains',
      sourceNodeId: 'brief',
      targetNodeId: 'milestone-1',
    },
  ]
}

/** Slugify a label into a semantic node id, unique within the taken set. */
export function semanticNodeId(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'node'
  if (!taken.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

export function edgeIdFor(source: string, target: string, relation: string): string {
  return `${source}--${relation}--${target}`.slice(0, 120)
}
