import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockBeginIdempotentRequest,
  mockCalculateCost,
  mockCheckRateLimit,
  mockCheckUsageLimits,
  mockCompleteIdempotentRequest,
  mockRecordRateLimitEvent,
  mockRecordUsage,
  mockRouteToProvider,
  mockRunSearchPipeline,
  mockVerifyRequestAuth
} = vi.hoisted(() => ({
  mockBeginIdempotentRequest: vi.fn(),
  mockCalculateCost: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockCheckUsageLimits: vi.fn(),
  mockCompleteIdempotentRequest: vi.fn(),
  mockRecordRateLimitEvent: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockRouteToProvider: vi.fn(),
  mockRunSearchPipeline: vi.fn(),
  mockVerifyRequestAuth: vi.fn()
}))

vi.mock('@/lib/brok/auth', () => ({
  apiKeyHasScope: (apiKey: { scopes?: string[] }, scope: string) =>
    Array.isArray(apiKey.scopes) &&
    (apiKey.scopes.includes(scope) || apiKey.scopes.includes('*')),
  forbiddenScopeResponse: (scope: string) =>
    Response.json({ error: { code: 'missing_scope', scope } }, { status: 403 }),
  unauthorizedResponse: () =>
    Response.json(
      { error: { code: 'missing_authorization' } },
      { status: 401 }
    ),
  verifyRequestAuth: mockVerifyRequestAuth
}))

vi.mock('@/lib/brok/idempotency', () => ({
  beginIdempotentRequest: mockBeginIdempotentRequest,
  completeIdempotentRequest: mockCompleteIdempotentRequest,
  idempotencyHeaders: ({
    key,
    replayed
  }: {
    key?: string
    replayed?: boolean
  }) =>
    key
      ? {
          'Idempotency-Key': key,
          'Idempotency-Replayed': replayed ? 'true' : 'false'
        }
      : {}
}))

vi.mock('@/lib/brok/provider-router', () => ({
  calculateCost: mockCalculateCost,
  routeToProvider: mockRouteToProvider,
  routeToProviderResponse: vi.fn()
}))

vi.mock('@/lib/brok/rate-limiter', () => ({
  checkRateLimit: mockCheckRateLimit,
  recordRateLimitEvent: mockRecordRateLimitEvent
}))

vi.mock('@/lib/brok/search-pipeline', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/brok/search-pipeline')>()
  return {
    ...actual,
    runSearchPipeline: mockRunSearchPipeline
  }
})

vi.mock('@/lib/brok/usage-tracker', () => ({
  checkUsageLimits: mockCheckUsageLimits,
  generateRequestId: () => 'req_idempotent_test',
  recordUsage: mockRecordUsage,
  UsageRecordError: class UsageRecordError extends Error {},
  usageLimitResponse: () =>
    Response.json(
      { error: { code: 'usage_storage_unavailable' } },
      { status: 503 }
    )
}))

import { POST as chatPost } from '../chat/completions/route'
import { POST as messagesPost } from '../messages/route'
import { POST as searchPost } from '../search/completions/route'

function authResult(scopes: string[]) {
  return {
    success: true,
    apiKey: {
      id: 'key_1',
      userId: 'user_1',
      scopes,
      allowedModels: [],
      rpmLimit: 60
    },
    workspace: { id: 'workspace_1' }
  }
}

function request(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'idem_123'
    },
    body: JSON.stringify(body)
  }) as any
}

describe('billable POST route idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBeginIdempotentRequest.mockResolvedValue({ kind: 'none' })
    mockCompleteIdempotentRequest.mockResolvedValue(undefined)
    mockCheckUsageLimits.mockResolvedValue({ allowed: true })
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      current: 0,
      limit: 60,
      resetAt: Math.floor(Date.now() / 1000) + 60
    })
    mockCalculateCost.mockResolvedValue(0.0001)
  })

  it('replays completed non-stream search responses before consuming usage or RPM', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['search:write']))
    mockBeginIdempotentRequest.mockResolvedValueOnce({
      kind: 'replay',
      response: Response.json(
        { id: 'req_original', object: 'search.completion' },
        {
          headers: {
            'Idempotency-Key': 'idem_123',
            'Idempotency-Replayed': 'true'
          }
        }
      )
    })

    const response = await searchPost(
      request('/api/v1/search/completions', {
        query: 'What is Brok?',
        model: 'brok-lite',
        stream: false
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Idempotency-Replayed')).toBe('true')
    expect(body).toMatchObject({ id: 'req_original' })
    expect(mockCheckUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRunSearchPipeline).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('stores fresh non-stream chat responses for future replay', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['chat:write']))
    mockBeginIdempotentRequest.mockResolvedValueOnce({
      kind: 'reserved',
      key: 'idem_123',
      route: '/api/v1/chat/completions',
      requestHash: 'hash_1'
    })
    mockRouteToProvider.mockResolvedValue({
      choices: [
        {
          message: { role: 'assistant', content: 'Hello from Brok.' },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 4,
        total_tokens: 7
      }
    })

    const response = await chatPost(
      request('/api/v1/chat/completions', {
        model: 'brok-fast',
        stream: false,
        messages: [{ role: 'user', content: 'Say hello' }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Idempotency-Key')).toBe('idem_123')
    expect(response.headers.get('Idempotency-Replayed')).toBe('false')
    expect(body.id).toBe('req_idempotent_test')
    expect(mockCompleteIdempotentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_idempotent_test',
        responseStatus: 200,
        responseBody: expect.objectContaining({
          id: 'req_idempotent_test',
          object: 'chat.completion'
        }),
        responseHeaders: expect.objectContaining({
          'Idempotency-Key': 'idem_123',
          'Idempotency-Replayed': 'false'
        })
      })
    )
  })

  it('returns the documented conflict response for duplicate streaming messages', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['code:write']))
    mockBeginIdempotentRequest.mockResolvedValueOnce({
      kind: 'blocked',
      response: Response.json(
        {
          error: {
            type: 'conflict_error',
            code: 'idempotency_request_in_progress'
          }
        },
        { status: 409 }
      )
    })

    const response = await messagesPost(
      request('/api/v1/messages', {
        model: 'brok-code',
        stream: true,
        messages: [{ role: 'user', content: 'Build a dashboard' }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('idempotency_request_in_progress')
    expect(mockCheckUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRouteToProvider).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })
})
