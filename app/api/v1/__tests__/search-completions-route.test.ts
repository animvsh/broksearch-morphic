import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCheckRateLimit,
  mockCheckUsageLimits,
  mockRecordRateLimitEvent,
  mockRecordUsage,
  mockRunSearchPipeline,
  mockVerifyRequestAuth
} = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockCheckUsageLimits: vi.fn(),
  mockRecordRateLimitEvent: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockRunSearchPipeline: vi.fn(),
  mockVerifyRequestAuth: vi.fn()
}))

vi.mock('@/lib/brok/auth', () => ({
  apiKeyHasScope: (apiKey: { scopes?: string[] }, scope: string) =>
    Array.isArray(apiKey.scopes) &&
    (apiKey.scopes.includes(scope) || apiKey.scopes.includes('*')),
  forbiddenScopeResponse: (scope: string) =>
    Response.json(
      {
        error: {
          type: 'permission_error',
          code: 'missing_scope',
          message: `This API key requires the ${scope} scope.`
        }
      },
      { status: 403 }
    ),
  unauthorizedResponse: () =>
    Response.json(
      { error: { code: 'missing_authorization' } },
      { status: 401 }
    ),
  verifyRequestAuth: mockVerifyRequestAuth
}))

vi.mock('@/lib/brok/rate-limiter', () => ({
  checkRateLimit: mockCheckRateLimit,
  recordRateLimitEvent: mockRecordRateLimitEvent
}))

vi.mock('@/lib/brok/search-pipeline', () => ({
  buildSearchQueries: vi.fn(() => ['What is Brok?']),
  classifyQuery: vi.fn(() => ({
    type: 'evergreen/explainer',
    needsSearch: true,
    reason: 'test'
  })),
  resolveQuery: vi.fn((query: string) => query),
  runSearchPipeline: mockRunSearchPipeline
}))

vi.mock('@/lib/brok/usage-tracker', () => ({
  checkUsageLimits: mockCheckUsageLimits,
  generateRequestId: () => 'req_test',
  recordUsage: mockRecordUsage,
  usageLimitResponse: () =>
    Response.json(
      { error: { code: 'usage_storage_unavailable' } },
      { status: 503 }
    )
}))

import { POST } from '../search/completions/route'

function searchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/v1/search/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any
}

function authResult() {
  return {
    success: true,
    apiKey: {
      id: 'key_1',
      userId: 'user_1',
      scopes: ['search:write'],
      allowedModels: [],
      rpmLimit: 60
    },
    workspace: { id: 'workspace_1' }
  }
}

function searchResult() {
  return {
    answer: 'Brok is an AI answer engine.',
    citations: [],
    searchQueries: 1,
    searchQueryList: ['What is Brok?'],
    tokensUsed: 12,
    resolvedQuery: 'What is Brok?',
    classification: {
      type: 'evergreen/explainer',
      needsSearch: true,
      reason: 'test'
    },
    followUps: []
  }
}

describe('POST /api/v1/search/completions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyRequestAuth.mockResolvedValue(authResult())
    mockCheckUsageLimits.mockResolvedValue({ allowed: true })
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      current: 0,
      limit: 60,
      resetAt: Math.floor(Date.now() / 1000) + 60
    })
    mockRunSearchPipeline.mockResolvedValue(searchResult())
  })

  it('rejects non-boolean stream values instead of treating strings as truthy', async () => {
    const response = await POST(
      searchRequest({
        query: 'What is Brok?',
        model: 'brok-lite',
        stream: 'false'
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      type: 'invalid_request_error',
      code: 'invalid_stream',
      message: 'stream must be a boolean.'
    })
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRunSearchPipeline).not.toHaveBeenCalled()
  })

  it('returns JSON completions when stream is explicitly false', async () => {
    const response = await POST(
      searchRequest({
        query: 'What is Brok?',
        model: 'brok-lite',
        stream: false
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(body).toMatchObject({
      id: 'req_test',
      object: 'search.completion',
      model: 'brok-lite',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Brok is an AI answer engine.'
          }
        }
      ]
    })
    expect(mockRecordRateLimitEvent).toHaveBeenCalledWith(
      'key_1',
      'workspace_1',
      'rpm',
      60,
      1,
      false
    )
  })

  it('records blocked rate-limit attempts before returning 429', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      current: 60,
      limit: 60,
      resetAt: Math.floor(Date.now() / 1000) + 60
    })

    const response = await POST(
      searchRequest({
        query: 'What is Brok?',
        model: 'brok-lite',
        stream: false
      })
    )
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.error.code).toBe('rate_limit_exceeded')
    expect(mockRecordRateLimitEvent).toHaveBeenCalledWith(
      'key_1',
      'workspace_1',
      'rpm',
      60,
      61,
      true
    )
    expect(mockRunSearchPipeline).not.toHaveBeenCalled()
  })
})
