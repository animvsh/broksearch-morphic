import { NextRequest } from 'next/server'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createChatWithFirstMessage } from '@/lib/actions/chat'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getSearchStreamRequest } from '@/lib/brok/search-stream-registry'

import { POST as searchPost } from '../route'

const {
  mockCheckRateLimit,
  mockCheckUsageLimits,
  mockPostSearchCompletion,
  mockRecordRateLimitEvent,
  mockVerifyRequestAuth
} = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockCheckUsageLimits: vi.fn(),
  mockPostSearchCompletion: vi.fn(),
  mockRecordRateLimitEvent: vi.fn(),
  mockVerifyRequestAuth: vi.fn()
}))

const originalCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT
const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL
const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
const originalDatabaseUrl = process.env.DATABASE_URL
const originalRestrictedDatabaseUrl = process.env.DATABASE_RESTRICTED_URL

vi.mock('@/lib/brok/auth', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/brok/auth')>()
  return {
    ...actual,
    verifyRequestAuth: mockVerifyRequestAuth,
    apiKeyHasScope: (apiKey: { scopes?: string[] }, scope: string) =>
      Array.isArray(apiKey.scopes) &&
      (apiKey.scopes.includes(scope) || apiKey.scopes.includes('*'))
  }
})

vi.mock('@/lib/brok/rate-limiter', () => ({
  checkRateLimit: mockCheckRateLimit,
  recordRateLimitEvent: mockRecordRateLimitEvent
}))

vi.mock('@/lib/brok/usage-tracker', () => ({
  checkUsageLimits: mockCheckUsageLimits,
  usageLimitResponse: (result: {
    code: string
    message: string
    status: number
  }) =>
    Response.json(
      {
        error: {
          type:
            result.status === 429
              ? 'rate_limit_error'
              : result.status === 402
                ? 'billing_error'
                : 'server_error',
          code: result.code,
          message: result.message
        }
      },
      { status: result.status }
    )
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn()
}))

vi.mock('@/lib/actions/chat', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/actions/chat')>()
  return {
    ...actual,
    createChatWithFirstMessage: vi.fn()
  }
})

vi.mock('@/lib/db/schema', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/schema')>()
  return {
    ...actual,
    generateId: vi.fn(() => 'id-1')
  }
})

vi.mock('@/app/api/v1/search/completions/route', () => ({
  POST: async (request: Request) => mockPostSearchCompletion(request)
}))

function makeRequest(body: unknown, contentType = 'application/json') {
  return new NextRequest('http://localhost/api/search', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

function authSuccess(userId = 'api_user_1') {
  return {
    success: true as const,
    apiKey: {
      id: 'key_1',
      userId,
      scopes: ['search:write'],
      allowedModels: [],
      rpmLimit: 60
    },
    workspace: {
      id: 'ws_1'
    }
  }
}

describe('POST /api/search', () => {
  beforeEach(() => {
    delete process.env.BROK_CLOUD_DEPLOYMENT
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.DATABASE_URL
    delete process.env.DATABASE_RESTRICTED_URL

    mockVerifyRequestAuth.mockReset()
    mockVerifyRequestAuth.mockResolvedValue(authSuccess())
    mockCheckUsageLimits.mockReset()
    mockCheckUsageLimits.mockResolvedValue({ allowed: true })
    mockCheckRateLimit.mockReset()
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      current: 0,
      limit: 60,
      resetAt: Math.floor(Date.now() / 1000) + 60
    })
    mockRecordRateLimitEvent.mockReset()

    mockPostSearchCompletion.mockReset()
    vi.mocked(getCurrentUserId).mockReset()
    vi.mocked(getCurrentUserId).mockResolvedValue('user_1')
    vi.mocked(createChatWithFirstMessage).mockReset()
    vi.mocked(createChatWithFirstMessage).mockResolvedValue({
      chat: { id: 'thr_id' } as never,
      message: { id: 'msg-1' } as never
    })
  })

  afterEach(() => {
    process.env.BROK_CLOUD_DEPLOYMENT = originalCloudDeployment
    process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl
    process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken
    process.env.DATABASE_URL = originalDatabaseUrl
    process.env.DATABASE_RESTRICTED_URL = originalRestrictedDatabaseUrl
  })

  it('returns 401 for missing authorization', async () => {
    mockVerifyRequestAuth.mockResolvedValueOnce({
      success: false,
      error: 'missing_authorization',
      status: 401
    })

    const response = await searchPost(makeRequest({ query: 'what is brok?' }))

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        type: 'authentication_error',
        code: 'missing_authorization'
      }
    })
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('returns 403 when API key is missing search:write scope', async () => {
    mockVerifyRequestAuth.mockResolvedValueOnce({
      success: true,
      apiKey: {
        id: 'key_1',
        userId: 'user_1',
        scopes: ['chat:write']
      },
      workspace: {
        id: 'ws_1'
      }
    })

    const response = await searchPost(makeRequest({ query: 'what is brok?' }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toMatchObject({
      error: {
        type: 'permission_error',
        code: 'missing_scope'
      }
    })
  })

  it('returns 400 for invalid JSON payloads', async () => {
    const response = await searchPost(makeRequest('{bad json}'))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'invalid_json'
      }
    })
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('returns 400 when query is missing', async () => {
    const response = await searchPost(makeRequest({ model: 'brok-search' }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'missing_query',
        message: 'query must be a non-empty string.'
      }
    })
    expect(createChatWithFirstMessage).not.toHaveBeenCalled()
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
    expect(mockCheckUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
  })

  it('rejects non-string models before usage, rate, or thread work', async () => {
    const response = await searchPost(
      makeRequest({
        query: 'what is brok?',
        model: 123,
        stream: true
      })
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'invalid_model',
        message: 'model must be a string.'
      }
    })
    expect(mockCheckUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(createChatWithFirstMessage).not.toHaveBeenCalled()
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('rejects invalid search depth before creating a thread or stream URL', async () => {
    const response = await searchPost(
      makeRequest({
        query: 'what is brok?',
        stream: true,
        search_depth: 'expensive'
      })
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'invalid_search_depth'
      }
    })
    expect(body).not.toHaveProperty('stream_url')
    expect(mockCheckUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(createChatWithFirstMessage).not.toHaveBeenCalled()
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('rejects non-search models before creating a thread or stream URL', async () => {
    const response = await searchPost(
      makeRequest({
        query: 'what is brok?',
        model: 'brok-code',
        stream: true
      })
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'invalid_model'
      }
    })
    expect(body).not.toHaveProperty('stream_url')
    expect(mockCheckUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(createChatWithFirstMessage).not.toHaveBeenCalled()
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('rejects disallowed search models before creating a thread or stream URL', async () => {
    mockVerifyRequestAuth.mockResolvedValueOnce({
      ...authSuccess(),
      apiKey: {
        ...authSuccess().apiKey,
        allowedModels: ['brok-fast']
      }
    })

    const response = await searchPost(
      makeRequest({
        query: 'what is brok?',
        model: 'brok-search',
        stream: true
      })
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'model_not_allowed'
      }
    })
    expect(body).not.toHaveProperty('stream_url')
    expect(mockCheckUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(createChatWithFirstMessage).not.toHaveBeenCalled()
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('rejects over-budget stream requests before creating a thread or stream URL', async () => {
    mockCheckUsageLimits.mockResolvedValueOnce({
      allowed: false,
      code: 'workspace_monthly_budget_exceeded',
      message: 'Workspace monthly budget exceeded.',
      status: 402
    })

    const response = await searchPost(
      makeRequest({
        query: 'what is brok?',
        model: 'brok-search',
        stream: true
      })
    )
    const body = await response.json()

    expect(response.status).toBe(402)
    expect(body).toMatchObject({
      error: {
        code: 'workspace_monthly_budget_exceeded'
      }
    })
    expect(body).not.toHaveProperty('stream_url')
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(createChatWithFirstMessage).not.toHaveBeenCalled()
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('rejects rate-limited stream requests before creating a thread or stream URL', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      current: 60,
      limit: 60,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      reason: 'rate_limit_exceeded'
    })

    const response = await searchPost(
      makeRequest({
        query: 'what is brok?',
        model: 'brok-search',
        stream: true
      })
    )
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body).toMatchObject({
      error: {
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded'
      }
    })
    expect(body).not.toHaveProperty('stream_url')
    expect(mockRecordRateLimitEvent).toHaveBeenCalledWith(
      'key_1',
      'ws_1',
      'rpm',
      60,
      61,
      true
    )
    expect(createChatWithFirstMessage).not.toHaveBeenCalled()
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('forwards stream=false requests to /api/v1/search/completions', async () => {
    mockPostSearchCompletion.mockImplementation(async (forwarded: Request) => {
      const payload = await forwarded.json()
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    })

    const response = await searchPost(
      makeRequest({
        query: '  hello world  ',
        model: 'brok-search',
        stream: false
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      model: 'brok-search',
      query: 'hello world',
      depth: 'standard',
      stream: false
    })
    expect(mockPostSearchCompletion).toHaveBeenCalledTimes(1)
  })

  it('keeps /api/search strict domain normalization when forwarding', async () => {
    mockPostSearchCompletion.mockImplementation(async (forwarded: Request) => {
      const payload = await forwarded.json()
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    })

    const response = await searchPost(
      makeRequest({
        query: 'domain compatibility',
        stream: false,
        domains: ['brok.fyi', 42]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).not.toHaveProperty('domains')
  })

  it('returns PRD-style thread/message/stream_url envelope when stream is true', async () => {
    const response = await searchPost(
      makeRequest({ query: 'Brok is awesome?', stream: true, mode: 'search' })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      thread_id: expect.stringContaining('thr_'),
      message_id: expect.stringContaining('msg_'),
      stream_url: expect.stringContaining('/api/search/stream/msg_')
    })
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()

    const saved = await getSearchStreamRequest(body.message_id)
    expect(saved).toBeTruthy()
    expect(saved?.body).toMatchObject({
      query: 'Brok is awesome?',
      model: 'brok-search',
      stream: true,
      depth: 'standard'
    })
    expect(saved?.thread).toMatchObject({
      id: body.thread_id,
      userId: 'user_1',
      userMessageId: 'id-1'
    })
    expect(createChatWithFirstMessage).toHaveBeenCalledWith(
      body.thread_id,
      {
        id: 'id-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Brok is awesome?' }]
      },
      'user_1',
      'Brok is awesome?'
    )
    expect(mockRecordRateLimitEvent).not.toHaveBeenCalled()
  })

  it('returns PRD-style envelope when stream is omitted', async () => {
    const response = await searchPost(
      makeRequest({ query: 'Brok search behavior default stream' })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      thread_id: expect.stringContaining('thr_'),
      message_id: expect.stringContaining('msg_'),
      stream_url: expect.stringContaining('/api/search/stream/msg_')
    })
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('returns 503 instead of unsafe stream URLs when cloud registry storage is missing', async () => {
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.DATABASE_URL
    delete process.env.DATABASE_RESTRICTED_URL

    const response = await searchPost(
      makeRequest({ query: 'cloud stream needs durable storage', stream: true })
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      error: {
        code: 'search_stream_registry_unavailable'
      }
    })
    expect(body).not.toHaveProperty('stream_url')
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('falls back to API key user id when session user is missing', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(undefined)

    const response = await searchPost(
      makeRequest({ query: 'search from API key user', stream: true })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    const saved = await getSearchStreamRequest(body.message_id)
    expect(saved?.thread).toMatchObject({
      id: body.thread_id,
      userId: 'api_user_1',
      userMessageId: 'id-1'
    })
    expect(createChatWithFirstMessage).toHaveBeenCalledWith(
      body.thread_id,
      expect.objectContaining({ id: 'id-1', role: 'user' }),
      'api_user_1',
      'search from API key user'
    )
  })
})
