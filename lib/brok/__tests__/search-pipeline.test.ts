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

  it('answers Brok Search self-queries from first-party product context', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await runSearchPipeline({
      query: 'What is Brok Search?',
      depth: 'lite'
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.answer).toContain('Brok’s AI answer engine')
    expect(result.answer).toContain('source cards, citations')
    expect(result.citations).toHaveLength(2)
    expect(result.citations[0]).toMatchObject({
      title: 'Brok Search product context',
      publisher: 'brok.fyi',
      qualityScore: 100
    })
    expect(result.followUps.map(item => item.label)).toContain(
      'Compare Brok to Perplexity'
    )
  })

  it('answers Brok Search citation follow-ups with citation-specific guidance', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await runSearchPipeline({
      query:
        'Previous turn question: What is Brok Search?\nPrevious turn answer summary: Brok Search returns cited answers.\nCurrent follow-up question: How does it cite sources?',
      depth: 'lite'
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.answer).toContain('inline citation markers')
    expect(result.answer).toContain('source cards')
    expect(result.answer).not.toContain(
      'Brok Search is Brok’s AI answer engine'
    )
    expect(result.citations).toHaveLength(2)
  })

  it('keeps Brok Search citation follow-ups grounded in first-party context', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await runSearchPipeline({
      query: 'How does it cite sources?',
      depth: 'lite',
      context: [
        {
          query: 'What is Brok Search?',
          answer:
            'Brok Search is Brok’s AI answer engine with source cards, citations, and follow-up questions.'
        }
      ]
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.answer).toContain('inline citation markers')
    expect(result.citations).toHaveLength(2)
    expect(result.citations.map(source => source.publisher)).toEqual([
      'brok.fyi',
      'brok.fyi'
    ])
  })

  it('biases quick React learning searches toward canonical documentation', () => {
    const queries = buildSearchQueries({
      query: 'What is the best way to learn React?',
      classification: classifyQuery('What is the best way to learn React?'),
      depth: 'lite',
      limit: 1
    })

    expect(queries[0]).toContain('site:react.dev')
    expect(queries[0]).toContain('site:developer.mozilla.org')
  })

  it('biases Cursor vs Windsurf comparisons toward official product sources', () => {
    const queries = buildSearchQueries({
      query: 'Compare Cursor vs Windsurf',
      classification: classifyQuery('Compare Cursor vs Windsurf'),
      depth: 'lite',
      limit: 1
    })

    expect(queries[0]).toContain('site:cursor.com')
    expect(queries[0]).toContain('site:windsurf.com')
    expect(queries[0]).toContain('site:codeium.com')
  })

  it('expands AI news for builders toward developer news sources', () => {
    const queries = buildSearchQueries({
      query: 'Summarize the latest AI news for builders',
      classification: classifyQuery(
        'Summarize the latest AI news for builders'
      ),
      depth: 'lite',
      limit: 1
    })

    expect(queries[0]).toContain('software developers startups AI tools models')
    expect(queries[0]).toContain('site:reuters.com')
    expect(queries[0]).toContain('site:techcrunch.com')
    expect(queries[0]).toContain('site:theverge.com')
    expect(queries[0]).toContain('site:news.mit.edu')
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

  it('builds a cited snippet answer when synthesis is unavailable but search succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.startsWith('https://html.duckduckgo.com/html/')) {
          return new Response(
            '<html><body><div class="result"><h2 class="result__title"><a href="https://react.dev/learn">React Learn</a></h2><a class="result__snippet">React is the library for web and native user interfaces.</a></div><div class="result"><h2 class="result__title"><a href="https://developer.mozilla.org/en-US/docs/Learn/Tools_and_testing/Client-side_JavaScript_frameworks/React_getting_started">MDN React guide</a></h2><a class="result__snippet">React lets you build interfaces from reusable components.</a></div></body></html>',
            {
              status: 200,
              headers: { 'content-type': 'text/html' }
            }
          )
        }

        return new Response('synthesis unavailable', { status: 503 })
      })
    )

    const result = await runSearchPipeline({
      query: 'What is React?',
      depth: 'lite'
    })

    expect(result.citations).toHaveLength(2)
    expect(result.answer).toContain('Based on the retrieved sources')
    expect(result.answer).toContain(
      'React is the library for web and native user interfaces. [1]'
    )
    expect(result.answer).toContain(
      'React lets you build interfaces from reusable components. [2]'
    )
    expect(result.answer).toContain('I could not reach the synthesis model')
    expect(result.answer).not.toContain('React Learn:')
  })

  it('starts answering from fast search batches before slow sibling queries finish', async () => {
    vi.stubEnv('BROK_SEARCH_BATCH_SOFT_TIMEOUT_MS', '25')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('https://html.duckduckgo.com/html/')) {
        const searchCalls = fetchMock.mock.calls.filter(([calledInput]) =>
          String(calledInput).startsWith('https://html.duckduckgo.com/html/')
        )
        if (searchCalls.length === 1) {
          return new Response(
            '<html><body><div class="result"><h2 class="result__title"><a href="https://react.dev/learn">React Learn</a></h2><a class="result__snippet">The official React learning path.</a></div></body></html>',
            {
              status: 200,
              headers: { 'content-type': 'text/html' }
            }
          )
        }

        await new Promise(resolve => setTimeout(resolve, 150))
        return new Response(
          '<html><body><div class="result"><h2 class="result__title"><a href="https://slow.example.com">Slow source</a></h2><a class="result__snippet">A slow secondary result.</a></div></body></html>',
          {
            status: 200,
            headers: { 'content-type': 'text/html' }
          }
        )
      }

      return new Response('synthesis unavailable', { status: 503 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const startedAt = Date.now()
    const result = await runSearchPipeline({
      query: 'best way to learn React',
      depth: 'standard'
    })
    const elapsed = Date.now() - startedAt

    expect(elapsed).toBeLessThan(140)
    expect(result.citations[0]).toMatchObject({
      title: 'React Learn',
      publisher: 'react.dev'
    })
    expect(result.answer).toContain('The official React learning path')
  })

  it('adds canonical React learning docs when search returns weak official pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.startsWith('https://html.duckduckgo.com/html/')) {
          return new Response(
            '<html><body><div class="result"><h2 class="result__title"><a href="https://react.dev/conf">React Conferences</a></h2><a class="result__snippet">React community conferences and events.</a></div><div class="result"><h2 class="result__title"><a href="https://react.dev/blog/2025/10/07/react-foundation">The React Foundation</a></h2><a class="result__snippet">News about the React project home.</a></div></body></html>',
            {
              status: 200,
              headers: { 'content-type': 'text/html' }
            }
          )
        }

        return new Response('synthesis unavailable', { status: 503 })
      })
    )

    const result = await runSearchPipeline({
      query: 'What is the best way to learn React hooks?',
      depth: 'lite'
    })

    expect(result.citations.slice(0, 3).map(source => source.url)).toEqual([
      'https://react.dev/reference/react/hooks',
      'https://react.dev/learn',
      'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Frameworks_libraries/React_getting_started'
    ])
  })

  it('adds official Cursor and Windsurf sources when comparison search misses one side', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.startsWith('https://html.duckduckgo.com/html/')) {
          return new Response(
            '<html><body><div class="result"><h2 class="result__title"><a href="https://cursor.com">Cursor: AI coding agent</a></h2><a class="result__snippet">Cursor is an AI coding agent.</a></div><div class="result"><h2 class="result__title"><a href="https://devin.ai">Devin Desktop</a></h2><a class="result__snippet">Devin is an AI software engineering agent.</a></div></body></html>',
            {
              status: 200,
              headers: { 'content-type': 'text/html' }
            }
          )
        }

        return new Response('synthesis unavailable', { status: 503 })
      })
    )

    const result = await runSearchPipeline({
      query: 'Compare Cursor vs Windsurf for coding',
      depth: 'lite'
    })

    expect(result.citations.slice(0, 3).map(source => source.url)).toEqual([
      'https://cursor.com',
      'https://windsurf.com',
      'https://codeium.com'
    ])
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

  it('keeps shared in-flight searches alive when one caller aborts', async () => {
    let resolveSearch: ((response: Response) => void) | undefined
    const searchResponse = new Promise<Response>(resolve => {
      resolveSearch = resolve
    })
    const firstController = new AbortController()

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
    const thirdResult = await runSearchPipeline({
      query: 'compare raycast vs alfred',
      depth: 'lite'
    })

    expect(secondResult.answer).toContain('Raycast')
    expect(thirdResult.answer).toEqual(secondResult.answer)
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) =>
          String(input).startsWith('https://html.duckduckgo.com/html/')
        )
    ).toHaveLength(1)
  })

  it('aborts shared provider work when the last caller aborts', async () => {
    let providerSignal: AbortSignal | undefined
    const controller = new AbortController()

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url.startsWith('https://html.duckduckgo.com/html/')) {
          providerSignal = init?.signal as AbortSignal | undefined
          return new Promise<Response>((_resolve, reject) => {
            providerSignal?.addEventListener(
              'abort',
              () => {
                reject(
                  new DOMException('The operation was aborted.', 'AbortError')
                )
              },
              { once: true }
            )
          })
        }

        return new Response('not found', { status: 404 })
      })
    )

    const search = runSearchPipeline({
      query: 'latest provider cancellation smoke',
      depth: 'lite',
      signal: controller.signal
    })

    await vi.waitFor(() => {
      expect(providerSignal).toBeDefined()
    })

    controller.abort()

    await expect(search).rejects.toMatchObject({ name: 'AbortError' })
    expect(providerSignal?.aborted).toBe(true)
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
    expect(first.answer).toContain('No web sources were attached')
    expect(first.answer).not.toContain('[1]')
    expect(first.citations).toEqual([])
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

  it('ranks official framework docs ahead of casual React learning sources', () => {
    const sources = rankAndDedupeSources(
      [
        {
          title: 'What are the best resources for learning React?',
          url: 'https://www.quora.com/What-are-the-best-resources-for-learning-React',
          publisher: 'quora.com',
          snippet: 'Community answers about courses and tutorials.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'React Learn',
          url: 'https://react.dev/learn',
          publisher: 'react.dev',
          snippet:
            'The official React documentation teaches components, props, state, and hooks.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        }
      ],
      'best way to learn React',
      5
    )

    expect(sources[0]).toMatchObject({
      publisher: 'react.dev',
      url: 'https://react.dev/learn'
    })
  })

  it('ranks official AI editor product pages ahead of comparison blogs', () => {
    const sources = rankAndDedupeSources(
      [
        {
          title: 'Cursor vs Windsurf comparison',
          url: 'https://comparison.example.com/cursor-vs-windsurf',
          publisher: 'comparison.example.com',
          snippet: 'A third-party comparison of Cursor and Windsurf.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'Cursor - The AI code editor',
          url: 'https://cursor.com',
          publisher: 'cursor.com',
          snippet: 'Cursor is an AI code editor for developers.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'Windsurf - Agentic IDE',
          url: 'https://windsurf.com',
          publisher: 'windsurf.com',
          snippet: 'Windsurf is an AI-powered coding environment.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        }
      ],
      'Compare Cursor vs Windsurf',
      5
    )

    expect(sources.slice(0, 2).map(source => source.publisher)).toEqual([
      'cursor.com',
      'windsurf.com'
    ])
  })

  it('ranks official AI editor pages ahead of forum subdomains', () => {
    const sources = rankAndDedupeSources(
      [
        {
          title: 'Cursor vs Windsurf discussion',
          url: 'https://forum.cursor.com/t/cursor-vs-windsurf/123',
          publisher: 'forum.cursor.com',
          snippet: 'Community discussion comparing Cursor and Windsurf.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'Cursor - The AI code editor',
          url: 'https://cursor.com',
          publisher: 'cursor.com',
          snippet: 'Cursor is an AI code editor for developers.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'Windsurf - Agentic IDE',
          url: 'https://windsurf.com',
          publisher: 'windsurf.com',
          snippet: 'Windsurf is an AI-powered coding environment.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        }
      ],
      'Compare Cursor vs Windsurf',
      5
    )

    expect(sources.slice(0, 2).map(source => source.publisher)).toEqual([
      'cursor.com',
      'windsurf.com'
    ])
  })

  it('suppresses community subdomains when official AI editor sources are available', () => {
    const sources = rankAndDedupeSources(
      [
        {
          title: 'Windsurf vs Cursor | AI IDE Comparison',
          url: 'https://windsurf.com/compare/cursor',
          publisher: 'windsurf.com',
          snippet: 'Windsurf compares AI IDE capabilities.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'Cursor: AI coding agent',
          url: 'https://cursor.com',
          publisher: 'cursor.com',
          snippet: 'Cursor is an AI coding agent.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'Think Cursor Pro is $20/month?',
          url: 'https://forum.cursor.com/t/pricing-thread/123',
          publisher: 'forum.cursor.com',
          snippet: 'Forum discussion about Cursor pricing.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'Codeium: AI-powered code acceleration',
          url: 'https://codeium.com',
          publisher: 'codeium.com',
          snippet: 'Codeium builds Windsurf.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        }
      ],
      'Compare Cursor vs Windsurf',
      3
    )

    expect(sources.map(source => source.publisher).sort()).toEqual([
      'codeium.com',
      'cursor.com',
      'windsurf.com'
    ])
    expect(sources.map(source => source.publisher)).not.toContain(
      'forum.cursor.com'
    )
  })

  it('ranks trusted AI news sources ahead of social and construction noise', () => {
    const sources = rankAndDedupeSources(
      [
        {
          title: 'AI Construction News',
          url: 'https://aiconstructionnews.com/latest',
          publisher: 'aiconstructionnews.com',
          snippet:
            'Construction analytics and AI in AEC for contractors and jobsites.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'Construction workers are beating your finance team at AI',
          url: 'https://www.facebook.com/example/posts/123',
          publisher: 'facebook.com',
          snippet: 'A social post about construction workers using AI.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'Artificial Intelligence - AI News - Reuters',
          url: 'https://www.reuters.com/technology/artificial-intelligence/',
          publisher: 'reuters.com',
          snippet:
            'Latest artificial intelligence news covering AI models, companies, regulation, and software products in 2026.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        },
        {
          title: 'The latest AI product launches developers should know',
          url: 'https://techcrunch.com/category/artificial-intelligence/',
          publisher: 'techcrunch.com',
          snippet:
            'Recent AI tools, model releases, startups, and product updates for builders.',
          retrievedAt: '2026-05-12T00:00:00.000Z'
        }
      ],
      'Summarize the latest AI news for builders',
      3
    )

    expect(sources.slice(0, 2).map(source => source.publisher)).toEqual(
      expect.arrayContaining(['techcrunch.com', 'reuters.com'])
    )
    expect(sources.map(source => source.publisher)).not.toContain(
      'facebook.com'
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
