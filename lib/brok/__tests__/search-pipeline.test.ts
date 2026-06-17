import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildSearchQueries,
  classifyQuery,
  clearSearchPipelineCache,
  generateFollowUps,
  rankAndDedupeSources,
  resolveQuery,
  resolveSearchSynthesisModel,
  runSearchPipeline
} from '@/lib/brok/search-pipeline'

describe('Brok search pipeline helpers', () => {
  afterEach(() => {
    clearSearchPipelineCache()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('classifies and resolves comparison queries', () => {
    const classification = classifyQuery('MiniMax M2 vs OpenAI API pricing')

    expect(classification.type).toBe('comparison')
    expect(classification.needsSearch).toBe(true)
    expect(
      resolveQuery('MiniMax M2 vs OpenAI API pricing', classification)
    ).toBe('Compare MiniMax M2 vs OpenAI API pricing')
  })

  it('expands search queries by depth with recency and domain hints', () => {
    const classification = classifyQuery('latest Brok API docs')

    expect(
      buildSearchQueries({
        query: 'latest Brok API docs',
        classification,
        depth: 'lite',
        limit: 1,
        recencyDays: 7,
        domains: ['docs.brok.ai']
      })
    ).toEqual(['latest Brok API docs within 7 days site:docs.brok.ai'])

    const deepQueries = buildSearchQueries({
      query: 'latest Brok API docs',
      classification,
      depth: 'deep',
      limit: 5
    })

    expect(deepQueries).toHaveLength(5)
    expect(deepQueries[1]).toContain('official docs primary source')
  })

  it('infers explicit domains from the query for corrected company URLs', () => {
    const classification = classifyQuery('What does Capy at capy.ad do?')

    expect(
      buildSearchQueries({
        query: 'What does Capy at capy.ad do?',
        classification,
        depth: 'lite',
        limit: 1
      })
    ).toEqual(['What does Capy at capy.ad do? site:capy.ad'])
  })

  it('does not treat dotted runtime names as site filters', () => {
    const classification = classifyQuery('How does Node.js streaming work?')

    expect(
      buildSearchQueries({
        query: 'How does Node.js streaming work?',
        classification,
        depth: 'lite',
        limit: 1
      })
    ).toEqual(['How does Node.js streaming work?'])
  })

  it('maps public Brok model aliases to provider synthesis model ids', () => {
    expect(resolveSearchSynthesisModel('brok-m2-5-highspeed')).toBe(
      'MiniMax-M2.5-highspeed'
    )
    expect(resolveSearchSynthesisModel('brok-fast')).toBe(
      'MiniMax-M2.7-highspeed'
    )
    expect(resolveSearchSynthesisModel('MiniMax-M2.7')).toBe('MiniMax-M2.7')
    expect(resolveSearchSynthesisModel('')).toBeNull()
  })

  it('falls back to an explicit domain homepage when search returns no results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.startsWith('https://html.duckduckgo.com/html/')) {
          return new Response('<html><body></body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' }
          })
        }

        if (url === 'https://capy.ad') {
          return new Response(
            '<html><head><title>Capy - AI-Powered Outbound Sales</title><meta name="description" content="Capy is your autonomous AI CMO that books meetings on autopilot."></head><body></body></html>',
            {
              status: 200,
              headers: { 'content-type': 'text/html' }
            }
          )
        }

        return new Response('not found', { status: 404 })
      })
    )

    const result = await runSearchPipeline({
      query: 'What does capy.ad do?',
      depth: 'lite'
    })

    expect(result.citations[0]).toMatchObject({
      title: 'Capy - AI-Powered Outbound Sales',
      publisher: 'capy.ad',
      url: 'https://capy.ad'
    })
    expect(result.answer).toContain('Capy')
  })

  it('serves repeated identical searches from a short in-memory cache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.startsWith('https://html.duckduckgo.com/html/')) {
          return new Response(
            '<html><body><div class="result"><h2 class="result__title"><a href="https://react.dev/learn">React Learn</a></h2><a class="result__snippet">The official React learning path.</a></div></body></html>',
            {
              status: 200,
              headers: { 'content-type': 'text/html' }
            }
          )
        }

        return new Response('not found', { status: 404 })
      })
    )

    const first = await runSearchPipeline({
      query: 'best way to learn React',
      depth: 'lite'
    })
    const second = await runSearchPipeline({
      query: '  Best   way to learn react  ',
      depth: 'lite'
    })

    expect(first.answer).toContain('React')
    expect(second.answer).toEqual(first.answer)
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) =>
          String(input).startsWith('https://html.duckduckgo.com/html/')
        )
    ).toHaveLength(1)
  })

  it('dedupes concurrent identical searches while the first request is in flight', async () => {
    let resolveSearch: ((response: Response) => void) | undefined
    const searchResponse = new Promise<Response>(resolve => {
      resolveSearch = resolve
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.startsWith('https://html.duckduckgo.com/html/')) {
          return searchResponse
        }

        return new Response('not found', { status: 404 })
      })
    )

    const first = runSearchPipeline({
      query: 'compare Cursor vs Windsurf',
      depth: 'lite'
    })
    const second = runSearchPipeline({
      query: 'Compare Cursor vs Windsurf',
      depth: 'lite'
    })

    resolveSearch?.(
      new Response(
        '<html><body><div class="result"><h2 class="result__title"><a href="https://example.com/compare">Cursor vs Windsurf</a></h2><a class="result__snippet">A comparison of AI code editors.</a></div></body></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html' }
        }
      )
    )

    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(firstResult.answer).toContain('Cursor')
    expect(secondResult.answer).toEqual(firstResult.answer)
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) =>
          String(input).startsWith('https://html.duckduckgo.com/html/')
        )
    ).toHaveLength(1)
  })

  it('detaches an aborted caller while keeping shared in-flight searches alive', async () => {
    let resolveSearch: ((response: Response) => void) | undefined
    const searchResponse = new Promise<Response>(resolve => {
      resolveSearch = resolve
    })
    const firstController = new AbortController()
    const firstSources = vi.fn()

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url.startsWith('https://html.duckduckgo.com/html/')) {
          expect((init?.signal as AbortSignal | undefined)?.aborted).toBe(false)
          return searchResponse
        }

        return new Response('not found', { status: 404 })
      })
    )

    const first = runSearchPipeline({
      query: 'compare Raycast vs Alfred',
      depth: 'lite',
      onSources: firstSources,
      signal: firstController.signal
    })
    const second = runSearchPipeline({
      query: 'Compare Raycast vs Alfred',
      depth: 'lite'
    })

    firstController.abort()
    resolveSearch?.(
      new Response(
        '<html><body><div class="result"><h2 class="result__title"><a href="https://example.com/raycast-alfred">Raycast vs Alfred</a></h2><a class="result__snippet">A comparison of app launchers.</a></div></body></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html' }
        }
      )
    )

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    const secondResult = await second

    expect(secondResult.answer).toContain('Raycast')
    expect(firstSources).not.toHaveBeenCalled()
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) =>
          String(input).startsWith('https://html.duckduckgo.com/html/')
        )
    ).toHaveLength(1)
  })

  it('returns an honest local fallback without caching provider outages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted.', 'AbortError')
      })
    )

    const first = await runSearchPipeline({
      query: 'latest impossible provider outage check',
      depth: 'lite'
    })
    const second = await runSearchPipeline({
      query: 'latest impossible provider outage check',
      depth: 'lite'
    })

    expect(first.answer).toContain('Live web search was unavailable')
    expect(first.answer).toContain('model knowledge')
    expect(first.answer).toContain('[1]')
    expect(first.citations[0]).toMatchObject({
      id: 'fallback_local_1',
      title: 'Brok local fallback knowledge',
      publisher: 'Brok local fallback',
      qualityScore: 15
    })
    expect(first.citations[0]?.snippet).toContain('not verified web evidence')
    expect(first.followUps).toEqual([
      {
        label: 'Retry with live sources',
        query:
          'Search the web again for latest impossible provider outage check'
      },
      {
        label: 'Limit to primary sources',
        query:
          'Find primary sources for latest impossible provider outage check'
      },
      {
        label: 'Make a verification checklist',
        query:
          'What should I verify before trusting an answer about latest impossible provider outage check?'
      }
    ])
    expect(second.answer).toContain('Live web search was unavailable')
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) =>
          String(input).startsWith('https://html.duckduckgo.com/html/')
        )
    ).toHaveLength(2)
  })

  it('dedupes sources and ranks primary sources ahead of weak domains', () => {
    const sources = rankAndDedupeSources(
      [
        {
          id: 'old_1',
          title: 'Brok API docs',
          url: 'https://docs.brok.ai/search?utm=abc',
          publisher: 'docs.brok.ai',
          snippet: 'Brok API search endpoint updated in 2026.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          id: 'old_2',
          title: 'Brok API docs duplicate',
          url: 'https://docs.brok.ai/search?utm=def',
          publisher: 'docs.brok.ai',
          snippet: 'Duplicate result.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          id: 'old_3',
          title: 'Best Brok coupon',
          url: 'https://coupon.example.com/brok',
          publisher: 'coupon.example.com',
          snippet: 'Top coupon list.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        }
      ],
      'Brok API search endpoint',
      5
    )

    expect(sources).toHaveLength(2)
    expect(sources[0]).toMatchObject({
      id: 'src_1',
      publisher: 'docs.brok.ai'
    })
    expect(sources[0].qualityScore).toBeGreaterThan(
      sources[1].qualityScore ?? 0
    )
  })

  it('creates follow-up questions grounded in query and sources', () => {
    const classification = classifyQuery('How does Brok search work?')
    const followUps = generateFollowUps(
      'How does Brok search work?',
      classification,
      [
        {
          id: 'src_1',
          title: 'Brok docs',
          url: 'https://docs.brok.ai/search',
          publisher: 'docs.brok.ai',
          snippet: 'Search documentation.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        }
      ]
    )

    expect(followUps).toHaveLength(5)
    expect(followUps[4]).toEqual({
      label: 'Ask about docs.brok.ai',
      query:
        'What does docs.brok.ai specifically say about How does Brok search work?'
    })
  })
})
