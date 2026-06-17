import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentAppAccess: vi.fn(),
  hasFeatureAccess: vi.fn(),
  isAppAccessGateEnabled: vi.fn(),
  getCurrentUserIdForOptionalGuestSearch: vi.fn(),
  isGuestSearchEnabled: vi.fn(),
  isGuestSearchMode: vi.fn(),
  generateFollowUps: vi.fn(),
  getCachedSearchPipelineResponse: vi.fn(),
  runSearchPipeline: vi.fn(),
  checkAndEnforceOverallChatLimit: vi.fn(),
  checkAndEnforceGuestLimit: vi.fn(),
  cookies: vi.fn(),
  selectModel: vi.fn()
}))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies
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
  buildSearchQueries: vi.fn(() => ['What is Brok search?']),
  classifyQuery: vi.fn(() => ({
    type: 'evergreen/explainer',
    needsSearch: true,
    reason: 'test'
  })),
  generateFollowUps: mocks.generateFollowUps,
  getCachedSearchPipelineResponse: mocks.getCachedSearchPipelineResponse,
  resolveQuery: vi.fn((query: string) => query),
  runSearchPipeline: mocks.runSearchPipeline
}))

vi.mock('@/lib/rate-limit/chat-limits', () => ({
  checkAndEnforceOverallChatLimit: mocks.checkAndEnforceOverallChatLimit
}))

vi.mock('@/lib/rate-limit/guest-limit', () => ({
  checkAndEnforceGuestLimit: mocks.checkAndEnforceGuestLimit
}))

vi.mock('@/lib/utils/model-selection', () => ({
  selectModel: mocks.selectModel
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
    mocks.getCachedSearchPipelineResponse.mockReturnValue(null)
    mocks.checkAndEnforceOverallChatLimit.mockResolvedValue(null)
    mocks.checkAndEnforceGuestLimit.mockResolvedValue(null)
    mocks.cookies.mockResolvedValue({
      get: vi.fn()
    })
    mocks.selectModel.mockResolvedValue({
      id: 'brok-m2-7-highspeed',
      name: 'Brok Fast',
      providerId: 'openai-compatible'
    })
    mocks.generateFollowUps.mockImplementation(
      (
        query: string,
        _classification: unknown,
        citations: Array<{ publisher?: string }>
      ) => [
        {
          label: `Ask about ${citations[0]?.publisher}`,
          query: `What does ${citations[0]?.publisher} specifically say about ${query.replace(/[?.!]+$/, '')}?`
        }
      ]
    )
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
    expect(stream).toContain('event: query_resolved')
    expect(stream).toContain('event: search_started')
    expect(stream).toContain('"classification":{"type":"evergreen/explainer"')
    expect(stream).toContain('"search_queries":["What is Brok search?"]')
    expect(stream).toContain('event: source')
    expect(stream).toContain('event: answer_delta')
    expect(stream.indexOf('event: query_resolved')).toBeLessThan(
      stream.indexOf('event: source')
    )
    expect(stream.indexOf('event: search_started')).toBeLessThan(
      stream.indexOf('event: source')
    )
    expect(stream.indexOf('event: source')).toBeLessThan(
      stream.indexOf('event: answer_delta')
    )
    expect(stream.match(/event: source\n/g)).toHaveLength(1)
    expect(stream).toContain('event: follow_ups')
    expect(stream).toContain('data: [DONE]')
    expect(mocks.runSearchPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'What is Brok search?',
        depth: 'standard',
        synthesisModel: 'brok-m2-7-highspeed'
      })
    )
    expect(mocks.checkAndEnforceOverallChatLimit).toHaveBeenCalledWith('user_1')
  })

  it('streams the selected search answer model and uses it in the pipeline', async () => {
    mocks.selectModel.mockResolvedValueOnce({
      id: 'brok-m2-5-highspeed',
      name: 'Brok 2.5 Fast',
      providerId: 'openai-compatible'
    })

    const response = await POST(
      makeRequest({
        query: 'What is Brok search?',
        mode: 'search'
      })
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(mocks.getCachedSearchPipelineResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        synthesisModel: 'brok-m2-5-highspeed'
      })
    )
    expect(mocks.runSearchPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        synthesisModel: 'brok-m2-5-highspeed'
      })
    )
    expect(stream).toContain('"answer_model"')
    expect(stream).toContain('"id":"brok-m2-5-highspeed"')
    expect(stream).toContain('"name":"Brok 2.5 Fast"')
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
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(mocks.checkAndEnforceGuestLimit).toHaveBeenCalledWith('203.0.113.20')
    expect(mocks.checkAndEnforceOverallChatLimit).not.toHaveBeenCalled()
    expect(mocks.runSearchPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 'lite' })
    )
  })

  it('serves cached guest quick searches without charging the guest limit', async () => {
    mocks.getCurrentUserIdForOptionalGuestSearch.mockResolvedValue(undefined)
    mocks.getCurrentAppAccess.mockResolvedValue({
      allowed: false,
      user: null,
      reason: 'unauthenticated'
    })
    mocks.getCachedSearchPipelineResponse.mockReturnValue(result())

    const response = await POST(
      makeRequest({
        query: 'What is Brok search?',
        mode: 'quick'
      })
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(stream).toContain('event: source')
    expect(stream).toContain('event: answer_delta')
    expect(mocks.checkAndEnforceGuestLimit).not.toHaveBeenCalled()
    expect(mocks.checkAndEnforceOverallChatLimit).not.toHaveBeenCalled()
    expect(mocks.runSearchPipeline).not.toHaveBeenCalled()
  })

  it('serves cached signed-in searches without charging the chat limit', async () => {
    mocks.getCachedSearchPipelineResponse.mockReturnValue(result())

    const response = await POST(
      makeRequest({
        query: 'What is Brok search?',
        mode: 'search'
      })
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(mocks.checkAndEnforceOverallChatLimit).not.toHaveBeenCalled()
    expect(mocks.checkAndEnforceGuestLimit).not.toHaveBeenCalled()
    expect(mocks.runSearchPipeline).not.toHaveBeenCalled()
  })

  it('passes compact prior-turn context into follow-up search pipeline queries', async () => {
    const response = await POST(
      makeRequest({
        query: 'What about pricing?',
        mode: 'search',
        context: [
          {
            query: 'Compare Cursor vs Windsurf',
            answer:
              'Cursor is stronger for agentic coding. Windsurf is cheaper.'
          }
        ]
      })
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(mocks.runSearchPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining(
          'Current follow-up question: What about pricing?'
        )
      })
    )
    expect(mocks.runSearchPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining('Compare Cursor vs Windsurf')
      })
    )
    expect(mocks.getCachedSearchPipelineResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining('Previous turn 1 question')
      })
    )
    expect(mocks.generateFollowUps).toHaveBeenCalledWith(
      'What about pricing?',
      expect.objectContaining({ type: 'evergreen/explainer' }),
      [
        expect.objectContaining({
          title: 'Brok docs',
          publisher: 'docs.example.com',
          url: 'https://docs.example.com/search'
        })
      ]
    )
    expect(stream).toContain('Ask about docs.example.com')
    expect(stream).toContain(
      'What does docs.example.com specifically say about What about pricing?'
    )
    expect(stream).not.toContain('Answer the current follow-up question')
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
