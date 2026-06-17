import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn()
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: mocks.getCurrentUser
}))

describe('requireAdminAccess', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('fails closed in production when no admin allowlist is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.getCurrentUser.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com'
    } as any)
    const { requireAdminAccess } = await import('../admin')

    await expect(requireAdminAccess()).resolves.toMatchObject({
      ok: false,
      status: 403
    })
  })

  it('allows explicitly configured admin emails', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com')
    mocks.getCurrentUser.mockResolvedValue({
      id: 'user_1',
      email: 'ADMIN@example.com'
    } as any)
    const { requireAdminAccess } = await import('../admin')

    await expect(requireAdminAccess()).resolves.toMatchObject({
      ok: true,
      user: { id: 'user_1' }
    })
  })

  it('allows aalang@ucsc.edu when configured as an admin email', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_EMAILS', 'aalang@ucsc.edu')
    mocks.getCurrentUser.mockResolvedValue({
      id: 'user_aalang',
      email: 'AALANG@ucsc.edu'
    } as any)
    const { requireAdminAccess } = await import('../admin')

    await expect(requireAdminAccess()).resolves.toMatchObject({
      ok: true,
      user: { id: 'user_aalang' }
    })
  })

  it('allows aalang@ucsc.edu from the local dev access seed', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ADMIN_EMAILS', 'other-admin@example.com')
    mocks.getCurrentUser.mockResolvedValue({
      id: 'user_aalang',
      email: 'AALANG@ucsc.edu'
    } as any)
    const { requireAdminAccess } = await import('../admin')

    await expect(requireAdminAccess()).resolves.toMatchObject({
      ok: true,
      user: { id: 'user_aalang' }
    })
  })

  it('does not apply the local dev access seed in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_EMAILS', '')
    mocks.getCurrentUser.mockResolvedValue({
      id: 'user_aalang',
      email: 'aalang@ucsc.edu'
    } as any)
    const { requireAdminAccess } = await import('../admin')

    await expect(requireAdminAccess()).resolves.toMatchObject({
      ok: false,
      status: 403
    })
  })

  it('keeps local development convenient when no allowlist is configured', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    mocks.getCurrentUser.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com'
    } as any)
    const { requireAdminAccess } = await import('../admin')

    await expect(requireAdminAccess()).resolves.toMatchObject({
      ok: true,
      user: { id: 'user_1' }
    })
  })
})
