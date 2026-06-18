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
  isFirstPartyBrokSearchQuery: vi.fn(),
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
  isFirstPartyBrokSearchQuery: mocks.isFirstPartyBrokSearchQuery,
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
    mocks.isFirstPartyBrokSearchQuery.mockReturnValue(false)
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

  it('rejects invalid depth before cache, rate limit, or search pipeline work', async () => {
    const response = await POST(
      makeRequest({
        query: 'What is Brok search?',
        mode: 'search',
        depth: 'expensive'
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
    expect(mocks.selectModel).not.toHaveBeenCalled()
    expect(mocks.getCachedSearchPipelineResponse).not.toHaveBeenCalled()
    expect(mocks.checkAndEnforceOverallChatLimit).not.toHaveBeenCalled()
    expect(mocks.checkAndEnforceGuestLimit).not.toHaveBeenCalled()
    expect(mocks.runSearchPipeline).not.toHaveBeenCalled()
  })

  it('rejects invalid search_depth before cache, rate limit, or search pipeline work', async () => {
    const response = await POST(
      makeRequest({
        query: 'What is Brok search?',
        mode: 'search',
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
    expect(mocks.selectModel).not.toHaveBeenCalled()
    expect(mocks.getCachedSearchPipelineResponse).not.toHaveBeenCalled()
    expect(mocks.checkAndEnforceOverallChatLimit).not.toHaveBeenCalled()
    expect(mocks.checkAndEnforceGuestLimit).not.toHaveBeenCalled()
    expect(mocks.runSearchPipeline).not.toHaveBeenCalled()
  })

  it.each([
    ['depth quick alias', { depth: 'quick' }, 'lite'],
    ['search_depth basic alias', { search_depth: 'basic' }, 'lite'],
    ['mode quick alias', { mode: 'quick' }, 'lite'],
    ['depth deep alias', { depth: 'deep' }, 'deep'],
    ['search_depth advanced alias', { search_depth: 'advanced' }, 'deep'],
    ['mode deep alias', { mode: 'deep' }, 'deep']
  ])('maps %s to %s', async (_label, input, expectedDepth) => {
    const response = await POST(
      makeRequest({
        query: 'What is Brok search?',
        mode: 'search',
        ...input
      })
    )
    await response.text()

    expect(response.status).toBe(200)
    expect(mocks.runSearchPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        depth: expectedDepth
      })
    )
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

  it('falls back to a supported search model when the saved model is unsupported', async () => {
    mocks.selectModel
      .mockResolvedValueOnce({
        id: 'gpt-4o',
        name: 'GPT-4o',
        providerId: 'openai'
      })
      .mockResolvedValueOnce({
        id: 'brok-m2-7-highspeed',
        name: 'Brok Fast',
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
    expect(mocks.selectModel).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        searchMode: 'search',
        cookieStore: expect.anything()
      })
    )
    expect(mocks.selectModel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        searchMode: 'search'
      })
    )
    expect(mocks.getCachedSearchPipelineResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        synthesisModel: 'brok-m2-7-highspeed'
      })
    )
    expect(mocks.runSearchPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        synthesisModel: 'brok-m2-7-highspeed'
      })
    )
    expect(stream).toContain('"answer_model"')
    expect(stream).toContain('"id":"brok-m2-7-highspeed"')
    expect(stream).toContain('"name":"Brok Fast"')
    expect(stream).not.toContain('GPT-4o')
    expect(stream).not.toContain('gpt-4o')
  })

  it('keeps follow-up context out of provider search queries', async () => {
    const response = await POST(
      makeRequest({
        query: 'How does it cite sources?',
        mode: 'search',
        context: [
          {
            query: 'What is Brok Search?',
            answer:
              'Brok Search returns cited answers with source cards and follow-ups.'
          }
        ]
      })
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(mocks.getCachedSearchPipelineResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'How does it cite sources?',
        context: [
          {
            query: 'What is Brok Search?',
            answer:
              'Brok Search returns cited answers with source cards and follow-ups.'
          }
        ]
      })
    )
    expect(mocks.runSearchPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'How does it cite sources?',
        context: [
          {
            query: 'What is Brok Search?',
            answer:
              'Brok Search returns cited answers with source cards and follow-ups.'
          }
        ]
      })
    )
    expect(stream).toContain('"search_queries":["What is Brok search?"]')
    expect(
      JSON.stringify(mocks.runSearchPipeline.mock.calls[0]?.[0])
    ).not.toContain('Previous turn')
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

  it('flushes initial progress before the search pipeline resolves', async () => {
    let resolvePipeline!: (value: ReturnType<typeof result>) => void
    mocks.runSearchPipeline.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolvePipeline = resolve
        })
    )

    const response = await POST(
      makeRequest({
        query: 'What is Brok search?',
        mode: 'search'
      })
    )
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()
    const decoder = new TextDecoder()

    const firstChunk = await reader!.read()
    const chunks = [decoder.decode(firstChunk.value)]

    expect(firstChunk.done).toBe(false)
    expect(chunks[0]).toContain('event: status')

    while (!chunks.join('').includes('event: search_started')) {
      const next = await reader!.read()
      expect(next.done).toBe(false)
      chunks.push(decoder.decode(next.value))
    }

    const earlyProgress = chunks.join('')
    expect(earlyProgress).toContain('event: query_resolved')
    expect(earlyProgress).toContain('event: search_started')
    expect(earlyProgress).not.toContain('event: answer_delta')

    resolvePipeline(result())
    while (true) {
      const next = await reader!.read()
      if (next.done) break
      chunks.push(decoder.decode(next.value))
    }

    expect(chunks.join('')).toContain('event: answer_delta')
  })

  it('labels first-party Brok product context without claiming a web search', async () => {
    mocks.isFirstPartyBrokSearchQuery.mockReturnValueOnce(true)

    const response = await POST(
      makeRequest({
        query: 'What is Brok Search?',
        mode: 'quick'
      })
    )
    const stream = await response.text()

    expect(response.status).toBe(200)
    expect(stream).toContain('"message":"Loading Brok product context"')
    expect(stream).not.toContain('"message":"Searching web"')
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
    expect(stream).toContain('"message":"Loading cached answer"')
    expect(stream).not.toContain('"message":"Searching web"')
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

  it('passes compact prior-turn context separately from follow-up search query', async () => {
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
        query: 'What about pricing?',
        context: [
          {
            query: 'Compare Cursor vs Windsurf',
            answer:
              'Cursor is stronger for agentic coding. Windsurf is cheaper.'
          }
        ]
      })
    )
    expect(mocks.getCachedSearchPipelineResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'What about pricing?',
        context: [
          {
            query: 'Compare Cursor vs Windsurf',
            answer:
              'Cursor is stronger for agentic coding. Windsurf is cheaper.'
          }
        ]
      })
    )
    expect(mocks.generateFollowUps).not.toHaveBeenCalled()
    expect(stream).toContain('Go deeper on What about pricing?')
    expect(stream).toContain('Compare options for What about pricing?')
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
    expect(mocks.checkAndEnforceGuestLimit).not.toHaveBeenCalled()
    expect(mocks.runSearchPipeline).not.toHaveBeenCalled()
  })

  it('requires auth for guest deep search even when guest search is enabled', async () => {
    mocks.getCurrentUserIdForOptionalGuestSearch.mockResolvedValue(undefined)
    mocks.isGuestSearchEnabled.mockReturnValue(true)
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
    expect(mocks.checkAndEnforceGuestLimit).not.toHaveBeenCalled()
    expect(mocks.runSearchPipeline).not.toHaveBeenCalled()
  })
})
