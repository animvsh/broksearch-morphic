import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateApiKey, hashApiKey } from '@/lib/api-key'

import { verifyRequestAuth } from '../auth'

// Create mock functions using vi.hoisted so they are available in vi.mock
const { mockSelect, mockFrom, mockWhere, mockLimit } = vi.hoisted(() => {
  const mockWhere = vi.fn().mockReturnThis()
  const mockLimit = vi.fn().mockReturnThis()
  const mockFrom = vi.fn().mockReturnValue({
    where: mockWhere,
    limit: mockLimit
  })
  const mockSelect = vi.fn().mockReturnValue({
    from: mockFrom
  })
  return { mockSelect, mockFrom, mockWhere, mockLimit }
})

// Mock the db
vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    insert: vi.fn(),
    update: vi.fn()
  }
}))

// Mock schema
vi.mock('@/lib/db/schema', () => ({
  apiKeys: {},
  workspaces: {}
}))

describe('verifyRequestAuth', () => {
  const testKey = generateApiKey('live')

  afterEach(() => {
    delete process.env.BROK_CLOUD_DEPLOYMENT
    delete process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK
    delete process.env.BROK_DISABLE_LOCAL_AUTH_FALLBACK
    delete process.env.BROK_SMOKE_API_KEY
    vi.clearAllMocks()
  })

  it('returns error for missing authorization header', async () => {
    const mockRequest = {
      headers: {
        get: (name: string) => null
      }
    } as unknown as Request

    const result = await verifyRequestAuth(mockRequest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('missing_authorization')
      expect(result.status).toBe(401)
    }
  })

  it('returns error for invalid bearer format', async () => {
    const mockRequest = {
      headers: {
        get: (name: string) =>
          name === 'authorization' ? 'InvalidFormat' : null
      }
    } as unknown as Request

    const result = await verifyRequestAuth(mockRequest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('invalid_authorization_format')
      expect(result.status).toBe(401)
    }
  })

  it('allows x-api-key to take precedence over a malformed authorization header', async () => {
    process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK = 'true'
    process.env.BROK_SMOKE_API_KEY = 'brok_sk_local_smoke'

    const mockRequest = {
      headers: {
        get: (name: string) => {
          if (name === 'authorization') return 'NotBearer nope'
          if (name === 'x-api-key') return 'brok_sk_local_smoke'
          return null
        }
      }
    } as unknown as Request

    const result = await verifyRequestAuth(mockRequest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.apiKey.scopes).toContain('usage:read')
    }
  })

  it('returns error for unknown API key', async () => {
    // Setup mock chain: db.select().from().where().limit() returns empty array
    mockSelect.mockReturnValueOnce({
      from: mockFrom.mockReturnValueOnce({
        where: mockWhere.mockReturnValueOnce({
          limit: mockLimit.mockReturnValueOnce([]) // Empty array = no key found
        })
      })
    })

    const mockRequest = {
      headers: {
        get: (name: string) =>
          name === 'authorization' ? `Bearer ${testKey}` : null
      }
    } as unknown as Request

    const result = await verifyRequestAuth(mockRequest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('invalid_api_key')
      expect(result.status).toBe(401)
    }
  })

  it('does not allow the local fallback key in cloud deployments', async () => {
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'
    mockSelect.mockImplementationOnce(() => {
      throw new Error('database unavailable')
    })

    const mockRequest = {
      headers: {
        get: (name: string) =>
          name === 'x-api-key' ? 'brok_sk_local_smoke' : null
      }
    } as unknown as Request

    const result = await verifyRequestAuth(mockRequest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('auth_storage_unavailable')
      expect(result.status).toBe(503)
    }
  })
})
