import { describe, expect, it, vi } from 'vitest'

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
})
