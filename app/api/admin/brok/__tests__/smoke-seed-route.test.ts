import { NextRequest } from 'next/server'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { verifyApiKey } from '@/lib/api-key'

const {
  mockEnsureWorkspaceForUser,
  mockInsert,
  mockReturning,
  mockSet,
  mockUpdate,
  mockUpdateWhere,
  mockValues
} = vi.hoisted(() => ({
  mockEnsureWorkspaceForUser: vi.fn(),
  mockInsert: vi.fn(),
  mockReturning: vi.fn(),
  mockSet: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockValues: vi.fn()
}))

vi.mock('@/lib/actions/api-keys', () => ({
  ensureWorkspaceForUser: mockEnsureWorkspaceForUser
}))

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate
  }
}))

function postSeed(body: Record<string, unknown>, token?: string) {
  return new NextRequest('https://brok.test/api/admin/brok/smoke-seed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
}

describe('smoke seed route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SMOKE_SEED_TOKEN
    mockEnsureWorkspaceForUser.mockResolvedValue({ id: 'workspace_123' })
    mockReturning.mockResolvedValue([{ id: 'key_123' }])
    mockValues.mockReturnValue({ returning: mockReturning })
    mockInsert.mockReturnValue({ values: mockValues })
    mockUpdateWhere.mockResolvedValue(undefined)
    mockSet.mockReturnValue({ where: mockUpdateWhere })
    mockUpdate.mockReturnValue({ set: mockSet })
  })

  it('stays hidden when the seed token is not configured', async () => {
    const { POST } = await import('../smoke-seed/route')

    const response = await POST(postSeed({ kind: 'smoke' }))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Not found' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('creates smoke API keys with salted hashes that verify', async () => {
    process.env.SMOKE_SEED_TOKEN = 'test-seed-token'
    const { POST } = await import('../smoke-seed/route')

    const response = await POST(
      postSeed({ kind: 'smoke', userId: 'user_123' }, 'test-seed-token')
    )
    const body = await response.json()
    const inserted = mockValues.mock.calls[0][0]

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      kind: 'smoke',
      workspaceId: 'workspace_123'
    })
    expect(body.apiKey).toMatch(/^brok_sk_test_/)
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({ monthlyBudgetCents: 100 })
    expect(inserted.monthlyBudgetCents).toBe(100)
    expect(inserted.keyHash).toEqual(expect.any(String))
    expect(inserted.keySalt).toEqual(expect.any(String))
    expect(verifyApiKey(body.apiKey, inserted.keyHash, inserted.keySalt)).toBe(
      true
    )
  })
})
