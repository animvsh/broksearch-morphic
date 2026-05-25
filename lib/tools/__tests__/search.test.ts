import { describe, expect, it, vi } from 'vitest'

const { searchProviderSearch } = vi.hoisted(() => ({
  searchProviderSearch: vi.fn()
}))

vi.mock('@/lib/tools/search/providers', () => ({
  DEFAULT_PROVIDER: 'minimax',
  createSearchProvider: vi.fn(() => ({
    search: searchProviderSearch
  }))
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

describe('createSearchTool', () => {
  it('returns a completed unavailable result when the provider fails', async () => {
    searchProviderSearch.mockRejectedValueOnce(new Error('missing api key'))

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
  })

  it('adds citation maps to successful provider results', async () => {
    searchProviderSearch.mockResolvedValueOnce({
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
})
