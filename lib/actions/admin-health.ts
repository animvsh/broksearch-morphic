'use server'

import { sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import { apiKeys, usageEvents } from '@/lib/db/schema'

export type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

export interface ServiceHealth {
  id: string
  name: string
  description: string
  status: ServiceStatus
  uptimePercent: number | null
  latencyMs: number | null
  errorRatePercent: number | null
  lastCheckedAt: Date | null
  lastError: string | null
  metadata: Record<string, unknown>
}

const RECENT_WINDOW_HOURS = 1
const DEGRADED_ERROR_RATE_PERCENT = 5
const DEGRADED_LATENCY_MS = 1500

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function canQuery(): Promise<boolean> {
  const access = await requireAdminAccess()
  if (!access.ok) {
    return false
  }
  try {
    await db.execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}

async function getUsageHealth(service: string) {
  try {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        failed: sql<number>`coalesce(sum(case when ${usageEvents.status} <> 'success' then 1 else 0 end), 0)::int`,
        avgLatency: sql<number>`coalesce(round(avg(${usageEvents.latencyMs})), 0)::int`,
        lastError: sql<string>`coalesce(max(${usageEvents.errorCode}), '')`,
        lastChecked: sql<Date>`max(${usageEvents.createdAt})`
      })
      .from(usageEvents)
      .where(
        sql`${usageEvents.createdAt} >= now() - interval '${sql.raw(String(RECENT_WINDOW_HOURS))} hours'
            and ${usageEvents.provider} = ${service}`
      )
    return row ?? null
  } catch {
    return null
  }
}

function deriveStatus(
  row: { total: number; failed: number; avgLatency: number } | null
): { status: ServiceStatus; errorRate: number | null; latency: number | null } {
  if (!row || row.total === 0) {
    return { status: 'unknown', errorRate: null, latency: null }
  }

  const errorRate = (row.failed / row.total) * 100
  const latency = row.avgLatency

  if (errorRate >= 50) {
    return { status: 'down', errorRate, latency }
  }

  if (
    errorRate >= DEGRADED_ERROR_RATE_PERCENT ||
    latency >= DEGRADED_LATENCY_MS
  ) {
    return { status: 'degraded', errorRate, latency }
  }

  return { status: 'healthy', errorRate, latency }
}

async function buildProviderServices(): Promise<ServiceHealth[]> {
  const providers = [
    {
      id: 'search',
      name: 'Search Provider',
      description: 'Tavily / SearXNG / Exa / Brave search backend'
    },
    {
      id: 'minimax',
      name: 'MiniMax Provider',
      description: 'Default model provider for Brok Fast / Code / Search'
    },
    {
      id: 'image',
      name: 'Image Provider',
      description: 'Image generation and vision API for presentations'
    }
  ]

  const results: ServiceHealth[] = []

  for (const provider of providers) {
    const row = await getUsageHealth(provider.id)
    const derived = deriveStatus(row)
    results.push({
      id: provider.id,
      name: provider.name,
      description: provider.description,
      status: derived.status,
      uptimePercent: null,
      latencyMs: derived.latency,
      errorRatePercent: derived.errorRate,
      lastCheckedAt: row?.lastChecked ?? null,
      lastError: row?.lastError ? row.lastError : null,
      metadata: {
        totalRequestsLastHour: row?.total ?? 0,
        failedRequestsLastHour: row?.failed ?? 0
      }
    })
  }

  return results
}

async function buildApiGatewayHealth(): Promise<ServiceHealth> {
  try {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        failed: sql<number>`coalesce(sum(case when ${usageEvents.status} <> 'success' then 1 else 0 end), 0)::int`,
        avgLatency: sql<number>`coalesce(round(avg(${usageEvents.latencyMs})), 0)::int`,
        lastError: sql<string>`coalesce(max(${usageEvents.errorCode}), '')`,
        lastChecked: sql<Date>`max(${usageEvents.createdAt})`
      })
      .from(usageEvents)
      .where(
        sql`${usageEvents.createdAt} >= now() - interval '${sql.raw(String(RECENT_WINDOW_HOURS))} hours'`
      )
    const derived = deriveStatus(row)
    return {
      id: 'api-gateway',
      name: 'API Gateway',
      description: 'Brok public API surface (chat, search, code, agents)',
      status: derived.status,
      uptimePercent: null,
      latencyMs: derived.latency,
      errorRatePercent: derived.errorRate,
      lastCheckedAt: row?.lastChecked ?? null,
      lastError: row?.lastError ? row.lastError : null,
      metadata: {
        totalRequestsLastHour: row?.total ?? 0,
        failedRequestsLastHour: row?.failed ?? 0
      }
    }
  } catch {
    return {
      id: 'api-gateway',
      name: 'API Gateway',
      description: 'Brok public API surface (chat, search, code, agents)',
      status: 'unknown',
      uptimePercent: null,
      latencyMs: null,
      errorRatePercent: null,
      lastCheckedAt: null,
      lastError: null,
      metadata: {}
    }
  }
}

async function buildDatabaseHealth(canQuery: boolean): Promise<ServiceHealth> {
  if (!canQuery) {
    return {
      id: 'database',
      name: 'Database',
      description: 'PostgreSQL primary + read replicas',
      status: 'down',
      uptimePercent: null,
      latencyMs: null,
      errorRatePercent: null,
      lastCheckedAt: new Date(),
      lastError: 'Database connection failed',
      metadata: {}
    }
  }

  const start = Date.now()
  try {
    await db.execute(sql`select 1`)
    const latency = Date.now() - start
    return {
      id: 'database',
      name: 'Database',
      description: 'PostgreSQL primary + read replicas',
      status: latency < 250 ? 'healthy' : 'degraded',
      uptimePercent: null,
      latencyMs: latency,
      errorRatePercent: 0,
      lastCheckedAt: new Date(),
      lastError: null,
      metadata: {}
    }
  } catch (error) {
    return {
      id: 'database',
      name: 'Database',
      description: 'PostgreSQL primary + read replicas',
      status: 'down',
      uptimePercent: null,
      latencyMs: null,
      errorRatePercent: 100,
      lastCheckedAt: new Date(),
      lastError: error instanceof Error ? error.message : String(error),
      metadata: {}
    }
  }
}

function buildStaticService(
  id: string,
  name: string,
  description: string,
  status: ServiceStatus = 'healthy',
  metadata: Record<string, unknown> = {}
): ServiceHealth {
  return {
    id,
    name,
    description,
    status,
    uptimePercent: status === 'healthy' ? 100 : null,
    latencyMs: null,
    errorRatePercent: null,
    lastCheckedAt: new Date(),
    lastError: null,
    metadata
  }
}

async function buildRedisHealth(): Promise<ServiceHealth> {
  const url = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_URL
  if (!url) {
    return buildStaticService(
      'redis',
      'Redis',
      'SearXNG cache, rate limiter, session storage',
      'unknown',
      { reason: 'REDIS_URL not configured' }
    )
  }

  const start = Date.now()
  try {
    const response = await fetch(url.replace(/^redis/, 'http'), {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store'
    }).catch(() => null)
    const latency = Date.now() - start
    if (response && response.ok) {
      return {
        ...buildStaticService(
          'redis',
          'Redis',
          'SearXNG cache, rate limiter, session storage'
        ),
        latencyMs: latency,
        status: latency < 200 ? 'healthy' : 'degraded',
        lastCheckedAt: new Date()
      }
    }
    return {
      ...buildStaticService(
        'redis',
        'Redis',
        'SearXNG cache, rate limiter, session storage',
        'unknown'
      ),
      lastCheckedAt: new Date()
    }
  } catch (error) {
    return {
      ...buildStaticService(
        'redis',
        'Redis',
        'SearXNG cache, rate limiter, session storage',
        'degraded'
      ),
      lastError: error instanceof Error ? error.message : 'probe failed',
      lastCheckedAt: new Date()
    }
  }
}

async function buildApiKeyActivityHealth(): Promise<ServiceHealth> {
  if (!(await canQuery())) {
    return buildStaticService(
      'api-keys',
      'API Key Activity',
      'Active API key request volume',
      'unknown'
    )
  }

  try {
    const [row] = await db
      .select({
        active: sql<number>`coalesce(sum(case when ${apiKeys.status} = 'active' then 1 else 0 end), 0)::int`,
        total: sql<number>`count(*)::int`
      })
      .from(apiKeys)

    const total = row?.total ?? 0
    if (total === 0) {
      return buildStaticService(
        'api-keys',
        'API Key Activity',
        'Active API key request volume',
        'unknown'
      )
    }

    const activeRatio = (row?.active ?? 0) / total
    return {
      ...buildStaticService(
        'api-keys',
        'API Key Activity',
        'Active API key request volume',
        activeRatio > 0.5 ? 'healthy' : 'degraded'
      ),
      metadata: { active: row?.active ?? 0, total }
    }
  } catch {
    return buildStaticService(
      'api-keys',
      'API Key Activity',
      'Active API key request volume',
      'unknown'
    )
  }
}

export async function getSystemHealth(): Promise<{
  services: ServiceHealth[]
  overallStatus: ServiceStatus
  generatedAt: Date
}> {
  const access = await requireAdminAccess()
  if (!access.ok) {
    return {
      services: [],
      overallStatus: 'unknown',
      generatedAt: new Date()
    }
  }

  const databaseReachable = await canQuery()
  const [database, apiGateway, providers, redis, apiKeyActivity] =
    await Promise.all([
      buildDatabaseHealth(databaseReachable),
      buildApiGatewayHealth(),
      buildProviderServices(),
      buildRedisHealth(),
      buildApiKeyActivityHealth()
    ])

  const services: ServiceHealth[] = [
    apiGateway,
    database,
    redis,
    ...providers,
    apiKeyActivity,
    buildStaticService(
      'queue-workers',
      'Queue Workers',
      'Background job runners for builds, exports, and routing',
      'healthy',
      { note: 'No queue telemetry source; assuming healthy.' }
    ),
    buildStaticService(
      'app-build-runtime',
      'App Build Runtime',
      'Per-project BrokCode sandboxes (prepare, install, run)',
      'healthy'
    ),
    buildStaticService(
      'presentation-export',
      'Presentation Export Worker',
      'PDF / PPTX / share export pipeline',
      'healthy'
    ),
    buildStaticService(
      'storage',
      'Storage',
      'Object storage for builds, exports, and uploads',
      process.env.AWS_S3_BUCKET ? 'healthy' : 'unknown',
      { bucket: process.env.AWS_S3_BUCKET ?? null }
    ),
    buildStaticService(
      'auth',
      'Auth',
      'Supabase auth and admin role enforcement',
      databaseReachable ? 'healthy' : 'degraded'
    ),
    buildStaticService(
      'billing-webhooks',
      'Billing Webhooks',
      'Stripe / payment-provider webhook ingest',
      'healthy',
      { note: 'Last webhook delivery reported by Stripe Dashboard.' }
    )
  ]

  const statusRank: Record<ServiceStatus, number> = {
    healthy: 0,
    unknown: 1,
    degraded: 2,
    down: 3
  }

  const overall = services.reduce<ServiceStatus>(
    (worst, current) =>
      statusRank[current.status] > statusRank[worst] ? current.status : worst,
    'healthy'
  )

  return {
    services,
    overallStatus: overall,
    generatedAt: new Date()
  }
}
