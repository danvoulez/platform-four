import type {
  JsonValue,
  ProjectEdge,
  ProjectNode,
  ProjectProjection,
  ProjectSummary,
  ProjectedColumn,
  ProjectionColumnDefinition,
  ProjectionSelector,
} from './contracts'

interface ProjectionInput {
  readonly columns: readonly ProjectionColumnDefinition[]
  readonly edges: readonly ProjectEdge[]
  readonly nodes: readonly ProjectNode[]
  readonly project: ProjectSummary
}

function latestNode(
  nodes: readonly ProjectNode[],
  kind: string
): ProjectNode | undefined {
  return nodes
    .filter((node) => node.kind === kind)
    .toSorted(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.id.localeCompare(right.id)
    )[0]
}

function projectFieldValue(
  project: ProjectSummary,
  field: Extract<ProjectionSelector, { selector: 'project_field' }>['field']
): JsonValue {
  switch (field) {
    case 'number':
      return project.number
    case 'status':
      return project.status
    case 'tags':
      return project.tags
    case 'title':
      return project.title
    case 'updatedAt':
      return project.updatedAt
  }
}

function selectorValue(input: {
  readonly edges: readonly ProjectEdge[]
  readonly nodes: readonly ProjectNode[]
  readonly project: ProjectSummary
  readonly selector: ProjectionSelector
}): JsonValue | null {
  const { edges, nodes, project, selector } = input
  switch (selector.selector) {
    case 'project_field':
      return projectFieldValue(project, selector.field)
    case 'node_metadata': {
      const node = selector.nodeId
        ? nodes.find((candidate) => candidate.id === selector.nodeId)
        : selector.kind
          ? latestNode(nodes, selector.kind)
          : undefined
      return node?.metadata[selector.key] ?? null
    }
    case 'latest_node_value':
      return latestNode(nodes, selector.kind)?.metadata[selector.key] ?? null
    case 'node_count': {
      const count =
        selector.entity === 'node'
          ? nodes.filter((node) => !selector.kind || node.kind === selector.kind).length
          : edges.filter(
              (edge) => !selector.relation || edge.relation === selector.relation
            ).length
      return Math.min(count, selector.limit)
    }
    default: {
      const exhaustiveSelector: never = selector
      return exhaustiveSelector
    }
  }
}

function latestLabels(nodes: readonly ProjectNode[], kind: string): string[] {
  return nodes
    .filter((node) => node.kind === kind)
    .toSorted(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.id.localeCompare(right.id)
    )
    .map((node) => node.label)
}

function latestLabel(nodes: readonly ProjectNode[], kind: string): string | null {
  return latestLabels(nodes, kind)[0] ?? null
}

export function projectSnapshot({
  columns,
  edges,
  nodes,
  project,
}: ProjectionInput): ProjectProjection {
  const liveNodes = nodes.filter((node) => node.tombstonedAt === null)
  const liveEdges = edges.filter((edge) => edge.tombstonedAt === null)
  const projectedColumns: ProjectedColumn[] = columns
    .map((column) => ({
      emphasis: column.emphasis,
      key: column.key,
      label: column.label,
      position: column.position,
      value: selectorValue({
        edges: liveEdges,
        nodes: liveNodes,
        project,
        selector: column.selector,
      }),
      valueType: column.valueType,
    }))
    .toSorted(
      (left, right) => left.position - right.position || left.key.localeCompare(right.key)
    )

  return {
    blockers: latestLabels(liveNodes, 'blocker'),
    columns: projectedColumns,
    generatedAt: project.updatedAt,
    metrics: {
      liveEdges: liveEdges.length,
      liveMetadataFields: liveNodes.reduce(
        (count, node) => count + Object.keys(node.metadata).length,
        0
      ),
      liveNodes: liveNodes.length,
    },
    nextAction: latestLabel(liveNodes, 'next_action'),
    pendingItems: latestLabels(liveNodes, 'pending'),
    projectId: project.id,
    projectNumber: project.number,
    projectionVersion: project.projectionSchema.version,
    sourceProjectVersion: project.version,
    status: project.status,
    summary: latestLabel(liveNodes, 'summary'),
    tags: project.tags,
    title: project.title,
  }
}
