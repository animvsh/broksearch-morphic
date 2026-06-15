import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { redisStore } = vi.hoisted(() => ({
  redisStore: new Map<string, unknown>()
}))

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    getdel: vi.fn(async (key: string) => {
      const value = redisStore.get(key) ?? null
      redisStore.delete(key)
      return value
    }),
    set: vi.fn(async (key: string, value: unknown) => {
      redisStore.set(key, value)
      return 'OK'
    })
  }))
}))

const originalCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT
const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL
const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

describe('search stream registry', () => {
  beforeEach(() => {
    vi.resetModules()
    redisStore.clear()
    delete process.env.BROK_CLOUD_DEPLOYMENT
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  afterEach(() => {
    process.env.BROK_CLOUD_DEPLOYMENT = originalCloudDeployment
    process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl
    process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken
  })

  it('stores and consumes stream handoffs through Redis when configured', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-token'
    const {
      consumeSearchStreamRequest,
      getSearchStreamRequest,
      registerSearchStreamRequest
    } = await import('../search-stream-registry')

    const request = {
      body: {
        query: 'durable search',
        model: 'brok-search',
        stream: true as const,
        depth: 'standard',
        mode: 'search' as const
      },
      createdAt: Date.now(),
      headers: {}
    }
    const messageId = await registerSearchStreamRequest(request)

    await expect(getSearchStreamRequest(messageId)).resolves.toMatchObject({
      body: { query: 'durable search' }
    })
    await expect(consumeSearchStreamRequest(messageId)).resolves.toMatchObject({
      body: { query: 'durable search' }
    })
    await expect(consumeSearchStreamRequest(messageId)).resolves.toBeNull()
  })

  it('rejects cloud streaming when durable storage is not configured', async () => {
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'
    const { registerSearchStreamRequest } = await import(
      '../search-stream-registry'
    )

    await expect(
      registerSearchStreamRequest({
        body: {
          query: 'cloud search',
          model: 'brok-search',
          stream: true,
          depth: 'standard',
          mode: 'search'
        },
        createdAt: Date.now(),
        headers: {}
      })
    ).rejects.toThrow('UPSTASH_REDIS_REST_URL')
  })
})
