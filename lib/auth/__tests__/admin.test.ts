import { afterEach, describe, expect, it, vi } from 'vitest'

import { requireAdminAccess } from '../admin'
import { getCurrentUser } from '../get-current-user'

vi.mock('../get-current-user', () => ({
  getCurrentUser: vi.fn()
}))

const mockedGetCurrentUser = vi.mocked(getCurrentUser)

describe('requireAdminAccess', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('fails closed in production when no admin allowlist is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mockedGetCurrentUser.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com'
    } as any)

    await expect(requireAdminAccess()).resolves.toMatchObject({
      ok: false,
      status: 403
    })
  })

  it('allows explicitly configured admin emails', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com')
    mockedGetCurrentUser.mockResolvedValue({
      id: 'user_1',
      email: 'ADMIN@example.com'
    } as any)

    await expect(requireAdminAccess()).resolves.toMatchObject({
      ok: true,
      user: { id: 'user_1' }
    })
  })

  it('keeps local development convenient when no allowlist is configured', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    mockedGetCurrentUser.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com'
    } as any)

    await expect(requireAdminAccess()).resolves.toMatchObject({
      ok: true,
      user: { id: 'user_1' }
    })
  })
})
