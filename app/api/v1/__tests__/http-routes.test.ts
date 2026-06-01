import { NextRequest } from 'next/server'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the DB and auth modules before importing the route handlers.
const { mockAuth, mockDb } = vi.hoisted(() => {
  const db = {
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
  return {
    mockDb: db,
    mockAuth: {
      verifyRequestAuth: vi.fn(),
      apiKeyHasScope: vi.fn().mockReturnValue(false),
      forbiddenScopeResponse: vi.fn(),
      unauthorizedResponse: vi.fn()
    }
  }
})

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/brok/auth', () => mockAuth)
vi.mock('@/lib/brok/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    current: 0,
    limit: 60,
    resetAt: Math.floor(Date.now() / 1000) + 60
  }),
  recordRateLimitEvent: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('@/lib/brok/usage-tracker', () => ({
  checkUsageLimits: vi.fn().mockResolvedValue({ allowed: true }),
  generateRequestId: vi.fn().mockReturnValue('req_test_123'),
  recordUsage: vi.fn().mockResolvedValue(undefined),
  usageLimitResponse: vi.fn()
}))

describe('/v1/models auth gate', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAuth.verifyRequestAuth.mockReset()
    mockAuth.apiKeyHasScope.mockReset().mockReturnValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when no auth header is present', async () => {
    mockAuth.verifyRequestAuth.mockResolvedValueOnce({
      success: false,
      error: 'missing_authorization',
      status: 401
    })
    mockAuth.unauthorizedResponse.mockReturnValueOnce(
      new Response(
        JSON.stringify({
          error: { type: 'authentication_error', code: 'missing_authorization' }
        }),
        { status: 401 }
      )
    )

    const { GET } = await import('@/app/api/v1/models/route')
    const response = await GET(
      new NextRequest('http://localhost/v1/models') as any
    )
    expect(response.status).toBe(401)
  })

  it('returns 403 when the API key lacks usage:read scope', async () => {
    mockAuth.verifyRequestAuth.mockResolvedValueOnce({
      success: true,
      apiKey: { id: 'k', scopes: ['chat:write'], allowedModels: [] },
      workspace: { id: 'w', status: 'active' }
    })
    mockAuth.apiKeyHasScope.mockReturnValue(false)
    mockAuth.forbiddenScopeResponse.mockReturnValueOnce(
      new Response(
        JSON.stringify({
          error: { type: 'permission_error', code: 'missing_scope' }
        }),
        { status: 403 }
      )
    )

    const { GET } = await import('@/app/api/v1/models/route')
    const response = await GET(
      new NextRequest('http://localhost/v1/models') as any
    )
    expect(response.status).toBe(403)
  })

  it('returns 200 with no cost fields by default', async () => {
    mockAuth.verifyRequestAuth.mockResolvedValueOnce({
      success: true,
      apiKey: { id: 'k', scopes: ['usage:read'], allowedModels: [] },
      workspace: { id: 'w', status: 'active' }
    })
    mockAuth.apiKeyHasScope.mockImplementation(
      (_key: unknown, scope: string) => scope === 'usage:read'
    )

    const { GET } = await import('@/app/api/v1/models/route')
    const response = await GET(
      new NextRequest('http://localhost/v1/models') as any
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.object).toBe('list')
    expect(Array.isArray(body.data)).toBe(true)
    for (const model of body.data) {
      expect(model).not.toHaveProperty('input_cost_per_million')
      expect(model).not.toHaveProperty('output_cost_per_million')
    }
  })

  it('returns 200 with cost fields when include_pricing=true', async () => {
    mockAuth.verifyRequestAuth.mockResolvedValueOnce({
      success: true,
      apiKey: { id: 'k', scopes: ['usage:read'], allowedModels: [] },
      workspace: { id: 'w', status: 'active' }
    })
    mockAuth.apiKeyHasScope.mockImplementation(
      (_key: unknown, scope: string) => scope === 'usage:read'
    )

    const { GET } = await import('@/app/api/v1/models/route')
    const response = await GET(
      new NextRequest('http://localhost/v1/models?include_pricing=true') as any
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    for (const model of body.data) {
      // cost fields appear when explicitly requested
      expect(model).toHaveProperty('input_cost_per_million')
      expect(model).toHaveProperty('output_cost_per_million')
    }
  })
})

describe('/v1/usage degraded mode is env-gated', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAuth.verifyRequestAuth.mockReset()
    mockAuth.apiKeyHasScope.mockReset().mockReturnValue(false)
  })

  afterEach(() => {
    delete process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK
    delete process.env.BROK_CLOUD_DEPLOYMENT
  })

  it('returns 503 when DB fails and the cloud flag is set', async () => {
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'
    delete process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK

    mockAuth.verifyRequestAuth.mockResolvedValueOnce({
      success: true,
      apiKey: { id: 'k', scopes: ['usage:read'], allowedModels: [] },
      workspace: { id: 'w', status: 'active' }
    })
    mockAuth.apiKeyHasScope.mockReturnValue(true)
    mockDb.select.mockImplementation(() => {
      throw new Error('simulated DB outage')
    })

    const { GET } = await import('@/app/api/v1/usage/route')
    const response = await GET(
      new NextRequest('http://localhost/v1/usage?period=month') as any
    )
    expect(response.status).toBe(503)
  })

  it('returns degraded 200 with x-brok-degraded header in self-hosted when DB fails', async () => {
    process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK = 'true'
    delete process.env.BROK_CLOUD_DEPLOYMENT

    mockAuth.verifyRequestAuth.mockResolvedValueOnce({
      success: true,
      apiKey: { id: 'k', scopes: ['usage:read'], allowedModels: [] },
      workspace: { id: 'w', status: 'active' }
    })
    mockAuth.apiKeyHasScope.mockReturnValue(true)
    mockDb.select.mockImplementation(() => {
      throw new Error('simulated DB outage')
    })

    const { GET } = await import('@/app/api/v1/usage/route')
    const response = await GET(
      new NextRequest('http://localhost/v1/usage?period=month') as any
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('x-brok-degraded')).toBe(
      'local-usage-storage-unavailable'
    )
    const body = await response.json()
    expect(body.usage.requests).toBe(0)
  })
})
