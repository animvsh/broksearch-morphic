import { afterEach, describe, expect, it, vi } from 'vitest'

describe('deep research workflow', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('builds a multi-pass research plan instead of a single deep query', async () => {
    const { buildDeepResearchPlan } = await import('@/lib/brok/deep-research')

    const plan = buildDeepResearchPlan({
      query: 'Compare Brok API and OpenAI API pricing',
      recencyDays: 30,
      domains: ['docs.brok.ai']
    })

    expect(plan.length).toBeGreaterThanOrEqual(5)
    expect(plan.map(item => item.id)).toContain('primary-sources')
    expect(plan.map(item => item.id)).toContain('contradictions')
    expect(plan.map(item => item.id)).toContain('comparison-table')
    expect(plan.every(item => item.query.includes('site:docs.brok.ai'))).toBe(
      true
    )
  })

  it('runs multiple research passes and returns a synthesized brief payload', async () => {
    vi.doMock('@/lib/ai/minimax', () => ({
      MINIMAX_API_KEY: '',
      MINIMAX_BASE_URL: 'https://minimax.test/v1',
      MINIMAX_CHAT_MODEL: 'MiniMax-M2'
    }))

    const runSearchPipeline = vi.fn(async ({ query }: { query: string }) => {
      const actual = await vi.importActual<
        typeof import('@/lib/brok/search-pipeline')
      >('@/lib/brok/search-pipeline')

      return {
        answer: `Finding for ${query}.`,
        citations: [
          {
            id: 'src_1',
            title: `Primary source for ${query}`,
            url: `https://docs.example.com/${encodeURIComponent(query)}`,
            publisher: 'docs.example.com',
            snippet: `Evidence for ${query} updated in 2026.`,
            retrievedAt: '2026-05-15T00:00:00.000Z',
            qualityScore: 90
          }
        ],
        searchQueries: 1,
        searchQueryList: [query],
        tokensUsed: 120,
        resolvedQuery: query,
        classification: actual.classifyQuery(query),
        followUps: []
      }
    })

    vi.doMock('@/lib/brok/search-pipeline', async () => {
      const actual = await vi.importActual<
        typeof import('@/lib/brok/search-pipeline')
      >('@/lib/brok/search-pipeline')

      return {
        ...actual,
        runSearchPipeline
      }
    })

    const { runDeepResearch } = await import('@/lib/brok/deep-research')
    const progressEvents: string[] = []

    const result = await runDeepResearch({
      query: 'Compare Brok API and OpenAI API pricing',
      onProgress: event => {
        progressEvents.push(event.message)
      }
    })

    expect(runSearchPipeline).toHaveBeenCalledTimes(result.researchPlan.length)
    expect(result.usage.researchPasses).toBeGreaterThanOrEqual(5)
    expect(result.citations.length).toBeGreaterThan(1)
    expect(result.findings[0].citationIds.length).toBeGreaterThan(0)
    expect(result.answer).toContain('Deep research for:')
    expect(progressEvents).toContain('Writing the final research brief')
  })
})
