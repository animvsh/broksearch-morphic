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
  UsageRecordError: class UsageRecordError extends Error {},
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

  it('rejects unsupported search_depth values before consuming RPM', async () => {
    const response = await POST(
      searchRequest({
        query: 'What is Brok?',
        model: 'brok-lite',
        stream: false,
        search_depth: 'expensive'
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      type: 'invalid_request_error',
      code: 'invalid_search_depth',
      message:
        'search_depth must be one of lite, standard, deep, basic, quick, or advanced.'
    })
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRecordRateLimitEvent).not.toHaveBeenCalled()
    expect(mockRunSearchPipeline).not.toHaveBeenCalled()
  })

  it('maps compatibility search_depth aliases to supported internal depths', async () => {
    const response = await POST(
      searchRequest({
        query: 'What is Brok?',
        model: 'brok-lite',
        stream: false,
        search_depth: 'basic'
      })
    )

    expect(response.status).toBe(200)
    expect(mockRunSearchPipeline).toHaveBeenCalledWith({
      query: 'What is Brok?',
      depth: 'lite',
      recencyDays: undefined,
      domains: undefined
    })
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

  it('returns usage_storage_unavailable when a non-stream ledger write fails closed', async () => {
    const { UsageRecordError } = await import('@/lib/brok/usage-tracker')
    mockRecordUsage.mockRejectedValueOnce(
      new UsageRecordError('usage ledger unavailable')
    )

    const response = await POST(
      searchRequest({
        query: 'What is Brok?',
        model: 'brok-lite',
        stream: false
      })
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(response.headers.get('X-Brok-Request-Id')).toBe('req_test')
    expect(body.error).toMatchObject({
      type: 'service_unavailable',
      code: 'usage_storage_unavailable'
    })
  })

  it('streams canonical PRD search events alongside compatibility events', async () => {
    const earlySource = {
      id: 'src_1',
      title: 'Brok Docs',
      url: 'https://docs.example.com/brok',
      publisher: 'docs.example.com',
      snippet: 'Brok documentation',
      retrievedAt: '2026-06-01T00:00:00.000Z',
      qualityScore: 91
    }
    mockRunSearchPipeline.mockImplementationOnce(async request => {
      await request.onSources?.([earlySource])
      return {
        ...searchResult(),
        answer: 'Brok cites sources as it writes.',
        citations: [earlySource],
        followUps: [
          {
            label: 'How does Brok cite sources?',
            query: 'How does Brok cite sources?'
          }
        ]
      }
    })

    const response = await POST(
      searchRequest({
        query: 'What is Brok?',
        model: 'brok-lite',
        stream: true
      })
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(stream).toContain('event: status')
    expect(stream).toContain('event: query')
    expect(stream).toContain('event: source')
    expect(stream).toContain('event: answer_delta')
    expect(stream.indexOf('event: source')).toBeLessThan(
      stream.indexOf('event: answer_delta')
    )
    expect(stream.match(/event: source\n/g)).toHaveLength(1)
    expect(stream).toContain('"text":"Brok cites sources as it writes."')
    expect(stream).toContain('event: citation')
    expect(stream).toContain('"citation_number":1')
    expect(stream).toContain('event: follow_ups')
    expect(stream).toContain('"items":[{"label":"How does Brok cite sources?"')
    expect(stream).toContain('event: done')
    expect(stream).toContain('event: search.step')
    expect(stream).toContain('event: follow_ups_generated')
    expect(stream).toContain('data: [DONE]')
  })

  it('streams incremental answer deltas without duplicating the final answer', async () => {
    mockRunSearchPipeline.mockImplementationOnce(async request => {
      await request.onAnswerDelta?.('Brok ')
      await request.onAnswerDelta?.('streams answers.')
      return {
        ...searchResult(),
        answer: 'Brok streams answers.'
      }
    })

    const response = await POST(
      searchRequest({
        query: 'What is Brok?',
        model: 'brok-lite',
        stream: true
      })
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(stream.match(/event: answer_delta\n/g)).toHaveLength(2)
    expect(stream).toContain('"delta":"Brok "')
    expect(stream).toContain('"delta":"streams answers."')
    expect(stream).not.toContain('"delta":"Brok streams answers."')
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
