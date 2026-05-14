import { describe, expect, it } from 'vitest'

import { brokRateLimitHeaders, readJsonBody } from '../http'

describe('Brok API HTTP helpers', () => {
  it('returns a stable invalid_json response for malformed JSON', async () => {
    const result = await readJsonBody(
      new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        body: '{bad json',
        headers: { 'Content-Type': 'application/json' }
      }) as any
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
      await expect(result.response.json()).resolves.toMatchObject({
        error: {
          type: 'invalid_request_error',
          code: 'invalid_json'
        }
      })
    }
  })

  it('emits both Brok and standard rate-limit headers', () => {
    const headers = brokRateLimitHeaders({
      limit: 10,
      current: 3,
      resetAt: 1_800_000_000,
      includeRetryAfter: true
    })

    expect(headers['X-Brok-RateLimit-Limit']).toBe('10')
    expect(headers['X-Brok-RateLimit-Remaining']).toBe('7')
    expect(headers['X-RateLimit-Remaining']).toBe('7')
    expect(headers['Retry-After']).toBeDefined()
  })
})
