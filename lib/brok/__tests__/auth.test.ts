import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  generateApiKey,
  getKeyPrefix,
  hashApiKey,
  hashNewApiKey
} from '@/lib/api-key'

import { verifyRequestAuth } from '../auth'

// Create mock functions using vi.hoisted so they are available in vi.mock
const { mockSelect, mockFrom, mockWhere, mockLimit, mockUpdate } = vi.hoisted(
  () => {
    const mockLimit = vi.fn().mockReturnThis()
    const mockWhere = vi.fn().mockImplementation(() => ({
      limit: mockLimit
    }))
    const mockFrom = vi.fn().mockReturnValue({
      where: mockWhere
    })
    const mockSelect = vi.fn().mockReturnValue({
      from: mockFrom
    })
    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined)
      })
    })
    return {
      mockSelect,
      mockFrom,
      mockWhere,
      mockLimit,
      mockUpdate
    }
  }
)

// Mock the db
vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    insert: vi.fn(),
    update: mockUpdate
  }
}))

// Mock schema
vi.mock('@/lib/db/schema', () => ({
  apiKeys: {
    id: 'api_keys.id',
    keyHash: 'api_keys.key_hash',
    keyPrefix: 'api_keys.key_prefix',
    status: 'api_keys.status',
    workspaceId: 'api_keys.workspace_id'
  },
  workspaces: {
    id: 'workspaces.id'
  }
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
    // First lookup (legacy global-salt hash): empty
    mockSelect.mockReturnValueOnce({
      from: mockFrom.mockReturnValueOnce({
        where: mockWhere.mockReturnValueOnce({
          limit: mockLimit.mockReturnValueOnce([])
        })
      })
    })
    // Second lookup (per-key salt candidate scan): empty
    mockSelect.mockReturnValueOnce({
      from: mockFrom.mockReturnValueOnce({
        where: mockWhere.mockReturnValueOnce({
          limit: mockLimit.mockReturnValueOnce([])
        })
      })
    })
    // Third lookup (fallback 12-char compatibility scan): empty
    mockSelect.mockReturnValueOnce({
      from: mockFrom.mockReturnValueOnce({
        where: mockWhere.mockReturnValueOnce({
          limit: mockLimit.mockReturnValueOnce([])
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

  it('authenticates a per-key salted key through prefix-indexed candidates', async () => {
    const rawKey = 'brok_sk_live_abcdefghijklmnopqrstuvwxyz'
    const { hash, salt } = hashNewApiKey(rawKey)
    const keyRecord = {
      id: 'key-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      name: 'Production key',
      keyPrefix: getKeyPrefix(rawKey),
      keyHash: hash,
      keySalt: salt,
      environment: 'live',
      status: 'active',
      scopes: ['chat:write'],
      allowedModels: [],
      rpmLimit: 60,
      dailyRequestLimit: 5000,
      monthlyBudgetCents: 1000,
      lastUsedAt: null,
      createdAt: new Date(),
      revokedAt: null
    }
    const workspace = {
      id: 'workspace-1',
      name: 'Workspace',
      ownerUserId: 'user-1',
      plan: 'starter',
      status: 'active',
      monthlyBudgetCents: 1000,
      createdAt: new Date()
    }

    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([])
          })
        })
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([keyRecord])
          })
        })
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([workspace])
          })
        })
      })

    const mockRequest = {
      headers: {
        get: (name: string) =>
          name === 'authorization' ? `Bearer ${rawKey}` : null
      }
    } as unknown as Request

    const result = await verifyRequestAuth(mockRequest)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.apiKey.id).toBe('key-1')
      expect(result.workspace.id).toBe('workspace-1')
    }
    expect(mockSelect).toHaveBeenCalledTimes(3)
  })

  it('authenticates legacy hash keys through compatibility prefix scan', async () => {
    const rawKey = 'brok_sk_live_legacycompatibilitytest'
    const keyRecord = {
      id: 'key-2',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      name: 'Legacy compatibility key',
      keyPrefix: rawKey.slice(0, 12),
      keyHash: hashApiKey(rawKey),
      keySalt: null,
      environment: 'live',
      status: 'active',
      scopes: ['chat:write'],
      allowedModels: [],
      rpmLimit: 60,
      dailyRequestLimit: 5000,
      monthlyBudgetCents: 1000,
      lastUsedAt: null,
      createdAt: new Date(),
      revokedAt: null
    }
    const workspace = {
      id: 'workspace-1',
      name: 'Workspace',
      ownerUserId: 'user-1',
      plan: 'starter',
      status: 'active',
      monthlyBudgetCents: 1000,
      createdAt: new Date()
    }

    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([])
          })
        })
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([])
          })
        })
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([keyRecord])
          })
        })
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([workspace])
          })
        })
      })

    const mockRequest = {
      headers: {
        get: (name: string) =>
          name === 'authorization' ? `Bearer ${rawKey}` : null
      }
    } as unknown as Request

    const result = await verifyRequestAuth(mockRequest)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.apiKey.id).toBe('key-2')
      expect(result.workspace.id).toBe('workspace-1')
      expect(result.apiKey.keySalt).toBe(null)
    }
    expect(mockSelect).toHaveBeenCalledTimes(4)
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
