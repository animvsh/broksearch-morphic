import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSelect, mockFrom, mockWhere, mockVerifyRequestAuth } = vi.hoisted(
  () => {
    const mockWhere = vi.fn()
    const mockFrom = vi.fn(() => ({ where: mockWhere }))
    const mockSelect = vi.fn(() => ({ from: mockFrom }))
    const mockVerifyRequestAuth = vi.fn()
    return { mockSelect, mockFrom, mockWhere, mockVerifyRequestAuth }
  }
)

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect
  }
}))

vi.mock('@/lib/db/schema-brok', () => ({
  usageEvents: {
    workspaceId: 'workspace_id',
    createdAt: 'created_at',
    inputTokens: 'input_tokens',
    outputTokens: 'output_tokens',
    cachedTokens: 'cached_tokens',
    searchQueries: 'search_queries',
    billedUsd: 'billed_usd'
  }
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

import { GET } from '../usage/route'

function usageRequest(url = 'http://localhost/api/v1/usage') {
  return {
    headers: new Headers(),
    nextUrl: new URL(url)
  } as any
}

describe('GET /api/v1/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires the usage:read scope', async () => {
    mockVerifyRequestAuth.mockResolvedValue({
      success: true,
      apiKey: { id: 'key_1', scopes: ['chat:write'] },
      workspace: { id: 'workspace_1' }
    })

    const response = await GET(usageRequest())
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('missing_scope')
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('returns usage totals for a scoped key', async () => {
    mockVerifyRequestAuth.mockResolvedValue({
      success: true,
      apiKey: { id: 'key_1', scopes: ['usage:read'] },
      workspace: { id: 'workspace_1' }
    })
    mockWhere.mockResolvedValueOnce([
      {
        totalRequests: 2,
        totalInputTokens: 10,
        totalOutputTokens: 5,
        totalCachedTokens: 1,
        totalSearchQueries: 3,
        totalBilled: '0.0123'
      }
    ])

    const response = await GET(
      usageRequest('http://localhost/api/v1/usage?period=day')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      period: 'day',
      usage: {
        requests: 2,
        input_tokens: 10,
        output_tokens: 5,
        cached_tokens: 1,
        search_queries: 3,
        billed_usd: 0.0123
      }
    })
  })
})
