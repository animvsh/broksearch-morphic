import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockOrderBy, mockRequireAdminAccess } = vi.hoisted(() => {
  const mockOrderBy = vi.fn()
  const mockRequireAdminAccess = vi.fn()
  return { mockOrderBy, mockRequireAdminAccess }
})

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}))

vi.mock('@/lib/auth/admin', () => ({
  requireAdminAccess: mockRequireAdminAccess
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: mockOrderBy
      }))
    }))
  }
}))

import { getAppAccessAllowlist } from '../admin-brok'

describe('admin Brok actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mockRequireAdminAccess.mockResolvedValue({
      ok: true,
      user: { id: 'admin-user' }
    })
  })

  it('returns an empty allowlist when the local development database is unavailable', async () => {
    mockOrderBy.mockRejectedValueOnce(
      new Error('Failed query: role "brok" does not exist')
    )

    await expect(getAppAccessAllowlist()).resolves.toEqual([])
  })

  it('throws non-connectivity allowlist failures', async () => {
    mockOrderBy.mockRejectedValueOnce(new Error('permission denied'))

    await expect(getAppAccessAllowlist()).rejects.toThrow('permission denied')
  })
})
