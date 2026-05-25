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
})
