import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BraveSearchProvider } from '../brave'
import { SearXNGSearchProvider } from '../searxng'
import { TavilySearchProvider } from '../tavily'

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200
  })
}

describe('search provider timeouts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.TAVILY_API_KEY = 'tavily-key'
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key'
    process.env.SEARXNG_API_URL = 'https://searxng.example.com'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete process.env.TAVILY_API_KEY
    delete process.env.BRAVE_SEARCH_API_KEY
    delete process.env.SEARXNG_API_URL
  })

  it('passes abort signals into Tavily fetches and aborts on timeout', async () => {
    vi.useFakeTimers()
    let fetchSignal: AbortSignal | undefined
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          fetchSignal = init?.signal ?? undefined
          fetchSignal?.addEventListener('abort', () => {
            reject(fetchSignal?.reason ?? new Error('aborted'))
          })
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    const search = new TavilySearchProvider().search(
      'timeout query',
      5,
      'basic',
      [],
      [],
      { timeoutMs: 25 }
    )
    const rejection = expect(search).rejects.toMatchObject({
      name: 'TimeoutError'
    })

    await vi.advanceTimersByTimeAsync(25)
    await rejection
    expect(fetchSignal?.aborted).toBe(true)
  })

  it('passes abort signals into SearXNG fetches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        query: 'searxng query',
        number_of_results: 1,
        results: [
          {
            title: 'Result',
            url: 'https://example.com',
            content: 'Search content'
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await new SearXNGSearchProvider().search(
      'searxng query',
      1,
      'basic',
      [],
      [],
      { timeoutMs: 500 }
    )

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    )
  })

  it('passes abort signals into each Brave content fetch', async () => {
    const fetchMock = vi.fn(
      (url: string | URL | Request, _init?: RequestInit) => {
        const href = String(url)
        if (href.includes('/videos/')) {
          return Promise.resolve(okJson({ results: [] }))
        }
        if (href.includes('/images/')) {
          return Promise.resolve(okJson({ results: [] }))
        }
        return Promise.resolve(okJson({ web: { results: [] } }))
      }
    )
    vi.stubGlobal('fetch', fetchMock)

    await new BraveSearchProvider().search('brave query', 2, 'basic', [], [], {
      content_types: ['web', 'video', 'image'],
      timeoutMs: 500,
      type: 'general'
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      )
    }
  })
})
