import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildSearchQueries,
  classifyQuery,
  generateFollowUps,
  rankAndDedupeSources,
  resolveQuery,
  runSearchPipeline
} from '@/lib/brok/search-pipeline'

describe('Brok search pipeline helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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
