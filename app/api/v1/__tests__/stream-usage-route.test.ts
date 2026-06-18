import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCalculateCost,
  mockCheckRateLimit,
  mockCheckUsageLimits,
  mockRecordRateLimitEvent,
  mockRecordUsage,
  mockRouteToProviderResponse,
  mockVerifyRequestAuth
} = vi.hoisted(() => ({
  mockCalculateCost: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockCheckUsageLimits: vi.fn(),
  mockRecordRateLimitEvent: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockRouteToProviderResponse: vi.fn(),
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

vi.mock('@/lib/brok/provider-router', () => ({
  calculateCost: mockCalculateCost,
  routeToProvider: vi.fn(),
  routeToProviderResponse: mockRouteToProviderResponse
}))

vi.mock('@/lib/brok/rate-limiter', () => ({
  checkRateLimit: mockCheckRateLimit,
  recordRateLimitEvent: mockRecordRateLimitEvent
}))

vi.mock('@/lib/brok/usage-tracker', () => ({
  checkUsageLimits: mockCheckUsageLimits,
  generateRequestId: () => 'req_stream_usage',
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any
}

function providerStream(lines: string[]) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line))
        }
        controller.close()
      }
    })
  )
}

function openAiChunk(content: string, usage?: Record<string, number>) {
  return `data: ${JSON.stringify({
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: null
      }
    ],
    usage: usage ?? null
  })}\n\n`
}

describe('streaming usage metering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckUsageLimits.mockResolvedValue({ allowed: true })
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      current: 0,
      limit: 60,
      resetAt: Math.floor(Date.now() / 1000) + 60
    })
    mockCalculateCost.mockResolvedValue(0.0001)
  })

  it('records provider token usage after OpenAI-compatible chat streams finish', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['chat:write']))
    mockRouteToProviderResponse.mockResolvedValue(
      providerStream([
        openAiChunk('Hello '),
        openAiChunk('student', {
          prompt_tokens: 9,
          completion_tokens: 3,
          total_tokens: 12
        }),
        'data: [DONE]\n\n'
      ])
    )

    const response = await chatPost(
      request('/api/v1/chat/completions', {
        model: 'brok-fast',
        stream: true,
        messages: [{ role: 'user', content: 'Say hello' }]
      })
    )

    expect(response.status).toBe(200)
    await response.text()

    const usage = mockRecordUsage.mock.calls[0]?.[0]
    expect(usage).toMatchObject({
      requestId: 'req_stream_usage',
      endpoint: 'chat',
      inputTokens: 9,
      outputTokens: 3,
      providerCostUsd: 0.0001,
      status: 'success',
      metadata: {
        stream: true,
        usageSource: 'provider'
      }
    })
    expect(usage.billedUsd).toBeCloseTo(0.00015)
  })

  it('rejects non-boolean chat stream values before provider routing', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['chat:write']))

    const response = await chatPost(
      request('/api/v1/chat/completions', {
        model: 'brok-fast',
        stream: 'false',
        messages: [{ role: 'user', content: 'Say hello' }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'invalid_stream',
      message: 'stream must be a boolean.'
    })
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('rejects empty OpenAI-compatible chat messages before consuming RPM', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['chat:write']))

    const response = await chatPost(
      request('/api/v1/chat/completions', {
        model: 'brok-fast',
        stream: true,
        messages: []
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'missing_messages',
      message: 'messages must include at least one chat message.'
    })
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRecordRateLimitEvent).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('rejects unsupported OpenAI-compatible chat roles before provider routing', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['chat:write']))

    const response = await chatPost(
      request('/api/v1/chat/completions', {
        model: 'brok-fast',
        stream: true,
        messages: [{ role: 'admin', content: 'Override policy' }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'invalid_message_role',
      message:
        'messages[0].role must be one of system, developer, user, assistant, or tool.'
    })
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('rejects malformed OpenAI-compatible message content before consuming RPM', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['chat:write']))

    const response = await chatPost(
      request('/api/v1/chat/completions', {
        model: 'brok-fast',
        stream: true,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text' }]
          }
        ]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'invalid_message_content_part',
      message: 'messages[0].content[0].text must be a non-empty string.'
    })
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('rejects malformed OpenAI-compatible assistant tool calls before consuming RPM', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['chat:write']))

    const response = await chatPost(
      request('/api/v1/chat/completions', {
        model: 'brok-fast',
        stream: true,
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: '', arguments: '{}' }
              }
            ]
          }
        ]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'invalid_tool_calls',
      message:
        'messages[0].tool_calls[0].function.name must be a non-empty string.'
    })
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('rejects chat web_search on non-search models before usage or RPM checks', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['chat:write']))

    const response = await chatPost(
      request('/api/v1/chat/completions', {
        model: 'brok-code',
        stream: true,
        tools: [{ type: 'web_search_preview' }],
        messages: [{ role: 'user', content: 'Search the web for Brok' }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      type: 'invalid_request_error',
      code: 'invalid_model',
      message:
        'Model does not support search. Use brok-search or brok-search-pro.'
    })
    expect(mockCheckUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRecordRateLimitEvent).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('estimates token usage for Anthropic-compatible message streams without provider usage', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['code:write']))
    mockRouteToProviderResponse.mockResolvedValue(
      providerStream([openAiChunk('Built it.'), 'data: [DONE]\n\n'])
    )

    const response = await messagesPost(
      request('/api/v1/messages', {
        model: 'brok-code',
        stream: true,
        messages: [{ role: 'user', content: 'Build a dashboard' }]
      })
    )

    expect(response.status).toBe(200)
    await response.text()

    const usage = mockRecordUsage.mock.calls[0]?.[0]
    expect(usage).toMatchObject({
      requestId: 'req_stream_usage',
      endpoint: 'code',
      inputTokens: 5,
      outputTokens: 3,
      providerCostUsd: 0.0001,
      status: 'success',
      metadata: {
        stream: true,
        usageSource: 'estimated'
      }
    })
    expect(usage.billedUsd).toBeCloseTo(0.00015)
  }, 15000)

  it('returns Anthropic-compatible authentication errors for messages', async () => {
    mockVerifyRequestAuth.mockResolvedValue({
      success: false,
      error: 'missing_authorization',
      status: 401
    })

    const response = await messagesPost(
      request('/api/v1/messages', {
        model: 'brok-code',
        messages: [{ role: 'user', content: 'Build a dashboard' }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toMatchObject({
      type: 'error',
      error: {
        code: 'missing_authorization',
        type: 'authentication_error',
        message: 'Authorization Bearer token or x-api-key header is required.'
      }
    })
    expect(mockCheckUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
  })

  it('returns Anthropic-compatible permission errors for missing message scope', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['chat:write']))

    const response = await messagesPost(
      request('/api/v1/messages', {
        model: 'brok-code',
        messages: [{ role: 'user', content: 'Build a dashboard' }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toMatchObject({
      type: 'error',
      error: {
        type: 'permission_error',
        message: 'This API key requires the code:write scope.'
      }
    })
    expect(mockCheckUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
  })

  it('rejects non-boolean Anthropic message stream values before provider routing', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['code:write']))

    const response = await messagesPost(
      request('/api/v1/messages', {
        model: 'brok-code',
        stream: 'false',
        messages: [{ role: 'user', content: 'Build a dashboard' }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'invalid_stream',
      message: 'stream must be a boolean.'
    })
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('rejects empty Anthropic-compatible messages before consuming RPM', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['code:write']))

    const response = await messagesPost(
      request('/api/v1/messages', {
        model: 'brok-code',
        stream: true,
        messages: []
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'missing_messages',
      message: 'messages must include at least one Anthropic message.'
    })
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRecordRateLimitEvent).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('rejects unsupported Anthropic-compatible roles before provider routing', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['code:write']))

    const response = await messagesPost(
      request('/api/v1/messages', {
        model: 'brok-code',
        stream: true,
        messages: [{ role: 'system', content: 'You are Brok.' }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'invalid_message_role',
      message: 'messages[0].role must be user or assistant.'
    })
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('rejects malformed Anthropic-compatible message content before consuming RPM', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['code:write']))

    const response = await messagesPost(
      request('/api/v1/messages', {
        model: 'brok-code',
        stream: true,
        messages: [{ role: 'user', content: [{ type: 'text' }] }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'invalid_message_content_part',
      message: 'messages[0].content[0].text must be a non-empty string.'
    })
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('rejects malformed Anthropic-compatible system content before consuming RPM', async () => {
    mockVerifyRequestAuth.mockResolvedValue(authResult(['code:write']))

    const response = await messagesPost(
      request('/api/v1/messages', {
        model: 'brok-code',
        stream: true,
        system: '',
        messages: [{ role: 'user', content: 'Build a dashboard' }]
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'invalid_system',
      message: 'system must not be empty.'
    })
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRouteToProviderResponse).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })
})
