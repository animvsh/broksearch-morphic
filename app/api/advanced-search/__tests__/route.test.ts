import http from 'http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runWithConcurrencyLimit } from '../concurrency'

const redisSet = vi.fn()
const redisGet = vi.fn()
const redisKeys = vi.fn()

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: redisGet,
    keys: redisKeys,
    set: redisSet
  }))
}))

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    get: redisGet,
    keys: redisKeys,
    set: redisSet
  }))
}))

const { POST } = await import('../route')

function makeRequest(body: unknown, contentType = 'application/json') {
  return new Request('https://broksearch.vercel.app/api/advanced-search', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

describe('POST /api/advanced-search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    redisGet.mockResolvedValue(null)
    redisSet.mockResolvedValue('OK')
    redisKeys.mockResolvedValue([])
  })

  afterEach(() => {
    delete process.env.SEARXNG_API_URL
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  it('returns 400 for invalid JSON payloads', async () => {
    const response = await POST(makeRequest('{bad json}'))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({ message: 'Invalid JSON payload' })
  })

  it('returns 400 when query is missing', async () => {
    const response = await POST(makeRequest({ maxResults: 3 }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({ message: 'Missing required field: query' })
  })

  it('does not scan Redis keys while serving uncached requests', async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          query: 'redis cleanup',
          number_of_results: 1,
          results: [
            {
              title: 'Result',
              url: 'https://example.com/result',
              content: 'Useful search result content.'
            }
          ]
        })
      )
    })

    await new Promise<void>(resolve => server.listen(0, resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected test server port')
    }

    process.env.SEARXNG_API_URL = `http://127.0.0.1:${address.port}`

    try {
      const response = await POST(
        makeRequest({
          query: 'redis cleanup',
          maxResults: 1,
          searchDepth: 'basic'
        })
      )

      expect(response.status).toBe(200)
      expect(redisGet).toHaveBeenCalled()
      expect(redisSet).toHaveBeenCalled()
      expect(redisKeys).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()))
      })
    }
  })

  it('runs advanced crawl work with a bounded concurrency cap', async () => {
    let active = 0
    let maxActive = 0

    const results = await runWithConcurrencyLimit(
      Array.from({ length: 12 }, (_, index) => index),
      3,
      async index => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 1))
        active -= 1
        return index * 2
      }
    )

    expect(results).toEqual(Array.from({ length: 12 }, (_, index) => index * 2))
    expect(maxActive).toBeLessThanOrEqual(3)
  })
})
