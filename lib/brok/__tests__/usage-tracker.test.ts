import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockInsert,
  mockReturning,
  mockSet,
  mockUpdate,
  mockValues,
  mockWhere
} = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockReturning: vi.fn(),
  mockSet: vi.fn(),
  mockUpdate: vi.fn(),
  mockWhere: vi.fn(),
  mockValues: vi.fn()
}))

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate
  }
}))

vi.mock('@/lib/db/schema-brok', () => ({
  apiKeys: {},
  usageEvents: {},
  workspaces: {}
}))

import {
  expireStaleUsageReservations,
  finalizeUsageReservation,
  recordUsage,
  reserveUsage,
  type UsageRecord,
  UsageRecordError
} from '../usage-tracker'

function usageRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    requestId: 'req_usage_test',
    workspaceId: 'workspace_1',
    userId: 'user_1',
    apiKeyId: 'key_1',
    endpoint: 'chat',
    model: 'brok-code',
    provider: 'Brok',
    inputTokens: 10,
    outputTokens: 4,
    providerCostUsd: 0.001,
    billedUsd: 0.002,
    latencyMs: 120,
    status: 'success',
    ...overrides
  }
}

describe('recordUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.BROK_CLOUD_DEPLOYMENT
    delete process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockResolvedValue(undefined)
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })
    mockWhere.mockReturnValue({ returning: mockReturning })
    mockReturning.mockResolvedValue([{ id: 'usage_1' }])
  })

  it('fails closed in cloud when a billable usage insert fails', async () => {
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'
    mockValues.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(recordUsage(usageRecord())).rejects.toBeInstanceOf(
      UsageRecordError
    )
  })

  it('keeps local/self-hosted usage inserts fail-open', async () => {
    mockValues.mockRejectedValueOnce(new Error('local database unavailable'))

    await expect(recordUsage(usageRecord())).resolves.toBeUndefined()
  })

  it('keeps error usage records best-effort in cloud to avoid recursive failures', async () => {
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'
    mockValues.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(
      recordUsage(usageRecord({ status: 'error', errorCode: 'provider_error' }))
    ).resolves.toBeUndefined()
  })
})

describe('usage reservations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.BROK_CLOUD_DEPLOYMENT
    delete process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockResolvedValue(undefined)
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })
    mockWhere.mockReturnValue({ returning: mockReturning })
    mockReturning.mockResolvedValue([{ id: 'usage_1' }])
  })

  it('creates a pending usage reservation before streaming work starts', async () => {
    await reserveUsage(usageRecord())

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_usage_test',
        status: 'reserved',
        metadata: expect.objectContaining({
          reservationStatus: 'pending'
        })
      })
    )
  })

  it('fails closed in cloud when reservation creation fails', async () => {
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'
    mockValues.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(reserveUsage(usageRecord())).rejects.toBeInstanceOf(
      UsageRecordError
    )
  })

  it('finalizes an existing reservation with actual usage', async () => {
    await finalizeUsageReservation(usageRecord({ outputTokens: 30 }))

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        outputTokens: 30,
        status: 'success',
        metadata: expect.objectContaining({
          reservationStatus: 'finalized'
        })
      })
    )
  })

  it('falls back to a normal usage insert when no reservation row exists', async () => {
    mockReturning.mockResolvedValueOnce([])

    await finalizeUsageReservation(usageRecord())

    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_usage_test',
        status: 'success'
      })
    )
  })

  it('expires stale reservations for reconciliation jobs', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 'usage_1' }, { id: 'usage_2' }])

    await expect(
      expireStaleUsageReservations({ before: new Date('2026-01-01') })
    ).resolves.toBe(2)

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'expired',
        errorCode: 'usage_reservation_expired'
      })
    )
  })
})
