import { afterEach, describe, expect, it, vi } from 'vitest'

describe('app access env resilience', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('does not require database env just to deny anonymous cloud access', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('DATABASE_RESTRICTED_URL', '')

    const { getAppAccessForUser } = await import('../app-access')

    await expect(getAppAccessForUser(null)).resolves.toEqual({
      allowed: false,
      user: null,
      reason: 'unauthenticated'
    })
  })
})
