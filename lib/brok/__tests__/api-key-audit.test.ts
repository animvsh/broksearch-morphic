import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInsert, mockReturning, mockValues } = vi.hoisted(() => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: 'event-1' }])
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues })

  return { mockInsert, mockReturning, mockValues }
})

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert
  }
}))

vi.mock('@/lib/db/schema', () => ({
  apiKeyAuditEvents: {}
}))

import {
  API_KEY_AUDIT_EVENT_TYPES,
  buildApiKeyAuditEventValues,
  recordApiKeyAuditEvent,
  sanitizeApiKeyAuditMetadata
} from '../api-key-audit'

describe('api key audit events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds persistent lifecycle event values with request context', () => {
    const values = buildApiKeyAuditEventValues({
      workspaceId: 'workspace-1',
      apiKeyId: 'key-1',
      actorUserId: 'user-1',
      actorType: 'user',
      eventType: 'created',
      keyPrefix: 'brok_sk_live_prefix',
      requestId: 'req_123',
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      metadata: {
        environment: 'live',
        scopes: ['chat:write']
      }
    })

    expect(values).toMatchObject({
      workspaceId: 'workspace-1',
      apiKeyId: 'key-1',
      actorUserId: 'user-1',
      actorType: 'user',
      eventType: 'created',
      keyPrefix: 'brok_sk_live_prefix',
      requestId: 'req_123',
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
      metadata: {
        environment: 'live',
        scopes: ['chat:write']
      }
    })
    expect(values.createdAt).toBeInstanceOf(Date)
  })

  it('redacts full API keys and secret-shaped metadata before persistence', () => {
    const rawKey = ['brok', 'sk', 'live', 'abcdefghijklmnopqrstuvwxyz'].join(
      '_'
    )
    const metadata = sanitizeApiKeyAuditMetadata({
      rawKey,
      authorization: `Bearer ${rawKey}`,
      safePrefix: 'brok_sk_live_prefix',
      nested: {
        note: `rotated ${rawKey}`,
        scopes: ['chat:write']
      }
    })

    const serialized = JSON.stringify(metadata)

    expect(metadata).toEqual({
      rawKey: '[redacted]',
      authorization: '[redacted]',
      safePrefix: 'brok_sk_live_prefix',
      nested: {
        note: 'rotated [redacted]',
        scopes: ['chat:write']
      }
    })
    expect(serialized).not.toContain(rawKey)
  })

  it('inserts sanitized audit events', async () => {
    const rawKey = ['brok', 'sk', 'test', 'abcdefghijklmnopqrstuvwxyz'].join(
      '_'
    )

    await recordApiKeyAuditEvent({
      workspaceId: 'workspace-1',
      apiKeyId: 'key-1',
      actorUserId: 'user-1',
      eventType: 'secret_revealed_once',
      keyPrefix: 'brok_sk_test_prefix',
      metadata: {
        rawKey,
        rawValuePersisted: false
      }
    })

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockValues).toHaveBeenCalledTimes(1)
    expect(mockReturning).toHaveBeenCalledTimes(1)

    const inserted = mockValues.mock.calls[0]?.[0]
    expect(inserted.metadata).toMatchObject({
      rawKey: '[redacted]',
      rawValuePersisted: false
    })
    expect(JSON.stringify(inserted)).not.toContain(rawKey)
  })

  it('declares future lifecycle event types without requiring secret storage', () => {
    expect(API_KEY_AUDIT_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        'created',
        'secret_revealed_once',
        'secret_acknowledged',
        'paused',
        'resumed',
        'revoked',
        'rotated',
        'expiry_updated',
        'denied_expired_key_usage'
      ])
    )
  })
})
