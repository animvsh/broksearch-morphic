'use server'

import { revalidatePath } from 'next/cache'

import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { BROK_MODELS } from '@/lib/brok/models'
import { db } from '@/lib/db'
import {
  apiKeys,
  providerRoutes,
  usageEvents,
  workspaces
} from '@/lib/db/schema'

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

function fallbackProviderRoutes(): Array<{
  id: string
  brokModel: string
  providerName: string
  providerModel: string
  priority: number | null
  inputCostPerMillion: string
  outputCostPerMillion: string
  isActive: boolean
}> {
  return Object.entries(BROK_MODELS)
    .map(([brokModel, config], index) => ({
      id: `fallback-${brokModel}`,
      brokModel,
      providerName: config.provider,
      providerModel: config.providerModel,
      priority: index + 1,
      inputCostPerMillion: config.inputCostPerMillion.toFixed(4),
      outputCostPerMillion: config.outputCostPerMillion.toFixed(4),
      isActive: true
    }))
    .sort((a, b) => a.brokModel.localeCompare(b.brokModel))
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function getUserEmailMap(
  userIds: string[]
): Promise<Record<string, string | undefined>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    return {}
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return {}
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey
      },
      cache: 'no-store'
    })

    if (!response.ok) {
      return {}
    }

    const data = (await response.json()) as {
      users?: Array<{ id: string; email?: string }>
    }

    return (data.users ?? []).reduce<Record<string, string | undefined>>(
      (acc, user) => {
        if (uniqueIds.includes(user.id)) {
          acc[user.id] = user.email
        }
        return acc
      },
      {}
    )
  } catch {
    return {}
  }
}

async function ensureProviderRoutesSeeded() {
  try {
    const existing = await db
      .select({
        id: providerRoutes.id,
        brokModel: providerRoutes.brokModel,
        providerModel: providerRoutes.providerModel
      })
      .from(providerRoutes)

    const existingModels = new Set(existing.map(route => route.brokModel))
    const missingModels = Object.entries(BROK_MODELS).filter(
      ([brokModel]) => !existingModels.has(brokModel)
    )

    if (missingModels.length === 0) {
      return
    }

    await db.insert(providerRoutes).values(
      missingModels.map(([brokModel, config]) => ({
        brokModel,
        providerName: config.provider,
        providerModel: config.providerModel,
        priority: 1,
        isActive: true,
        inputCostPerMillion: config.inputCostPerMillion.toFixed(4),
        outputCostPerMillion: config.outputCostPerMillion.toFixed(4)
      }))
    )

    for (const route of existing) {
      const config = BROK_MODELS[route.brokModel as keyof typeof BROK_MODELS]
      if (config && route.providerModel !== config.providerModel) {
        await db
          .update(providerRoutes)
          .set({
            providerName: config.provider,
            providerModel: config.providerModel,
            inputCostPerMillion: config.inputCostPerMillion.toFixed(4),
            outputCostPerMillion: config.outputCostPerMillion.toFixed(4),
            isActive: true
          })
          .where(eq(providerRoutes.id, route.id))
      }
    }
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return
    }

    throw error
  }
}

function revalidateAdminPaths() {
  revalidatePath('/admin/brok')
  revalidatePath('/admin/brok/api-keys')
  revalidatePath('/admin/brok/logs')
  revalidatePath('/admin/brok/providers')
  revalidatePath('/api-keys')
}

async function assertAdminAccess() {
  const access = await requireAdminAccess()

  if (!access.ok) {
    throw new Error(access.error)
  }
}

export async function getBrokStats() {
  await assertAdminAccess()

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [totalsRow] = await db
      .select({
        requestsToday: sql<number>`count(*)::int`,
        tokensToday: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
        revenueToday: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`,
        providerCostToday: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        avgLatencyMs: sql<number>`coalesce(round(avg(${usageEvents.latencyMs})), 0)::int`,
        failedRequests: sql<number>`coalesce(sum(case when ${usageEvents.status} <> 'success' then 1 else 0 end), 0)::int`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, today))

    const [activeKeysRow] = await db
      .select({
        count: sql<number>`count(*)::int`
      })
      .from(apiKeys)
      .where(eq(apiKeys.status, 'active'))

    const topUsersRows = await db
      .select({
        id: usageEvents.userId,
        workspace: workspaces.name,
        requestsToday: sql<number>`count(*)::int`,
        costToday: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .leftJoin(workspaces, eq(usageEvents.workspaceId, workspaces.id))
      .where(gte(usageEvents.createdAt, today))
      .groupBy(usageEvents.userId, workspaces.name)
      .orderBy(desc(sql`count(*)`))
      .limit(5)

    const userEmailMap = await getUserEmailMap(topUsersRows.map(row => row.id))

    const modelUsageRows = await db
      .select({
        id: usageEvents.model,
        count: sql<number>`count(*)::int`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, today))
      .groupBy(usageEvents.model)
      .orderBy(desc(sql`count(*)`))

    const totalModelRequests = modelUsageRows.reduce(
      (sum, row) => sum + row.count,
      0
    )

    return {
      requestsToday: totalsRow?.requestsToday ?? 0,
      tokensToday: totalsRow?.tokensToday ?? 0,
      revenueToday: toNumber(totalsRow?.revenueToday),
      providerCostToday: toNumber(totalsRow?.providerCostToday),
      avgLatencyMs: totalsRow?.avgLatencyMs ?? 0,
      failedRequests: totalsRow?.failedRequests ?? 0,
      activeApiKeys: activeKeysRow?.count ?? 0,
      topUsersByUsage: topUsersRows.map(row => ({
        id: row.id,
        email: userEmailMap[row.id] ?? row.id,
        workspace: row.workspace ?? 'Unknown workspace',
        requestsToday: row.requestsToday,
        costToday: toNumber(row.costToday)
      })),
      modelUsage: modelUsageRows.map(row => ({
        id: row.id,
        count: row.count,
        percentage:
          totalModelRequests > 0 ? (row.count / totalModelRequests) * 100 : 0
      }))
    }
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return {
        requestsToday: 0,
        tokensToday: 0,
        revenueToday: 0,
        providerCostToday: 0,
        avgLatencyMs: 0,
        failedRequests: 0,
        activeApiKeys: 0,
        topUsersByUsage: [],
        modelUsage: []
      }
    }

    throw error
  }
}

export async function getAllApiKeysForAdmin(): Promise<
  Array<{
    id: string
    name: string
    workspaceId: string
    workspaceName: string
    keyPrefix: string
    environment: string
    status: string
    scopes: string[]
    rpmLimit: number | null
    lastUsedAt: Date | null
    createdAt: Date
  }>
> {
  await assertAdminAccess()

  try {
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        workspaceId: apiKeys.workspaceId,
        workspaceName: workspaces.name,
        keyPrefix: apiKeys.keyPrefix,
        environment: apiKeys.environment,
        status: apiKeys.status,
        scopes: apiKeys.scopes,
        rpmLimit: apiKeys.rpmLimit,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt
      })
      .from(apiKeys)
      .leftJoin(workspaces, eq(apiKeys.workspaceId, workspaces.id))
      .orderBy(desc(apiKeys.createdAt))

    return keys.map(key => ({
      ...key,
      workspaceName: key.workspaceName ?? 'Unknown workspace',
      scopes: Array.isArray(key.scopes) ? (key.scopes as string[]) : []
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return []
    }

    throw error
  }
}

export async function getUsageForAdmin(filters: {
  dateFrom?: Date
  dateTo?: Date
  workspaceId?: string
  model?: string
  endpoint?: string
}): Promise<
  Array<{
    id: string
    requestId: string
    workspaceId: string
    workspaceName: string
    endpoint: string
    model: string
    provider: string
    inputTokens: number | null
    outputTokens: number | null
    providerCostUsd: string
    billedUsd: string
    latencyMs: number | null
    status: string
    createdAt: Date
  }>
> {
  await assertAdminAccess()

  try {
    const conditions = []

    if (filters.dateFrom) {
      conditions.push(gte(usageEvents.createdAt, filters.dateFrom))
    }

    if (filters.dateTo) {
      conditions.push(lte(usageEvents.createdAt, filters.dateTo))
    }

    if (filters.workspaceId) {
      conditions.push(eq(usageEvents.workspaceId, filters.workspaceId))
    }

    if (filters.model) {
      conditions.push(eq(usageEvents.model, filters.model))
    }

    if (filters.endpoint) {
      conditions.push(eq(usageEvents.endpoint, filters.endpoint as any))
    }

    const baseQuery = db
      .select({
        id: usageEvents.id,
        requestId: usageEvents.requestId,
        workspaceId: usageEvents.workspaceId,
        workspaceName: workspaces.name,
        endpoint: usageEvents.endpoint,
        model: usageEvents.model,
        provider: usageEvents.provider,
        inputTokens: usageEvents.inputTokens,
        outputTokens: usageEvents.outputTokens,
        providerCostUsd: usageEvents.providerCostUsd,
        billedUsd: usageEvents.billedUsd,
        latencyMs: usageEvents.latencyMs,
        status: usageEvents.status,
        createdAt: usageEvents.createdAt
      })
      .from(usageEvents)
      .leftJoin(workspaces, eq(usageEvents.workspaceId, workspaces.id))

    const rows =
      conditions.length > 0
        ? await baseQuery
            .where(and(...conditions))
            .orderBy(desc(usageEvents.createdAt))
            .limit(200)
        : await baseQuery.orderBy(desc(usageEvents.createdAt)).limit(200)

    return rows.map(row => ({
      ...row,
      endpoint: String(row.endpoint),
      providerCostUsd: row.providerCostUsd ?? '0',
      billedUsd: row.billedUsd ?? '0',
      workspaceName: row.workspaceName ?? 'Unknown workspace'
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return []
    }

    throw error
  }
}

export async function getProviderRoutes(): Promise<
  Array<{
    id: string
    brokModel: string
    providerName: string
    providerModel: string
    priority: number | null
    inputCostPerMillion: string
    outputCostPerMillion: string
    isActive: boolean
  }>
> {
  await assertAdminAccess()

  try {
    await ensureProviderRoutesSeeded()

    const routes = await db
      .select({
        id: providerRoutes.id,
        brokModel: providerRoutes.brokModel,
        providerName: providerRoutes.providerName,
        providerModel: providerRoutes.providerModel,
        priority: providerRoutes.priority,
        inputCostPerMillion: providerRoutes.inputCostPerMillion,
        outputCostPerMillion: providerRoutes.outputCostPerMillion,
        isActive: providerRoutes.isActive
      })
      .from(providerRoutes)
      .orderBy(asc(providerRoutes.brokModel), asc(providerRoutes.priority))

    return routes.map(route => ({
      ...route,
      inputCostPerMillion: route.inputCostPerMillion ?? '0',
      outputCostPerMillion: route.outputCostPerMillion ?? '0'
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return fallbackProviderRoutes()
    }

    throw error
  }
}

export async function updateProviderRoute(
  id: string,
  updates: {
    isActive?: boolean
    priority?: number
    inputCostPerMillion?: string
    outputCostPerMillion?: string
  }
) {
  await assertAdminAccess()

  try {
    await db
      .update(providerRoutes)
      .set(updates)
      .where(eq(providerRoutes.id, id))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  revalidateAdminPaths()
}

export async function saveProviderRoute(formData: FormData) {
  await assertAdminAccess()

  const id = String(formData.get('id') ?? '')
  const priority = Number(formData.get('priority') ?? 1)
  const inputCostPerMillion = String(formData.get('inputCostPerMillion') ?? '0')
  const outputCostPerMillion = String(
    formData.get('outputCostPerMillion') ?? '0'
  )
  const isActive = formData.get('isActive') === 'on'

  if (!id) {
    throw new Error('Provider route id is required')
  }

  await updateProviderRoute(id, {
    priority: Number.isFinite(priority) ? priority : 1,
    inputCostPerMillion,
    outputCostPerMillion,
    isActive
  })
}

export async function pauseAdminApiKey(keyId: string) {
  await assertAdminAccess()

  try {
    await db
      .update(apiKeys)
      .set({ status: 'paused' })
      .where(eq(apiKeys.id, keyId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  revalidateAdminPaths()
}

export async function resumeAdminApiKey(keyId: string) {
  await assertAdminAccess()

  try {
    await db
      .update(apiKeys)
      .set({ status: 'active' })
      .where(eq(apiKeys.id, keyId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  revalidateAdminPaths()
}

export async function revokeAdminApiKey(keyId: string) {
  await assertAdminAccess()

  try {
    await db
      .update(apiKeys)
      .set({
        status: 'revoked',
        revokedAt: new Date()
      })
      .where(eq(apiKeys.id, keyId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  revalidateAdminPaths()
}
