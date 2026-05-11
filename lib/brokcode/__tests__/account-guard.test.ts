import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthResult } from '@/lib/brok/auth'

import { enforceBrokCodeAccountOwnership } from '../account-guard'

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null)
}))

const fallbackAuthResult = {
  success: true,
  apiKey: {
    id: '00000000-0000-0000-0000-000000000001',
    userId: 'anonymous-user'
  },
  workspace: {
    id: '00000000-0000-0000-0000-000000000000'
  }
} as Extract<AuthResult, { success: true }>

describe('enforceBrokCodeAccountOwnership', () => {
  afterEach(() => {
    delete process.env.BROKCODE_ALLOW_LOCAL_AUTH_FALLBACK
  })

  it('rejects local fallback API keys by default', async () => {
    const response = await enforceBrokCodeAccountOwnership(fallbackAuthResult)

    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toMatchObject({
      error: {
        code: 'brokcode_real_account_required'
      }
    })
  })

  it('allows local fallback API keys only when explicitly enabled', async () => {
    process.env.BROKCODE_ALLOW_LOCAL_AUTH_FALLBACK = 'true'

    await expect(
      enforceBrokCodeAccountOwnership(fallbackAuthResult)
    ).resolves.toBeNull()
  })
})
