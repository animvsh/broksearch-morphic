import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentAppAccess: vi.fn(),
  hasFeatureAccess: vi.fn(),
  isAppAccessGateEnabled: vi.fn(),
  getCurrentUserIdForOptionalGuestSearch: vi.fn(),
  isGuestSearchEnabled: vi.fn(),
  isGuestSearchMode: vi.fn(),
  runSearchPipeline: vi.fn(),
  checkAndEnforceOverallChatLimit: vi.fn(),
  checkAndEnforceGuestLimit: vi.fn()
}))

vi.mock('@/lib/auth/app-access', () => ({
  getCurrentAppAccess: mocks.getCurrentAppAccess,
  hasFeatureAccess: mocks.hasFeatureAccess,
  isAppAccessGateEnabled: mocks.isAppAccessGateEnabled
}))

vi.mock('@/lib/auth/guest-search', () => ({
  getCurrentUserIdForOptionalGuestSearch:
    mocks.getCurrentUserIdForOptionalGuestSearch,
  isGuestSearchEnabled: mocks.isGuestSearchEnabled,
  isGuestSearchMode: mocks.isGuestSearchMode
}))

vi.mock('@/lib/brok/search-pipeline', () => ({
  runSearchPipeline: mocks.runSearchPipeline
}))

vi.mock('@/lib/rate-limit/chat-limits', () => ({
  checkAndEnforceOverallChatLimit: mocks.checkAndEnforceOverallChatLimit
}))

vi.mock('@/lib/rate-limit/guest-limit', () => ({
  checkAndEnforceGuestLimit: mocks.checkAndEnforceGuestLimit
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/search/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.20'
    },
    body: JSON.stringify(body)
  })
}

function source() {
  return {
    id: 'src_1',
    title: 'Brok docs',
    url: 'https://docs.example.com/search',
    publisher: 'docs.example.com',
    snippet: 'Brok search docs.',
    retrievedAt: '2026-06-16T00:00:00.000Z',
    qualityScore: 91
  }
}

function result() {
  return {
    answer: 'Brok is an answer engine. [1]',
    citations: [source()],
    searchQueries: 1,
    searchQueryList: ['Brok search'],
    tokensUsed: 24,
    resolvedQuery: 'Brok search',
    classification: {
      type: 'evergreen/explainer',
      needsSearch: true,
      reason: 'test'
    },
    followUps: [
      {
        label: 'How does Brok cite sources?',
        query: 'How does Brok cite sources?'
      }
    ]
  }
}

describe('POST /api/search/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentUserIdForOptionalGuestSearch.mockResolvedValue('user_1')
    mocks.isAppAccessGateEnabled.mockReturnValue(true)
    mocks.getCurrentAppAccess.mockResolvedValue({
      allowed: true,
      user: { id: 'user_1' },
      features: 'all'
    })
    mocks.hasFeatureAccess.mockReturnValue(true)
    mocks.isGuestSearchEnabled.mockReturnValue(true)
    mocks.isGuestSearchMode.mockReturnValue(true)
    mocks.checkAndEnforceOverallChatLimit.mockResolvedValue(null)
    mocks.checkAndEnforceGuestLimit.mockResolvedValue(null)
    mocks.runSearchPipeline.mockResolvedValue(result())
  })

  it('streams session search sources before the answer without an API key', async () => {
    const earlySource = source()
    mocks.runSearchPipeline.mockImplementationOnce(async request => {
      await request.onSources?.([earlySource])
      return result()
    })

    const response = await POST(
      makeRequest({
        query: 'What is Brok search?',
        mode: 'search'
      })
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(stream).toContain('event: status')
    expect(stream).toContain('event: source')
    expect(stream).toContain('event: answer_delta')
    expect(stream.indexOf('event: source')).toBeLessThan(
      stream.indexOf('event: answer_delta')
    )
    expect(stream.match(/event: source\n/g)).toHaveLength(1)
    expect(stream).toContain('event: follow_ups')
    expect(stream).toContain('data: [DONE]')
    expect(mocks.runSearchPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'What is Brok search?',
        depth: 'standard'
      })
    )
    expect(mocks.checkAndEnforceOverallChatLimit).toHaveBeenCalledWith('user_1')
  })

  it('streams answer deltas as the pipeline writes them', async () => {
    mocks.runSearchPipeline.mockImplementationOnce(async request => {
      await request.onAnswerDelta?.('Brok ')
      await request.onAnswerDelta?.('streams.')
      return {
        ...result(),
        answer: 'Brok streams.'
      }
    })

    const response = await POST(
      makeRequest({
        query: 'What is Brok search?',
        mode: 'search'
      })
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(stream.match(/event: answer_delta\n/g)).toHaveLength(2)
    expect(stream).toContain('"delta":"Brok "')
    expect(stream).toContain('"delta":"streams."')
    expect(stream).not.toContain('"delta":"Brok streams."')
  })

  it('allows guest quick/search requests through the same gate', async () => {
    mocks.getCurrentUserIdForOptionalGuestSearch.mockResolvedValue(undefined)
    mocks.getCurrentAppAccess.mockResolvedValue({
      allowed: false,
      user: null,
      reason: 'unauthenticated'
    })

    const response = await POST(
      makeRequest({
        query: 'latest ai news',
        mode: 'quick'
      })
    )
    await response.text()

    expect(response.status).toBe(200)
    expect(mocks.checkAndEnforceGuestLimit).toHaveBeenCalledWith('203.0.113.20')
    expect(mocks.checkAndEnforceOverallChatLimit).not.toHaveBeenCalled()
    expect(mocks.runSearchPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 'lite' })
    )
  })

  it('requires auth when guest search is not allowed', async () => {
    mocks.getCurrentUserIdForOptionalGuestSearch.mockResolvedValue(undefined)
    mocks.isGuestSearchEnabled.mockReturnValue(false)
    mocks.isGuestSearchMode.mockReturnValue(false)
    mocks.getCurrentAppAccess.mockResolvedValue({
      allowed: false,
      user: null,
      reason: 'unauthenticated'
    })

    const response = await POST(
      makeRequest({
        query: 'deep research',
        mode: 'deep'
      })
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      error: 'Authentication required'
    })
    expect(mocks.runSearchPipeline).not.toHaveBeenCalled()
  })
})
