import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbState = vi.hoisted(() => ({
  workspaces: [] as Array<{ id: string; ownerUserId: string }>,
  usageEvents: [] as Array<Record<string, unknown>>
}))

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn()
}))

const userIdRef = vi.hoisted(() => ({ value: 'user-1' as string | null }))

vi.mock('@/lib/db', () => ({
  db: dbMock
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn(async () => userIdRef.value)
}))

vi.mock('@/lib/db/dev-db-fallback', () => ({
  canUseDevDbFallback: vi.fn(() => true),
  getErrorMessage: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error ?? '')
  )
}))

function makeWorkspacesQuery(rows: typeof dbState.workspaces) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn(() => Promise.resolve(rows))
  }
  return chain
}

function makeEventsQuery(rows: typeof dbState.usageEvents) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(() => Promise.resolve(rows))
  }
  return chain
}

describe('api-logs', () => {
  beforeEach(() => {
    dbState.workspaces = []
    dbState.usageEvents = []
    userIdRef.value = 'user-1'
    dbMock.select.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns an empty list when the user is unauthenticated', async () => {
    userIdRef.value = null
    const { getLogsForUser } = await import('../api-logs')
    const result = await getLogsForUser(25)
    expect(result).toEqual([])
  })

  it('returns an empty list when the user has no workspaces', async () => {
    dbMock.select.mockImplementationOnce(() => makeWorkspacesQuery([]))
    const { getLogsForUser } = await import('../api-logs')
    const result = await getLogsForUser(25)
    expect(result).toEqual([])
  })

  it('maps raw rows to UserLogEntry shape', async () => {
    dbState.workspaces = [{ id: 'ws-1', ownerUserId: 'user-1' }]
    dbState.usageEvents = [
      {
        id: 'evt-1',
        createdAt: new Date('2026-05-01T12:00:00Z'),
        endpoint: 'chat',
        model: 'gpt-4o',
        provider: 'openai',
        surface: 'api',
        inputTokens: 10,
        outputTokens: 20,
        latencyMs: 123,
        billedUsd: '0.0042',
        status: 'success'
      }
    ]

    dbMock.select
      .mockImplementationOnce(() => makeWorkspacesQuery(dbState.workspaces))
      .mockImplementationOnce(() => makeEventsQuery(dbState.usageEvents))

    const { getLogsForUser } = await import('../api-logs')
    const result = await getLogsForUser(5)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'evt-1',
      endpoint: 'chat',
      model: 'gpt-4o',
      provider: 'openai',
      surface: 'api',
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 123,
      billedUsd: '0.0042',
      status: 'success'
    })
    expect(result[0].createdAt).toBeInstanceOf(Date)
  })

  it('falls back to an empty list when the dev DB is unavailable', async () => {
    dbMock.select.mockImplementationOnce(() => {
      throw new Error('connect ECONNREFUSED 127.0.0.1')
    })
    const { getLogsForUser } = await import('../api-logs')
    const result = await getLogsForUser(10)
    expect(result).toEqual([])
  })
})
