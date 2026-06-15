import { Redis } from '@upstash/redis'

import { generateId } from '@/lib/db/schema'

export type SearchStreamMode = 'search' | 'deep' | 'quick'

export type SearchStreamRequest = {
  thread?: {
    id: string
    userId: string
    userMessageId: string
  }
  body: {
    query: string
    model: string
    stream: true
    depth: string
    recency_days?: number
    domains?: string[]
    mode?: SearchStreamMode
  }
  createdAt: number
  headers: {
    xApiKey?: string
    authorization?: string
  }
}

const REGISTRY_TTL_MS = 10 * 60 * 1000
const REGISTRY_TTL_SECONDS = Math.ceil(REGISTRY_TTL_MS / 1000)
const REGISTRY_KEY_PREFIX = 'search:stream:request:'

type RegistryMap = Map<string, SearchStreamRequest>

let redisClient: Redis | null | undefined

const registry =
  (globalThis as { __brokSearchStreamRegistry?: RegistryMap })
    .__brokSearchStreamRegistry || new Map<string, SearchStreamRequest>()

if (
  !(globalThis as { __brokSearchStreamRegistry?: RegistryMap })
    .__brokSearchStreamRegistry
) {
  ;(
    globalThis as { __brokSearchStreamRegistry?: RegistryMap }
  ).__brokSearchStreamRegistry = registry
}

function pruneExpired() {
  const now = Date.now()
  for (const [messageId, request] of registry.entries()) {
    if (now - request.createdAt > REGISTRY_TTL_MS) {
      registry.delete(messageId)
    }
  }
}

function getRedisClient() {
  if (redisClient !== undefined) return redisClient

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    redisClient = null
    return redisClient
  }

  redisClient = new Redis({ url, token })
  return redisClient
}

function searchStreamRegistryKey(messageId: string) {
  return `${REGISTRY_KEY_PREFIX}${messageId}`
}

function requireDurableRegistryIfCloud() {
  if (process.env.BROK_CLOUD_DEPLOYMENT === 'true' && !getRedisClient()) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for search streaming in cloud deployments.'
    )
  }
}

export function makeSearchThreadId() {
  return `thr_${generateId()}`
}

export function makeSearchMessageId() {
  return `msg_${generateId()}`
}

export async function registerSearchStreamRequest(
  request: SearchStreamRequest
) {
  pruneExpired()
  const messageId = makeSearchMessageId()
  const redis = getRedisClient()
  requireDurableRegistryIfCloud()

  if (redis) {
    await redis.set(searchStreamRegistryKey(messageId), request, {
      ex: REGISTRY_TTL_SECONDS
    })
  }

  registry.set(messageId, request)
  return messageId
}

export async function getSearchStreamRequest(messageId: string) {
  pruneExpired()
  const redis = getRedisClient()
  if (redis) {
    const request = await redis.get<SearchStreamRequest>(
      searchStreamRegistryKey(messageId)
    )
    if (request) return request
  }

  return registry.get(messageId) ?? null
}

export async function consumeSearchStreamRequest(messageId: string) {
  pruneExpired()
  const redis = getRedisClient()
  if (redis) {
    const request = await redis.getdel<SearchStreamRequest>(
      searchStreamRegistryKey(messageId)
    )
    if (request) {
      registry.delete(messageId)
      return request
    }
  }

  const request = registry.get(messageId) ?? null
  if (request) {
    registry.delete(messageId)
  }
  return request
}
