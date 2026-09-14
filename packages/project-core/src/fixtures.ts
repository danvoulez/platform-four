import { ProjectEngine, type EngineSnapshot } from './engine'
import { starterProjectOperations } from './templates'

/**
 * Seeds the workspace with two numbered projects by driving the real engine,
 * so the event log and projections are genuine, not hardcoded snapshots.
 */
export function seedWorkspace(): EngineSnapshot {
  const engine = new ProjectEngine()

  const atlas = engine.createProject({
    actor: 'workspace-seed',
    reason: 'seed fixture · product workspace',
    tags: ['product', 'core'],
    title: 'Atlas Workspace',
    initialOperations: [
      {
        kind: 'summary',
        label: 'Graph-first workspace for numbered projects',
        metadata: {},
        nodeId: 'summary',
        op: 'add_node',
      },
      {
        kind: 'brief',
        label: 'Workspace shell',
        metadata: { text: 'Canvas, rails and panels around a live project graph.' },
        nodeId: 'brief',
        op: 'add_node',
      },
      {
        kind: 'milestone',
        label: 'M1 · Canvas renders live graph',
        metadata: { status: 'done' },
        nodeId: 'm1-canvas',
        op: 'add_node',
      },
      {
        kind: 'milestone',
        label: 'M2 · Numbered instantiation',
        metadata: { status: 'done' },
        nodeId: 'm2-numbering',
        op: 'add_node',
      },
      {
        kind: 'task',
        label: 'Port typed mutation engine',
        metadata: { status: 'done' },
        nodeId: 'port-engine',
        op: 'add_node',
      },
      {
        kind: 'task',
        label: 'Wire projection board',
        metadata: { status: 'active' },
        nodeId: 'wire-board',
        op: 'add_node',
      },
      {
        kind: 'blocker',
        label: 'Backend persistence undecided',
        metadata: { detail: 'LangGraph thread store vs plain Postgres.' },
        nodeId: 'blocker-backend',
        op: 'add_node',
      },
      {
        kind: 'decision',
        label: 'Fixture-first architecture',
        metadata: { rationale: 'Engine runs client-side now, API seam stays clean.' },
        nodeId: 'decision-fixture-first',
        op: 'add_node',
      },
      {
        kind: 'next_action',
        label: 'Ship preview build',
        metadata: {},
        nodeId: 'next-action',
        op: 'add_node',
      },
      {
        edgeId: 'brief-contains-m1',
        metadata: {},
        op: 'link_nodes',
        relation: 'contains',
        sourceNodeId: 'brief',
        targetNodeId: 'm1-canvas',
      },
      {
        edgeId: 'brief-contains-m2',
        metadata: {},
        op: 'link_nodes',
        relation: 'contains',
        sourceNodeId: 'brief',
        targetNodeId: 'm2-numbering',
      },
      {
        edgeId: 'm1-feeds-engine',
        metadata: {},
        op: 'link_nodes',
        relation: 'feeds',
        sourceNodeId: 'm1-canvas',
        targetNodeId: 'port-engine',
      },
      {
        edgeId: 'engine-feeds-board',
        metadata: {},
        op: 'link_nodes',
        relation: 'feeds',
        sourceNodeId: 'port-engine',
        targetNodeId: 'wire-board',
      },
      {
        edgeId: 'blocker-blocks-board',
        metadata: {},
        op: 'link_nodes',
        relation: 'blocks',
        sourceNodeId: 'blocker-backend',
        targetNodeId: 'wire-board',
      },
      {
        edgeId: 'decision-informs-engine',
        metadata: {},
        op: 'link_nodes',
        relation: 'informs',
        sourceNodeId: 'decision-fixture-first',
        targetNodeId: 'port-engine',
      },
    ],
  })

  engine.mutateGraph(
    atlas.project.id,
    [
      {
        kind: 'task',
        label: 'Design review pass',
        metadata: { status: 'planned' },
        nodeId: 'design-review',
        op: 'add_node',
      },
      {
        edgeId: 'board-feeds-review',
        metadata: {},
        op: 'link_nodes',
        relation: 'feeds',
        sourceNodeId: 'wire-board',
        targetNodeId: 'design-review',
      },
    ],
    {
      expectedVersion: atlas.version,
      reason: 'follow-up task surfaced during wiring',
    }
  )

  engine.createProject({
    actor: 'workspace-seed',
    reason: 'seed fixture · marketing track',
    tags: ['marketing'],
    title: 'Q4 Content Engine',
    initialOperations: [
      {
        kind: 'summary',
        label: 'Always-on content pipeline for Q4',
        metadata: {},
        nodeId: 'summary',
        op: 'add_node',
      },
      {
        kind: 'brief',
        label: 'Content engine brief',
        metadata: { text: 'Cadence, channels and ownership for Q4.' },
        nodeId: 'brief',
        op: 'add_node',
      },
      {
        kind: 'task',
        label: 'Draft editorial calendar',
        metadata: { status: 'planned' },
        nodeId: 'editorial-calendar',
        op: 'add_node',
      },
      {
        kind: 'pending',
        label: 'Collect stakeholder inputs',
        metadata: {},
        nodeId: 'stakeholder-inputs',
        op: 'add_node',
      },
      {
        edgeId: 'brief-contains-calendar',
        metadata: {},
        op: 'link_nodes',
        relation: 'contains',
        sourceNodeId: 'brief',
        targetNodeId: 'editorial-calendar',
      },
    ],
  })

  return engine.toSnapshot()
}

export { starterProjectOperations }
