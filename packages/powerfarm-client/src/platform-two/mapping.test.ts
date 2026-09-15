import { describe, expect, it } from 'vitest'
import {
  describeTool,
  refineOperation,
  toAssistantEvent,
  toChangeState,
  toChangedFiles,
  toConnection,
  toErrorCode,
  toPowerfarmError,
  toRepositorySummaries,
  toRepositorySummary,
  toRunStatus,
  toRunSummary,
} from './mapping'
import type { WireRunStatus, WireStreamEvent } from './wire'

describe('repositories', () => {
  it('maps a permanent gadget to a repository at its head commit', () => {
    expect(
      toRepositorySummary({ commitId: 'abc123', id: 7, title: 'Billing', type: 'gadget' })
    ).toEqual({ id: '7', name: 'Billing', revision: 'abc123' })
  })

  it('declines a provisional gadget rather than inventing a revision', () => {
    expect(toRepositorySummary({ chatId: 4, id: 8, title: 'Draft', type: 'gadget' })).toBeNull()
    expect(
      toRepositorySummaries([
        { chatId: 4, id: 8, title: 'Draft', type: 'gadget' },
        { commitId: 'def', id: 9, title: 'Real', type: 'gadget' },
      ])
    ).toEqual([{ id: '9', name: 'Real', revision: 'def' }])
  })
})

describe('change state', () => {
  it('separates a proposal from an applied change', () => {
    expect(toChangeState({ action: 'approved', merged: false, stale: false })).toBe('approved')
    expect(toChangeState({ action: 'approved', merged: true, stale: false })).toBe('applied')
  })

  it('reports a pending action as awaiting approval', () => {
    expect(toChangeState({ action: 'pending', merged: false, stale: false })).toBe(
      'awaiting_approval'
    )
  })

  it('reports staleness over approval, since a stale change cannot be applied as-is', () => {
    expect(toChangeState({ action: 'approved', merged: false, stale: true })).toBe('stale')
  })

  it('reports a policy refusal as failed', () => {
    expect(
      toChangeState({ action: 'pending', merged: false, policyPassed: false, stale: false })
    ).toBe('failed')
  })

  it('lets an applied change outrank everything, because it already happened', () => {
    expect(
      toChangeState({ action: 'rejected', merged: true, policyPassed: false, stale: true })
    ).toBe('applied')
  })

  it('reports a rejection', () => {
    expect(toChangeState({ action: 'rejected', merged: false, stale: false })).toBe('rejected')
  })
})

describe('changed files', () => {
  it('flattens a code change into sorted per-file rows', () => {
    expect(
      toChangedFiles({
        '12': [
          ['src/b.ts', { set: 'new' }],
          ['src/a.ts', { edit: [1] }],
        ],
        '3': [['README.md', { remove: true }]],
      })
    ).toEqual([
      {
        additions: 0,
        deletions: 0,
        operation: 'removed',
        path: 'README.md',
        repositoryId: '3',
      },
      { additions: 0, deletions: 0, operation: 'modified', path: 'src/a.ts', repositoryId: '12' },
      { additions: 0, deletions: 0, operation: 'added', path: 'src/b.ts', repositoryId: '12' },
    ])
  })

  it('returns nothing for the identity change', () => {
    expect(toChangedFiles({})).toEqual([])
  })

  it('reclassifies a set over an existing path as a modification', () => {
    const file = {
      additions: 0,
      deletions: 0,
      operation: 'added' as const,
      path: 'src/a.ts',
      repositoryId: '1',
    }
    expect(refineOperation(file, new Set(['src/a.ts'])).operation).toBe('modified')
    expect(refineOperation(file, new Set()).operation).toBe('added')
  })
})

describe('run status', () => {
  const cases: Array<[WireRunStatus, string]> = [
    ['queued', 'queued'],
    ['starting', 'running'],
    ['running', 'running'],
    ['cancelling', 'running'],
    ['ready', 'succeeded'],
    ['applied', 'succeeded'],
    ['blocked', 'succeeded'],
    ['cancelled', 'cancelled'],
    ['rejected', 'failed'],
    ['stale', 'failed'],
    ['failed', 'failed'],
  ]

  it.each(cases)('maps %s to %s', (wire, expected) => {
    expect(toRunStatus(wire)).toBe(expected)
  })

  it('covers every Platform Two run status', () => {
    expect(cases).toHaveLength(11)
  })

  it('builds a run summary, finishing only a terminal run', () => {
    const running = toRunSummary(
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'r1',
        operatorName: 'Nightly',
        status: 'running',
        updatedAt: '2026-01-01T00:05:00.000Z',
      },
      'p1'
    )
    expect(running.finishedAt).toBeUndefined()

    const done = toRunSummary(
      {
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'r2',
        operatorName: 'Nightly',
        status: 'applied',
        updatedAt: new Date('2026-01-01T00:09:00.000Z'),
      },
      'p1'
    )
    expect(done.status).toBe('succeeded')
    expect(done.finishedAt).toBe('2026-01-01T00:09:00.000Z')
  })
})

describe('assistant events', () => {
  it('passes text through as a delta', () => {
    expect(toAssistantEvent({ delta: 'hi', type: 'textDelta' })).toEqual({
      text: 'hi',
      type: 'text_delta',
    })
  })

  it('names a tool the way a person would', () => {
    expect(toAssistantEvent({ toolCallId: 't1', toolName: 'readFile', type: 'toolCallStarted' })).toEqual(
      { title: 'reading a file', toolCallId: 't1', type: 'tool_started' }
    )
    expect(describeTool('someUnknownTool')).toBe('some unknown tool')
  })

  it('reports the file the agent is reading', () => {
    expect(
      toAssistantEvent({ file: { filename: 'src/a.ts', workpieceId: 4 }, type: 'setActiveFile' })
    ).toEqual({ path: 'src/a.ts', repositoryId: '4', type: 'file_inspected' })
  })

  it('absorbs machinery the conversation should not narrate', () => {
    const silent: WireStreamEvent[] = [
      { delta: 'thinking', type: 'reasoningDelta' },
      { delta: 'x', toolCallId: 't', type: 'toolCodeDelta' },
      { nothingToCompact: true, type: 'compacted' },
      { file: null, type: 'setActiveFile' },
    ]
    for (const event of silent) expect(toAssistantEvent(event)).toBeNull()
  })

  it('carries the durable sequence on the final event, so a reconnect can reconcile', () => {
    expect(toAssistantEvent({ sequence: 42, text: 'done', type: 'done' })).toEqual({
      sequence: 42,
      text: 'done',
      type: 'final',
    })
  })
})

describe('connections', () => {
  it('speaks of a connection, never a gatekeeper', () => {
    const connection = toConnection({
      credentialsValid: false,
      id: 3,
      label: 'dan@example.com',
      vendorId: 'github',
      vendorTitle: 'GitHub',
    })
    expect(connection).toEqual({
      connected: true,
      credentialsValid: false,
      id: '3',
      label: 'dan@example.com',
      vendor: 'GitHub',
    })
    expect(JSON.stringify(connection)).not.toMatch(/gatekeeper/i)
  })
})

describe('error classification', () => {
  it('reads an explicit error code first', () => {
    expect(toErrorCode(Object.assign(new Error('nope'), { code: 'NOT_AUTHORIZED' }))).toBe(
      'unauthorized'
    )
  })

  it('treats a stale merge point as stale, not as a crash', () => {
    expect(toErrorCode(new Error('chat is stale; update from mainline'))).toBe('stale')
  })

  it('distinguishes the failures the UI renders differently', () => {
    expect(toErrorCode(new Error('websocket disconnected'))).toBe('offline')
    expect(toErrorCode(new Error('expected version 4'))).toBe('conflict')
    expect(toErrorCode(new Error('no such gadget'))).toBe('not_found')
    expect(toErrorCode(new Error('filename must be non-empty'))).toBe('validation')
    expect(toErrorCode(new Error('session expired'))).toBe('unauthenticated')
  })

  it('falls back to backend rather than guessing', () => {
    expect(toErrorCode(new Error('kaboom'))).toBe('backend')
    expect(toErrorCode(null)).toBe('backend')
  })

  it('keeps the original error as the cause for the Inspector', () => {
    const original = new Error('websocket disconnected')
    const mapped = toPowerfarmError(original, 'reading the tree')
    expect(mapped.code).toBe('offline')
    expect(mapped.retryable).toBe(true)
    expect(mapped.message).toContain('reading the tree')
    expect(mapped.cause).toBe(original)
  })
})
