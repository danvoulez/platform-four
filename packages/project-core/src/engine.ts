import {
  ALLOWED_STATUS_TRANSITIONS,
  MAX_PROJECT_TAGS,
  graphOperationBatchSchema,
  type GraphOperation,
  type ProjectEdge,
  type ProjectEvent,
  type ProjectNode,
  type ProjectProjection,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectionSchema,
} from './contracts'
import { projectSnapshot } from './projection'

export type EngineErrorCode =
  | 'project_not_found'
  | 'version_conflict'
  | 'invalid_graph_operation'
  | 'invalid_status_transition'
  | 'project_archived'
  | 'duplicate_mutation'

export class EngineError extends Error {
  readonly code: EngineErrorCode
  constructor(code: EngineErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'EngineError'
  }
}

export interface ProjectRecord {
  readonly summary: ProjectSummary
  readonly nodes: ProjectNode[]
  readonly edges: ProjectEdge[]
  readonly events: ProjectEvent[]
}

export interface EngineSnapshot {
  readonly nextNumber: number
  readonly projects: ProjectRecord[]
}

export interface CommandContext {
  readonly actor?: string
  readonly mutationKey?: string
}

export interface MutatingCommand extends CommandContext {
  readonly expectedVersion: number
  readonly reason: string
}

export interface MutationResult {
  readonly affectedEdgeIds: readonly string[]
  readonly affectedNodeIds: readonly string[]
  readonly event: ProjectEvent
  readonly operationSummary: string
  readonly project: ProjectSummary
  readonly projection: ProjectProjection
  readonly version: number
}

const OWNER_ID = 'local-operator'
const SESSION_ID = 'workspace-local'

function createId(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

export const DEFAULT_PROJECTION_SCHEMA: ProjectionSchema = {
  version: 1,
  columns: [
    {
      emphasis: 'strong',
      key: 'status',
      label: 'Status',
      position: 0,
      selector: { field: 'status', selector: 'project_field' },
      valueType: 'status',
    },
    {
      emphasis: 'normal',
      key: 'tags',
      label: 'Tags',
      position: 10,
      selector: { field: 'tags', selector: 'project_field' },
      valueType: 'list',
    },
    {
      emphasis: 'normal',
      key: 'tasks',
      label: 'Open tasks',
      position: 20,
      selector: { entity: 'node', kind: 'task', limit: 10_000, selector: 'node_count' },
      valueType: 'number',
    },
    {
      emphasis: 'muted',
      key: 'updated',
      label: 'Updated',
      position: 30,
      selector: { field: 'updatedAt', selector: 'project_field' },
      valueType: 'date',
    },
  ],
}

function normalizedReason(reason: string): string {
  const normalized = reason.trim()
  if (!(normalized.length > 0 && normalized.length <= 500)) {
    throw new EngineError(
      'invalid_graph_operation',
      'A mutation reason must contain between 1 and 500 characters.'
    )
  }
  return normalized
}

function normalizedTags(tags: readonly string[]): string[] {
  const normalized = [
    ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
  ].toSorted()
  if (
    normalized.length > MAX_PROJECT_TAGS ||
    normalized.some((tag) => !/^[a-z][a-z0-9_-]{0,63}$/.test(tag))
  ) {
    throw new EngineError(
      'invalid_graph_operation',
      'Project tags must use the bounded lowercase tag grammar.'
    )
  }
  return normalized
}

interface AppliedGraph {
  readonly affectedEdgeIds: readonly string[]
  readonly affectedNodeIds: readonly string[]
  readonly edges: ProjectEdge[]
  readonly nodes: ProjectNode[]
  readonly projectionSchema: ProjectionSchema
}

function applyGraphOperations(input: {
  readonly edges: readonly ProjectEdge[]
  readonly nodes: readonly ProjectNode[]
  readonly operations: readonly GraphOperation[]
  readonly projectId: string
  readonly projectionSchema: ProjectionSchema
}): AppliedGraph {
  const nodes = input.nodes.map((node) => ({ ...node }))
  const edges = input.edges.map((edge) => ({ ...edge }))
  let projectionSchema = input.projectionSchema
  const affectedNodeIds = new Set<string>()
  const affectedEdgeIds = new Set<string>()
  const timestamp = now()

  const liveNode = (nodeId: string): ProjectNode => {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    if (!node || node.tombstonedAt !== null) {
      throw new EngineError(
        'invalid_graph_operation',
        `Node "${nodeId}" does not exist or is tombstoned.`
      )
    }
    return node
  }

  for (const operation of input.operations) {
    switch (operation.op) {
      case 'add_node': {
        const existing = nodes.find((candidate) => candidate.id === operation.nodeId)
        if (existing && existing.tombstonedAt === null) {
          throw new EngineError(
            'invalid_graph_operation',
            `Node "${operation.nodeId}" already exists.`
          )
        }
        if (existing) {
          existing.kind = operation.kind
          existing.label = operation.label
          existing.metadata = { ...operation.metadata }
          existing.tombstonedAt = null
          existing.updatedAt = timestamp
        } else {
          nodes.push({
            createdAt: timestamp,
            id: operation.nodeId,
            kind: operation.kind,
            label: operation.label,
            metadata: { ...operation.metadata },
            projectId: input.projectId,
            tombstonedAt: null,
            updatedAt: timestamp,
          })
        }
        affectedNodeIds.add(operation.nodeId)
        break
      }
      case 'update_node': {
        const node = liveNode(operation.nodeId)
        if (operation.kind !== undefined) node.kind = operation.kind
        if (operation.label !== undefined) node.label = operation.label
        if (operation.metadata !== undefined) {
          node.metadata = { ...node.metadata, ...operation.metadata }
        }
        node.updatedAt = timestamp
        affectedNodeIds.add(operation.nodeId)
        break
      }
      case 'tombstone_node': {
        const node = liveNode(operation.nodeId)
        node.tombstonedAt = timestamp
        node.updatedAt = timestamp
        affectedNodeIds.add(operation.nodeId)
        for (const edge of edges) {
          if (
            edge.tombstonedAt === null &&
            (edge.sourceNodeId === operation.nodeId ||
              edge.targetNodeId === operation.nodeId)
          ) {
            edge.tombstonedAt = timestamp
            edge.updatedAt = timestamp
            affectedEdgeIds.add(edge.id)
          }
        }
        break
      }
      case 'link_nodes': {
        liveNode(operation.sourceNodeId)
        liveNode(operation.targetNodeId)
        const existingEdge = edges.find((candidate) => candidate.id === operation.edgeId)
        if (existingEdge && existingEdge.tombstonedAt === null) {
          throw new EngineError(
            'invalid_graph_operation',
            `Edge "${operation.edgeId}" already exists.`
          )
        }
        if (existingEdge) {
          existingEdge.relation = operation.relation
          existingEdge.sourceNodeId = operation.sourceNodeId
          existingEdge.targetNodeId = operation.targetNodeId
          existingEdge.metadata = { ...operation.metadata }
          existingEdge.tombstonedAt = null
          existingEdge.updatedAt = timestamp
        } else {
          edges.push({
            createdAt: timestamp,
            id: operation.edgeId,
            metadata: { ...operation.metadata },
            projectId: input.projectId,
            relation: operation.relation,
            sourceNodeId: operation.sourceNodeId,
            targetNodeId: operation.targetNodeId,
            tombstonedAt: null,
            updatedAt: timestamp,
          })
        }
        affectedEdgeIds.add(operation.edgeId)
        break
      }
      case 'unlink_nodes': {
        const edge = edges.find((candidate) => candidate.id === operation.edgeId)
        if (!edge || edge.tombstonedAt !== null) {
          throw new EngineError(
            'invalid_graph_operation',
            `Edge "${operation.edgeId}" does not exist or is tombstoned.`
          )
        }
        edge.tombstonedAt = timestamp
        edge.updatedAt = timestamp
        affectedEdgeIds.add(edge.id)
        break
      }
      case 'define_projection_column': {
        const columns = projectionSchema.columns.filter(
          (column) => column.key !== operation.column.key
        )
        columns.push(operation.column)
        projectionSchema = {
          columns: columns.toSorted(
            (left, right) => left.position - right.position || left.key.localeCompare(right.key)
          ),
          version: projectionSchema.version + 1,
        }
        break
      }
      default: {
        const exhaustiveOperation: never = operation
        throw new EngineError(
          'invalid_graph_operation',
          `Unsupported operation ${JSON.stringify(exhaustiveOperation)}`
        )
      }
    }
  }

  return {
    affectedEdgeIds: [...affectedEdgeIds],
    affectedNodeIds: [...affectedNodeIds],
    edges,
    nodes,
    projectionSchema,
  }
}

function operationSummary(operations: readonly GraphOperation[]): string {
  const counts = new Map<string, number>()
  for (const operation of operations) {
    counts.set(operation.op, (counts.get(operation.op) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([op, count]) => `${count}× ${op}`)
    .join(' · ')
    .slice(0, 500)
}

export class ProjectEngine {
  private nextNumber: number
  private readonly projects = new Map<string, ProjectRecord>()
  private turnSequence = 0

  constructor(snapshot?: EngineSnapshot) {
    this.nextNumber = snapshot?.nextNumber ?? 1
    for (const record of snapshot?.projects ?? []) {
      this.projects.set(record.summary.id, {
        summary: record.summary,
        nodes: record.nodes.map((node) => ({ ...node })),
        edges: record.edges.map((edge) => ({ ...edge })),
        events: record.events.map((event) => ({ ...event })),
      })
    }
  }

  listProjects(): ProjectSummary[] {
    return [...this.projects.values()]
      .map((record) => record.summary)
      .toSorted((left, right) => right.number - left.number)
  }

  getRecord(projectId: string): ProjectRecord | undefined {
    return this.projects.get(projectId)
  }

  getProjection(projectId: string): ProjectProjection {
    const record = this.requireRecord(projectId)
    return projectSnapshot({
      columns: record.summary.projectionSchema.columns,
      edges: record.edges,
      nodes: record.nodes,
      project: record.summary,
    })
  }

  createProject(input: {
    readonly actor?: string
    readonly initialOperations?: readonly GraphOperation[]
    readonly reason: string
    readonly tags?: readonly string[]
    readonly title: string
  }): MutationResult {
    const title = input.title.trim()
    if (!title) {
      throw new EngineError('invalid_graph_operation', 'A project title is required.')
    }
    const timestamp = now()
    const projectId = createId()
    const number = this.nextNumber
    this.nextNumber += 1

    let nodes: ProjectNode[] = []
    let edges: ProjectEdge[] = []
    let projectionSchema = DEFAULT_PROJECTION_SCHEMA
    let affectedNodeIds: readonly string[] = []
    let affectedEdgeIds: readonly string[] = []

    const initialOperations = input.initialOperations ?? []
    if (initialOperations.length > 0) {
      graphOperationBatchSchema.parse(initialOperations)
      const applied = applyGraphOperations({
        edges,
        nodes,
        operations: initialOperations,
        projectId,
        projectionSchema,
      })
      nodes = applied.nodes
      edges = applied.edges
      projectionSchema = applied.projectionSchema
      affectedNodeIds = applied.affectedNodeIds
      affectedEdgeIds = applied.affectedEdgeIds
    }

    const summary: ProjectSummary = {
      archivedAt: null,
      createdAt: timestamp,
      graphSchemaVersion: 1,
      id: projectId,
      number,
      ownerId: OWNER_ID,
      projectionSchema,
      status: 'in_progress',
      tags: normalizedTags(input.tags ?? []),
      title,
      updatedAt: timestamp,
      version: 1,
    }

    const record: ProjectRecord = { summary, nodes, edges, events: [] }
    this.projects.set(projectId, record)
    const event = this.appendEvent(record, {
      actor: input.actor,
      operationType: 'create_project',
      payload: {
        title,
        number,
        operations: initialOperations.length,
      },
      reason: normalizedReason(input.reason),
    })

    return {
      affectedEdgeIds,
      affectedNodeIds,
      event,
      operationSummary: `project #${number} created`,
      project: summary,
      projection: this.getProjection(projectId),
      version: summary.version,
    }
  }

  mutateGraph(
    projectId: string,
    operations: readonly GraphOperation[],
    command: MutatingCommand
  ): MutationResult {
    const record = this.requireRecord(projectId)

    // Idempotency outranks staleness. A retry after an ambiguous network failure carries the
    // version the caller last saw, which is stale precisely *because* the first attempt landed.
    // Checking the version first would report a conflict for a mutation that already succeeded,
    // and the caller could not tell that apart from a genuine race, so the replay check runs
    // before every rejection path.
    const replay = this.findReplay(record, command.mutationKey)
    if (replay) {
      return this.replayedResult(record, replay)
    }

    this.requireMutable(record)
    this.requireExpectedVersion(record, command.expectedVersion)
    const reason = normalizedReason(command.reason)

    const parsed = graphOperationBatchSchema.parse(operations)
    const applied = applyGraphOperations({
      edges: record.edges,
      nodes: record.nodes,
      operations: parsed,
      projectId,
      projectionSchema: record.summary.projectionSchema,
    })

    const summary: ProjectSummary = {
      ...record.summary,
      projectionSchema: applied.projectionSchema,
      updatedAt: now(),
      version: record.summary.version + 1,
    }
    record.nodes.splice(0, record.nodes.length, ...applied.nodes)
    record.edges.splice(0, record.edges.length, ...applied.edges)
    ;(record as { summary: ProjectSummary }).summary = summary

    const event = this.appendEvent(record, {
      actor: command.actor,
      mutationKey: command.mutationKey,
      operationType: 'mutate_graph',
      payload: {
        operations: parsed.length,
        affectedNodeIds: applied.affectedNodeIds,
        affectedEdgeIds: applied.affectedEdgeIds,
      },
      reason,
    })

    return {
      affectedEdgeIds: applied.affectedEdgeIds,
      affectedNodeIds: applied.affectedNodeIds,
      event,
      operationSummary: operationSummary(parsed),
      project: summary,
      projection: this.getProjection(projectId),
      version: summary.version,
    }
  }

  changeState(
    projectId: string,
    status: ProjectStatus,
    command: MutatingCommand
  ): MutationResult {
    const record = this.requireRecord(projectId)

    // Idempotency outranks staleness. A retry after an ambiguous network failure carries the
    // version the caller last saw, which is stale precisely *because* the first attempt landed.
    // Checking the version first would report a conflict for a mutation that already succeeded,
    // and the caller could not tell that apart from a genuine race, so the replay check runs
    // before every rejection path.
    const replay = this.findReplay(record, command.mutationKey)
    if (replay) {
      return this.replayedResult(record, replay)
    }

    this.requireExpectedVersion(record, command.expectedVersion)
    const reason = normalizedReason(command.reason)

    const current = record.summary.status
    if (current !== status) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[current]
      if (!allowed.includes(status)) {
        throw new EngineError(
          'invalid_status_transition',
          `Cannot move from "${current}" to "${status}".`
        )
      }
    }

    const summary: ProjectSummary = {
      ...record.summary,
      archivedAt: status === 'archived' ? now() : null,
      status,
      updatedAt: now(),
      version: record.summary.version + 1,
    }
    ;(record as { summary: ProjectSummary }).summary = summary

    const event = this.appendEvent(record, {
      actor: command.actor,
      mutationKey: command.mutationKey,
      operationType: 'change_project_status',
      payload: { from: current, to: status },
      reason,
    })

    return {
      affectedEdgeIds: [],
      affectedNodeIds: [],
      event,
      operationSummary: `status ${current} → ${status}`,
      project: summary,
      projection: this.getProjection(projectId),
      version: summary.version,
    }
  }

  updateTags(
    projectId: string,
    delta: { readonly add?: readonly string[]; readonly remove?: readonly string[] },
    command: MutatingCommand
  ): MutationResult {
    const record = this.requireRecord(projectId)

    // Idempotency outranks staleness. A retry after an ambiguous network failure carries the
    // version the caller last saw, which is stale precisely *because* the first attempt landed.
    // Checking the version first would report a conflict for a mutation that already succeeded,
    // and the caller could not tell that apart from a genuine race, so the replay check runs
    // before every rejection path.
    const replay = this.findReplay(record, command.mutationKey)
    if (replay) {
      return this.replayedResult(record, replay)
    }

    this.requireMutable(record)
    this.requireExpectedVersion(record, command.expectedVersion)
    const reason = normalizedReason(command.reason)

    const removed = new Set((delta.remove ?? []).map((tag) => tag.trim().toLowerCase()))
    const tags = normalizedTags([
      ...record.summary.tags.filter((tag) => !removed.has(tag)),
      ...(delta.add ?? []),
    ])

    const summary: ProjectSummary = {
      ...record.summary,
      tags,
      updatedAt: now(),
      version: record.summary.version + 1,
    }
    ;(record as { summary: ProjectSummary }).summary = summary

    const event = this.appendEvent(record, {
      actor: command.actor,
      mutationKey: command.mutationKey,
      operationType: 'update_project_tags',
      payload: { add: delta.add ?? [], remove: delta.remove ?? [] },
      reason,
    })

    return {
      affectedEdgeIds: [],
      affectedNodeIds: [],
      event,
      operationSummary: `tags → ${tags.join(', ') || 'none'}`,
      project: summary,
      projection: this.getProjection(projectId),
      version: summary.version,
    }
  }

  toSnapshot(): EngineSnapshot {
    return {
      nextNumber: this.nextNumber,
      projects: [...this.projects.values()].map((record) => ({
        summary: record.summary,
        nodes: record.nodes,
        edges: record.edges,
        events: record.events,
      })),
    }
  }

  private requireRecord(projectId: string): ProjectRecord {
    const record = this.projects.get(projectId)
    if (!record) {
      throw new EngineError('project_not_found', 'Project not found.')
    }
    return record
  }

  private requireMutable(record: ProjectRecord): void {
    if (record.summary.status === 'archived') {
      throw new EngineError(
        'project_archived',
        'Archived projects are read-only. Reopen the project to mutate it.'
      )
    }
  }

  private requireExpectedVersion(record: ProjectRecord, expectedVersion: number): void {
    if (record.summary.version !== expectedVersion) {
      throw new EngineError(
        'version_conflict',
        `Expected version ${expectedVersion}, found ${record.summary.version}. Refresh and retry.`
      )
    }
  }

  private findReplay(
    record: ProjectRecord,
    mutationKey: string | undefined
  ): ProjectEvent | undefined {
    if (!mutationKey) return undefined
    return record.events.find((event) => event.mutationKey === mutationKey)
  }

  private replayedResult(record: ProjectRecord, event: ProjectEvent): MutationResult {
    return {
      affectedEdgeIds: [],
      affectedNodeIds: [],
      event,
      operationSummary: `duplicate of event #${event.sequence} (idempotent replay)`,
      project: record.summary,
      projection: this.getProjection(record.summary.id),
      version: record.summary.version,
    }
  }

  private appendEvent(
    record: ProjectRecord,
    input: {
      readonly actor?: string
      readonly mutationKey?: string
      readonly operationType: string
      readonly payload: Record<string, import('./contracts').JsonValue>
      readonly reason: string
    }
  ): ProjectEvent {
    this.turnSequence += 1
    const event: ProjectEvent = {
      actor: input.actor ?? 'local-operator',
      createdAt: now(),
      id: createId(),
      mutationKey:
        input.mutationKey ??
        `${SESSION_ID}:turn-${this.turnSequence}:${createId().slice(0, 8)}`,
      operationType: input.operationType,
      ownerId: OWNER_ID,
      payload: input.payload,
      projectId: record.summary.id,
      projectVersion: record.summary.version,
      reason: input.reason,
      sequence: record.events.length + 1,
      sessionId: SESSION_ID,
      turnSequence: this.turnSequence,
    }
    record.events.push(event)
    return event
  }
}
