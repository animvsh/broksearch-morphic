import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fallbackProviderSearch,
  mockCreateSearchProvider,
  primaryProviderSearch
} = vi.hoisted(() => {
  const primaryProviderSearch = vi.fn()
  const fallbackProviderSearch = vi.fn()

  return {
    fallbackProviderSearch,
    primaryProviderSearch,
    mockCreateSearchProvider: vi.fn((type?: string) => ({
      search:
        !type || type === 'brok'
          ? fallbackProviderSearch
          : primaryProviderSearch
    }))
  }
})

vi.mock('@/lib/tools/search/providers', () => ({
  DEFAULT_PROVIDER: 'brok',
  createSearchProvider: mockCreateSearchProvider
}))

import { createSearchTool } from '@/lib/tools/search'

async function collectSearchChunks(
  result: Awaited<
    ReturnType<NonNullable<ReturnType<typeof createSearchTool>['execute']>>
  >
) {
  const chunks: any[] = []

  if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
    for await (const chunk of result) {
      chunks.push(chunk)
    }
  } else {
    chunks.push(result)
  }

  return chunks
}

function asAsyncIterable(result: unknown) {
  return result as AsyncIterable<any>
}

describe('createSearchTool', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.SEARCH_API
    delete process.env.SEARXNG_DEFAULT_DEPTH
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    process.env = { ...originalEnv }
  })

  it('returns a completed unavailable result when the provider fails', async () => {
    fallbackProviderSearch.mockRejectedValueOnce(new Error('missing api key'))

    const tool = createSearchTool('openai:gpt-4o-mini')
    const result = tool.execute?.(
      {
        query: 'campus housing deadlines',
        type: 'optimized',
        content_types: ['web'],
        max_results: 10,
        search_depth: 'basic',
        include_domains: [],
        exclude_domains: []
      },
      {
        toolCallId: 'search-call-1',
        messages: []
      }
    )

    expect(result).toBeDefined()
    const chunks = await collectSearchChunks(await result!)

    expect(chunks[0]).toEqual({
      state: 'searching',
      query: 'campus housing deadlines'
    })
    expect(chunks.at(-1)).toMatchObject({
      state: 'complete',
      query: 'campus housing deadlines',
      results: [],
      images: [],
      number_of_results: 0,
      toolCallId: 'search-call-1',
      error: expect.stringContaining('Search is temporarily unavailable')
    })
    expect(mockCreateSearchProvider).toHaveBeenCalledTimes(1)
    expect(mockCreateSearchProvider).toHaveBeenCalledWith('brok')
  })

  it('adds citation maps to successful provider results', async () => {
    fallbackProviderSearch.mockResolvedValueOnce({
      results: [
        {
          title: 'Academic Calendar',
          url: 'https://example.edu/calendar',
          content: 'Registration opens in August.'
        }
      ],
      images: [],
      query: 'academic calendar',
      number_of_results: 1
    })

    const tool = createSearchTool('openai:gpt-4o-mini')
    const result = tool.execute?.(
      {
        query: 'academic calendar',
        type: 'optimized',
        content_types: ['web'],
        max_results: 10,
        search_depth: 'basic',
        include_domains: [],
        exclude_domains: []
      },
      {
        toolCallId: 'search-call-2',
        messages: []
      }
    )

    const chunks = await collectSearchChunks(await result!)
    expect(chunks.at(-1)).toMatchObject({
      state: 'complete',
      toolCallId: 'search-call-2',
      citationMap: {
        1: {
          title: 'Academic Calendar',
          url: 'https://example.edu/calendar'
        }
      }
    })
  })

  it('falls back to the default provider when the configured provider fails', async () => {
    process.env.SEARCH_API = 'tavily'
    primaryProviderSearch.mockRejectedValueOnce(new Error('Tavily unavailable'))
    fallbackProviderSearch.mockResolvedValueOnce({
      results: [
        {
          title: 'University Academic Calendar',
          url: 'https://example.edu/calendar',
          content: 'Fall registration opens August 1.'
        }
      ],
      images: [],
      query: 'fall registration deadline',
      number_of_results: 1
    })

    const tool = createSearchTool('openai:gpt-4o-mini')
    const result = tool.execute?.(
      {
        query: 'fall registration deadline',
        type: 'optimized',
        content_types: ['web'],
        max_results: 10,
        search_depth: 'basic',
        include_domains: [],
        exclude_domains: []
      },
      {
        toolCallId: 'search-call-3',
        messages: []
      }
    )

    const chunks = await collectSearchChunks(await result!)

    expect(primaryProviderSearch).toHaveBeenCalledTimes(1)
    expect(fallbackProviderSearch).toHaveBeenCalledTimes(1)
    expect(mockCreateSearchProvider).toHaveBeenNthCalledWith(1, 'tavily')
    expect(mockCreateSearchProvider).toHaveBeenNthCalledWith(2, 'brok')
    expect(chunks.at(-1)).toMatchObject({
      state: 'complete',
      toolCallId: 'search-call-3',
      results: [
        {
          title: 'University Academic Calendar',
          url: 'https://example.edu/calendar'
        }
      ],
      citationMap: {
        1: {
          title: 'University Academic Calendar',
          url: 'https://example.edu/calendar'
        }
      }
    })
    expect(chunks.at(-1).error).toBeUndefined()
  })

  it('falls back when the configured provider times out', async () => {
    vi.useFakeTimers()
    process.env.SEARCH_API = 'tavily'
    process.env.SEARCH_PROVIDER_TIMEOUT_MS = '25'
    primaryProviderSearch.mockImplementationOnce(
      () => new Promise(() => undefined)
    )
    fallbackProviderSearch.mockResolvedValueOnce({
      results: [
        {
          title: 'Fast fallback source',
          url: 'https://fallback.example/source',
          content: 'The backup search provider returned quickly.'
        }
      ],
      images: [],
      query: 'slow provider query',
      number_of_results: 1
    })

    const tool = createSearchTool('openai:gpt-4o-mini')
    const result = tool.execute?.(
      {
        query: 'slow provider query',
        type: 'optimized',
        content_types: ['web'],
        max_results: 10,
        search_depth: 'basic',
        include_domains: [],
        exclude_domains: []
      },
      {
        toolCallId: 'search-call-timeout',
        messages: []
      }
    )

    expect(result).toBeDefined()
    const iterator = asAsyncIterable(await result!)[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        state: 'searching',
        query: 'slow provider query'
      }
    })

    const finalChunk = iterator.next()
    await vi.advanceTimersByTimeAsync(25)

    await expect(finalChunk).resolves.toMatchObject({
      done: false,
      value: {
        state: 'complete',
        toolCallId: 'search-call-timeout',
        results: [
          {
            title: 'Fast fallback source',
            url: 'https://fallback.example/source'
          }
        ]
      }
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined
    })
    expect(primaryProviderSearch).toHaveBeenCalledTimes(1)
    expect(fallbackProviderSearch).toHaveBeenCalledTimes(1)
  })

  it('falls back when advanced search route is unavailable', async () => {
    process.env.SEARCH_API = 'searxng'
    process.env.SEARXNG_DEFAULT_DEPTH = 'advanced'
    process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 503 }))
    )
    fallbackProviderSearch.mockResolvedValueOnce({
      results: [
        {
          title: 'Campus IT Status',
          url: 'https://status.example.edu',
          content: 'Search backup provider is reachable.'
        }
      ],
      images: [],
      query: 'campus IT status',
      number_of_results: 1
    })

    const tool = createSearchTool('openai:gpt-4o-mini')
    const result = tool.execute?.(
      {
        query: 'campus IT status',
        type: 'optimized',
        content_types: ['web'],
        max_results: 10,
        search_depth: 'advanced',
        include_domains: [],
        exclude_domains: []
      },
      {
        toolCallId: 'search-call-4',
        messages: []
      }
    )

    const chunks = await collectSearchChunks(await result!)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/advanced-search'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(mockCreateSearchProvider).toHaveBeenCalledTimes(1)
    expect(mockCreateSearchProvider).toHaveBeenCalledWith('brok')
    expect(chunks.at(-1)).toMatchObject({
      state: 'complete',
      toolCallId: 'search-call-4',
      results: [
        {
          title: 'Campus IT Status',
          url: 'https://status.example.edu'
        }
      ]
    })
  })

  it('falls back when the advanced search route times out', async () => {
    vi.useFakeTimers()
    process.env.SEARCH_API = 'searxng'
    process.env.SEARXNG_DEFAULT_DEPTH = 'advanced'
    process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000'
    process.env.SEARCH_PROVIDER_TIMEOUT_MS = '25'
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined))
    )
    fallbackProviderSearch.mockResolvedValueOnce({
      results: [
        {
          title: 'Advanced route fallback source',
          url: 'https://fallback.example/advanced',
          content: 'The default provider answered after advanced search hung.'
        }
      ],
      images: [],
      query: 'advanced slow query',
      number_of_results: 1
    })

    const tool = createSearchTool('openai:gpt-4o-mini')
    const result = tool.execute?.(
      {
        query: 'advanced slow query',
        type: 'optimized',
        content_types: ['web'],
        max_results: 10,
        search_depth: 'advanced',
        include_domains: [],
        exclude_domains: []
      },
      {
        toolCallId: 'search-call-advanced-timeout',
        messages: []
      }
    )

    expect(result).toBeDefined()
    const iterator = asAsyncIterable(await result!)[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        state: 'searching',
        query: 'advanced slow query'
      }
    })

    const finalChunk = iterator.next()
    await vi.advanceTimersByTimeAsync(25)

    await expect(finalChunk).resolves.toMatchObject({
      done: false,
      value: {
        state: 'complete',
        toolCallId: 'search-call-advanced-timeout',
        results: [
          {
            title: 'Advanced route fallback source',
            url: 'https://fallback.example/advanced'
          }
        ]
      }
    })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/advanced-search'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(mockCreateSearchProvider).toHaveBeenCalledTimes(1)
    expect(mockCreateSearchProvider).toHaveBeenCalledWith('brok')
    expect(fallbackProviderSearch).toHaveBeenCalledTimes(1)
  })
})
