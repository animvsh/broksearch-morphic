import { describe, expect, it, vi } from 'vitest'

import { hashApiKey, hashNewApiKey, verifyApiKey } from '@/lib/api-key'

vi.mock('@/lib/utils/telemetry', () => ({
  isTracingEnabled: () => false
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([])
  }
}))

vi.mock('@/lib/brok/auth', () => ({
  apiKeyHasScope: vi.fn().mockReturnValue(true),
  forbiddenScopeResponse: vi.fn(),
  unauthorizedResponse: vi.fn(),
  verifyRequestAuth: vi.fn().mockResolvedValue({
    success: true,
    apiKey: {
      id: 'test-key',
      workspaceId: 'ws-1',
      userId: 'u-1',
      allowedModels: [],
      rpmLimit: 60,
      scopes: ['*']
    },
    workspace: { id: 'ws-1', status: 'active' }
  })
}))

describe('API key hashing', () => {
  it('generates a per-key salt and uses it in the hash', () => {
    const raw = 'brok_sk_live_abcdef123456'
    const { hash, salt } = hashNewApiKey(raw)
    expect(salt).toBeTruthy()
    expect(hash).not.toEqual(hashApiKey(raw))
    expect(verifyApiKey(raw, hash, salt)).toBe(true)
  })

  it('fails verification with a different salt', () => {
    const raw = 'brok_sk_live_abcdef123456'
    const a = hashNewApiKey(raw)
    const b = hashNewApiKey(raw)
    expect(verifyApiKey(raw, a.hash, b.salt)).toBe(false)
  })

  it('falls back to global-salt hash for legacy keys with no per-key salt', () => {
    const raw = 'brok_sk_live_legacy'
    const legacyHash = hashApiKey(raw)
    expect(verifyApiKey(raw, legacyHash, null)).toBe(true)
    expect(verifyApiKey(raw, legacyHash, undefined)).toBe(true)
  })
})

describe('rate limiter fail-closed in cloud', () => {
  it('uses the aggregate rate-limit count when deciding the current window', async () => {
    vi.resetModules()
    delete process.env.BROK_CLOUD_DEPLOYMENT

    const dbMod = await import('@/lib/db')
    ;(dbMod.db.select as any).mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([{ count: 2 }])
      })
    })

    const { checkRateLimit } = await import('@/lib/brok/rate-limiter')
    const result = await checkRateLimit('key-1', 'ws-1', 2)

    expect(result.allowed).toBe(false)
    expect(result.current).toBe(2)
    expect(result.reason).toBe('rate_limit_exceeded')
  })

  it('returns allowed=false with reason=rate_limit_check_failed in cloud when DB errors', async () => {
    vi.resetModules()
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'

    const { checkRateLimit } = await import('@/lib/brok/rate-limiter')
    // Force a thrown error from the DB
    const dbMod = await import('@/lib/db')
    ;(dbMod.db.select as any).mockImplementationOnce(() => {
      throw new Error('simulated DB outage')
    })

    const result = await checkRateLimit('key-1', 'ws-1', 60)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('rate_limit_check_failed')

    delete process.env.BROK_CLOUD_DEPLOYMENT
  })

  it('returns allowed=true in self-hosted when DB errors (fail open)', async () => {
    vi.resetModules()
    delete process.env.BROK_CLOUD_DEPLOYMENT

    const { checkRateLimit } = await import('@/lib/brok/rate-limiter')
    const dbMod = await import('@/lib/db')
    ;(dbMod.db.select as any).mockImplementationOnce(() => {
      throw new Error('simulated DB outage')
    })

    const result = await checkRateLimit('key-1', 'ws-1', 60)
    expect(result.allowed).toBe(true)
  })
})
