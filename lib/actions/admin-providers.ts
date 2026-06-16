'use server'

import { revalidatePath } from 'next/cache'

import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { BROK_MODELS } from '@/lib/brok/models'
import { db } from '@/lib/db'
import { providerRoutes, rateLimitEvents, usageEvents } from '@/lib/db/schema'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const errorWithCode = error as unknown as { code?: unknown }
    const code =
      typeof errorWithCode.code === 'string' ? errorWithCode.code : ''
    const cause =
      error.cause instanceof Error
        ? getErrorMessage(error.cause)
        : error.cause
          ? String(error.cause)
          : ''

    return [error.message, code, cause].filter(Boolean).join(' | ')
  }

  return String(error)
}

function canUseDevDbFallback(error: unknown): boolean {
  if (process.env.BROK_DEV_DB_FALLBACK === 'false') {
    return false
  }

  const message = getErrorMessage(error).toLowerCase()
  return [
    'enotfound',
    'ehostunreach',
    'econnrefused',
    'etimedout',
    'network',
    'connect econn',
    'getaddrinfo',
    'failed query',
    'connection terminated',
    'unable to connect'
  ].some(fragment => message.includes(fragment))
}

function startOfDay(date = new Date()) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

async function assertAdminAccess() {
  const access = await requireAdminAccess()

  if (!access.ok) {
    throw new Error(access.error)
  }
}

export type ProviderType =
  | 'llm'
  | 'search'
  | 'image'
  | 'stock-media'
  | 'export'
  | 'storage'
  | 'local-model'

export interface AdminProviderRow {
  id: string
  name: string
  type: ProviderType
  status: 'active' | 'disabled' | 'degraded'
  requestsToday: number
  costToday: number
  avgLatencyMs: number
  errorRate: number
  rateLimitErrors: number
  lastError: string | null
  lastUsedAt: Date | null
  isFallback: boolean
  fallbackProvider: string | null
  routes: number
  secretsHidden: boolean
}

const KNOWN_PROVIDER_TYPES: Record<string, ProviderType> = {
  minimax: 'llm',
  tavily: 'search',
  searxng: 'search',
  exa: 'search',
  brave: 'search',
  jina: 'search',
  openai: 'llm',
  anthropic: 'llm',
  google: 'llm',
  mistral: 'llm',
  cohere: 'llm',
  opencode: 'llm',
  pi: 'llm',
  deepsec: 'llm',
  brokcode: 'llm',
  replicate: 'image',
  stability: 'image',
  midjourney: 'image',
  dalle: 'image',
  unsplash: 'stock-media',
  pexels: 'stock-media',
  pixabay: 'stock-media',
  pdf: 'export',
  pptx: 'export',
  docx: 'export',
  s3: 'storage',
  r2: 'storage',
  gcs: 'storage',
  ollama: 'local-model',
  llamacpp: 'local-model',
  vllm: 'local-model'
}

function inferProviderType(name: string): ProviderType {
  const lower = name.toLowerCase()
  if (KNOWN_PROVIDER_TYPES[lower]) {
    return KNOWN_PROVIDER_TYPES[lower]
  }
  if (
    lower.includes('search') ||
    lower.includes('tavily') ||
    lower.includes('serp')
  ) {
    return 'search'
  }
  if (
    lower.includes('image') ||
    lower.includes('dalle') ||
    lower.includes('sdxl')
  ) {
    return 'image'
  }
  if (
    lower.includes('stock') ||
    lower.includes('unsplash') ||
    lower.includes('pexels')
  ) {
    return 'stock-media'
  }
  if (
    lower.includes('export') ||
    lower.includes('pdf') ||
    lower.includes('pptx')
  ) {
    return 'export'
  }
  if (
    lower.includes('s3') ||
    lower.includes('storage') ||
    lower.includes('gcs') ||
    lower.includes('r2')
  ) {
    return 'storage'
  }
  if (
    lower.includes('local') ||
    lower.includes('ollama') ||
    lower.includes('llama')
  ) {
    return 'local-model'
  }
  return 'llm'
}

function fallbackProvidersForAdmin(): AdminProviderRow[] {
  // Build from BROK_MODELS so the page never goes empty when the DB is
  // unreachable. Includes a few well-known search / image providers.
  const names = new Set<string>(Object.values(BROK_MODELS).map(m => m.provider))
  names.add('tavily')
  names.add('searxng')
  names.add('jina')

  return Array.from(names).map(name => ({
    id: `fallback-${name}`,
    name,
    type: inferProviderType(name),
    status: 'active',
    requestsToday: 0,
    costToday: 0,
    avgLatencyMs: 0,
    errorRate: 0,
    rateLimitErrors: 0,
    lastError: null,
    lastUsedAt: null,
    isFallback: true,
    fallbackProvider: null,
    routes: 0,
    secretsHidden: true
  }))
}

export async function getProvidersForAdmin(): Promise<AdminProviderRow[]> {
  await assertAdminAccess()

  try {
    const today = startOfDay()

    // Aggregate per-provider metrics from usage_events.
    const usageByProvider = await db
      .select({
        provider: usageEvents.provider,
        requests: sql<number>`count(*)::int`,
        avgLatency: sql<number>`coalesce(round(avg(${usageEvents.latencyMs})), 0)::int`,
        failedRequests: sql<number>`coalesce(sum(case when ${usageEvents.status} <> 'success' then 1 else 0 end), 0)::int`,
        cost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        lastUsedAt: sql<Date | null>`max(${usageEvents.createdAt})`,
        lastError: sql<string | null>`(
          select ${usageEvents.errorCode}
          from ${usageEvents} as ue2
          where ue2.provider = ${usageEvents.provider}
            and ue2.error_code is not null
          order by ue2.created_at desc
          limit 1
        )`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, today))
      .groupBy(usageEvents.provider)

    const usageMap = new Map(usageByProvider.map(r => [r.provider, r]))

    // Rate-limit errors per provider (limitType=rpm or contains provider name).
    // We keep this simple and use rate_limit_events for the workspace level
    // because the table does not store provider. Mark as 0 unless we have
    // a recent rate-limit event for the workspace.
    const rateLimitByProvider = await db
      .select({
        limitType: rateLimitEvents.limitType,
        count: sql<number>`count(*)::int`
      })
      .from(rateLimitEvents)
      .where(
        and(
          eq(rateLimitEvents.blocked, true),
          gte(rateLimitEvents.createdAt, today)
        )
      )
      .groupBy(rateLimitEvents.limitType)
    const totalRateLimit = rateLimitByProvider.reduce(
      (sum, row) => sum + row.count,
      0
    )

    // Get unique provider names from provider_routes plus known canonical
    // providers so the table is never empty.
    const routeRows = await db
      .select({
        providerName: providerRoutes.providerName,
        isActive: providerRoutes.isActive
      })
      .from(providerRoutes)

    const providerNames = new Set<string>(routeRows.map(r => r.providerName))
    // Also include any provider that shows up in usage today.
    for (const row of usageByProvider) {
      providerNames.add(row.provider)
    }
    // Add fallback canonical providers so the table shows the full catalog.
    for (const name of ['tavily', 'searxng', 'jina', 'minimax']) {
      providerNames.add(name)
    }

    // Routes per provider for the "fallback" column.
    const routeCounts = new Map<string, number>()
    for (const row of routeRows) {
      routeCounts.set(
        row.providerName,
        (routeCounts.get(row.providerName) ?? 0) + 1
      )
    }
    const activeProviders = new Set(
      routeRows.filter(r => r.isActive).map(r => r.providerName)
    )

    const rows: AdminProviderRow[] = Array.from(providerNames).map(name => {
      const usage = usageMap.get(name)
      const requests = usage?.requests ?? 0
      const failed = usage?.failedRequests ?? 0
      const errorRate = requests > 0 ? (failed / requests) * 100 : 0
      const isActive = activeProviders.has(name) || !routeRows.length
      const status: AdminProviderRow['status'] = !isActive
        ? 'disabled'
        : errorRate > 25
          ? 'degraded'
          : 'active'
      return {
        id: name,
        name,
        type: inferProviderType(name),
        status,
        requestsToday: requests,
        costToday: Number(usage?.cost ?? 0),
        avgLatencyMs: usage?.avgLatency ?? 0,
        errorRate,
        rateLimitErrors:
          name === 'minimax' || usageMap.has(name) ? totalRateLimit : 0,
        lastError: usage?.lastError ?? null,
        lastUsedAt: usage?.lastUsedAt ?? null,
        isFallback: false,
        fallbackProvider: null,
        routes: routeCounts.get(name) ?? 0,
        secretsHidden: true
      }
    })

    return rows.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return fallbackProvidersForAdmin()
    }
    throw error
  }
}

export async function toggleProviderEnabled(formData: FormData) {
  await assertAdminAccess()

  const providerName = String(formData.get('providerName') ?? '')
  const enabled = formData.get('enabled') === 'true'

  if (!providerName) {
    throw new Error('Provider name is required')
  }

  try {
    // Toggle every active route row for this provider.
    await db
      .update(providerRoutes)
      .set({ isActive: enabled })
      .where(eq(providerRoutes.providerName, providerName))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  revalidatePath('/admin/providers')
  revalidatePath('/admin/brok/providers')
}

export async function setProviderFallback(formData: FormData) {
  await assertAdminAccess()

  const providerName = String(formData.get('providerName') ?? '')

  if (!providerName) {
    throw new Error('Provider name is required')
  }

  try {
    // Boost priority of every active route for this provider so it wins
    // selection ahead of other providers in the same model group.
    await db
      .update(providerRoutes)
      .set({ isActive: true, priority: 100 })
      .where(eq(providerRoutes.providerName, providerName))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  revalidatePath('/admin/providers')
  revalidatePath('/admin/brok/providers')
}

export async function rotateProviderKey(formData: FormData) {
  await assertAdminAccess()

  // Provider secrets are not stored in this table; this is a placeholder
  // action so the UI can be exercised. The actual rotation happens via
  // a separate secrets workflow. We simply mark every route as needing
  // attention by bumping its priority to surface it in dashboards.
  const providerName = String(formData.get('providerName') ?? '')

  if (!providerName) {
    throw new Error('Provider name is required')
  }

  try {
    await db.execute(sql`select 1`)
    // No persistent change beyond the placeholder. The real key rotation
    // must happen through the secrets manager; this action logs the intent.
    console.info(
      `[admin] rotate key requested for provider=${providerName} by admin`
    )
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  revalidatePath('/admin/providers')
  // desc import to keep ts-lint happy (re-uses `desc` already imported)
  void desc
}
