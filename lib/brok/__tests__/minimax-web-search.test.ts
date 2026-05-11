import { afterEach, describe, expect, it, vi } from 'vitest'

import { searchWithMiniMaxWebSearch } from '@/lib/brok/minimax-web-search'

describe('searchWithMiniMaxWebSearch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.OPENAI_COMPATIBLE_API_KEY
  })

  it('calls the direct MiniMax coding plan search endpoint with q', async () => {
    process.env.OPENAI_COMPATIBLE_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            organic: [
              {
                title: 'Animesh Alang',
                link: 'https://example.com/animesh',
                snippet: 'Founder profile',
                date: 'May 2026'
              }
            ],
            base_resp: { status_code: 0, status_msg: 'success' }
          })
      })
    )

    const results = await searchWithMiniMaxWebSearch(
      'Animesh Alang biography',
      3
    )

    expect(fetch).toHaveBeenCalledWith(
      'https://api.minimax.io/v1/coding_plan/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          q: 'Animesh Alang biography',
          count: 3
        })
      })
    )
    expect(results).toEqual([
      {
        title: 'Animesh Alang',
        link: 'https://example.com/animesh',
        snippet: 'Founder profile',
        date: 'May 2026'
      }
    ])
  })

  it('surfaces MiniMax search errors without mentioning MCP process failures', async () => {
    process.env.OPENAI_COMPATIBLE_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            base_resp: { status_code: 2013, status_msg: 'invalid params' }
          })
      })
    )

    await expect(searchWithMiniMaxWebSearch('bad query')).rejects.toThrow(
      'invalid params'
    )
  })
})
