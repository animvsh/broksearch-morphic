import { Redis } from '@upstash/redis'
import { sql } from 'drizzle-orm'

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
let databaseRegistryReady = false

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

function isPlaceholderDatabaseUrl(value: string | undefined) {
  if (!value) return true
  const trimmed = value.trim()
  if (trimmed.length === 0) return true
  return /^\[\s*YOUR_[A-Z0-9_]+_URL\s*\]$/i.test(trimmed)
}

function canUseDatabaseRegistry() {
  return (
    !isPlaceholderDatabaseUrl(process.env.DATABASE_RESTRICTED_URL) ||
    !isPlaceholderDatabaseUrl(process.env.DATABASE_URL)
  )
}

async function ensureDatabaseRegistry() {
  if (databaseRegistryReady) return

  const { db } = await import('@/lib/db')
  await db.execute(sql`
    create table if not exists search_stream_requests (
      message_id text primary key,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `)
  databaseRegistryReady = true
}

async function pruneExpiredDatabaseRequests() {
  await ensureDatabaseRegistry()
  const { db } = await import('@/lib/db')
  await db.execute(sql`
    delete from search_stream_requests
    where expires_at <= now()
  `)
}

async function registerDatabaseSearchStreamRequest(
  messageId: string,
  request: SearchStreamRequest
) {
  await pruneExpiredDatabaseRequests()
  const { db } = await import('@/lib/db')
  await db.execute(sql`
    insert into search_stream_requests (message_id, payload, expires_at)
    values (
      ${messageId},
      ${JSON.stringify(request)}::jsonb,
      now() + (${REGISTRY_TTL_SECONDS} * interval '1 second')
    )
    on conflict (message_id) do update
    set payload = excluded.payload,
        expires_at = excluded.expires_at
  `)
}

async function getDatabaseSearchStreamRequest(messageId: string) {
  await ensureDatabaseRegistry()
  const { db } = await import('@/lib/db')
  const rows = await db.execute<{ payload: SearchStreamRequest }>(sql`
    select payload
    from search_stream_requests
    where message_id = ${messageId}
      and expires_at > now()
    limit 1
  `)

  return rows[0]?.payload ?? null
}

async function consumeDatabaseSearchStreamRequest(messageId: string) {
  await ensureDatabaseRegistry()
  const { db } = await import('@/lib/db')
  const rows = await db.execute<{ payload: SearchStreamRequest }>(sql`
    delete from search_stream_requests
    where message_id = ${messageId}
      and expires_at > now()
    returning payload
  `)

  return rows[0]?.payload ?? null
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

  if (redis) {
    await redis.set(searchStreamRegistryKey(messageId), request, {
      ex: REGISTRY_TTL_SECONDS
    })
  } else if (canUseDatabaseRegistry()) {
    await registerDatabaseSearchStreamRequest(messageId, request)
  } else if (process.env.BROK_CLOUD_DEPLOYMENT === 'true') {
    throw new Error(
      'DATABASE_URL or UPSTASH_REDIS_REST_URL is required for search streaming in cloud deployments.'
    )
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

  if (canUseDatabaseRegistry()) {
    const request = await getDatabaseSearchStreamRequest(messageId)
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

  if (canUseDatabaseRegistry()) {
    const request = await consumeDatabaseSearchStreamRequest(messageId)
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
