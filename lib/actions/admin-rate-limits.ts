'use server'

import { revalidatePath } from 'next/cache'

import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import {
  LIMIT_TYPES,
  LimitTypeDescriptor,
  PLAN_LIMITS,
  PlanLimitRow
} from '@/lib/brok/admin-rate-limits-catalog'
import { db } from '@/lib/db'
import {
  apiKeys,
  rateLimitEvents,
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

function startOfDay(date = new Date()) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function startOfMonth(date = new Date()) {
  const value = new Date(date)
  value.setDate(1)
  value.setHours(0, 0, 0, 0)
  return value
}

async function assertAdminAccess() {
  const access = await requireAdminAccess()

  if (!access.ok) {
    throw new Error(access.error)
  }
}

export interface AdminRateLimitEvent {
  id: string
  workspaceId: string
  workspaceName: string
  plan: string
  apiKeyName: string
  keyPrefix: string | null
  environment: string
  limitType: string
  limitValue: number
  currentValue: number
  blocked: boolean
  createdAt: Date
}

export interface RateLimitOverview {
  events: AdminRateLimitEvent[]
  totals: {
    checks: number
    blocked: number
    blockedByLimitType: Array<{ limitType: string; count: number }>
    workspaces: number
    keys: number
  }
  planUsage: Array<{
    plan: string
    workspaces: number
    apiKeys: number
    requestsToday: number
    blockedToday: number
  }>
  planLimits: PlanLimitRow[]
  limitTypes: LimitTypeDescriptor[]
}

export async function getRateLimitOverviewForAdmin(): Promise<RateLimitOverview> {
  await assertAdminAccess()

  const today = startOfDay()
  const monthStart = startOfMonth()

  let events: AdminRateLimitEvent[] = []
  let totalChecks = 0
  let totalBlocked = 0
  const blockedByLimitType: Array<{ limitType: string; count: number }> = []

  try {
    const rows = await db
      .select({
        id: rateLimitEvents.id,
        workspaceId: rateLimitEvents.workspaceId,
        workspaceName: workspaces.name,
        plan: workspaces.plan,
        apiKeyName: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        environment: apiKeys.environment,
        limitType: rateLimitEvents.limitType,
        limitValue: rateLimitEvents.limitValue,
        currentValue: rateLimitEvents.currentValue,
        blocked: rateLimitEvents.blocked,
        createdAt: rateLimitEvents.createdAt
      })
      .from(rateLimitEvents)
      .leftJoin(workspaces, eq(rateLimitEvents.workspaceId, workspaces.id))
      .leftJoin(apiKeys, eq(rateLimitEvents.apiKeyId, apiKeys.id))
      .orderBy(desc(rateLimitEvents.createdAt))
      .limit(200)

    events = rows.map(row => ({
      id: row.id,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName ?? 'Unknown workspace',
      plan: row.plan ?? 'free',
      apiKeyName: row.apiKeyName ?? 'Unknown key',
      keyPrefix: row.keyPrefix ?? null,
      environment: row.environment ?? 'test',
      limitType: row.limitType,
      limitValue: row.limitValue,
      currentValue: row.currentValue,
      blocked: row.blocked,
      createdAt: row.createdAt
    }))

    totalChecks = events.length
    totalBlocked = events.filter(e => e.blocked).length

    const blockedMap = new Map<string, number>()
    for (const event of events) {
      if (!event.blocked) continue
      blockedMap.set(
        event.limitType,
        (blockedMap.get(event.limitType) ?? 0) + 1
      )
    }
    for (const [limitType, count] of blockedMap) {
      blockedByLimitType.push({ limitType, count })
    }
    blockedByLimitType.sort((a, b) => b.count - a.count)
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  let planUsage: RateLimitOverview['planUsage'] = []
  let workspaceCount = 0
  let keyCount = 0

  try {
    const workspaceRows = await db
      .select({
        plan: workspaces.plan,
        count: sql<number>`count(*)::int`
      })
      .from(workspaces)
      .groupBy(workspaces.plan)

    const keyRows = await db
      .select({
        plan: workspaces.plan,
        count: sql<number>`count(${apiKeys.id})::int`
      })
      .from(workspaces)
      .leftJoin(apiKeys, eq(apiKeys.workspaceId, workspaces.id))
      .groupBy(workspaces.plan)

    const usageRows = await db
      .select({
        plan: workspaces.plan,
        requests: sql<number>`count(${usageEvents.id})::int`
      })
      .from(workspaces)
      .leftJoin(usageEvents, eq(usageEvents.workspaceId, workspaces.id))
      .where(gte(usageEvents.createdAt, today))
      .groupBy(workspaces.plan)

    const planMap = new Map<
      string,
      { workspaces: number; apiKeys: number; requests: number }
    >()

    for (const row of workspaceRows) {
      planMap.set(row.plan, { workspaces: row.count, apiKeys: 0, requests: 0 })
      workspaceCount += row.count
    }
    for (const row of keyRows) {
      const entry = planMap.get(row.plan) ?? {
        workspaces: 0,
        apiKeys: 0,
        requests: 0
      }
      entry.apiKeys = row.count
      keyCount += row.count
      planMap.set(row.plan, entry)
    }
    for (const row of usageRows) {
      const entry = planMap.get(row.plan) ?? {
        workspaces: 0,
        apiKeys: 0,
        requests: 0
      }
      entry.requests = row.requests
      planMap.set(row.plan, entry)
    }

    const blockedByPlan = new Map<string, number>()
    for (const event of events) {
      if (!event.blocked) continue
      blockedByPlan.set(event.plan, (blockedByPlan.get(event.plan) ?? 0) + 1)
    }

    planUsage = Array.from(planMap.entries())
      .map(([plan, value]) => ({
        plan,
        workspaces: value.workspaces,
        apiKeys: value.apiKeys,
        requestsToday: value.requests,
        blockedToday: blockedByPlan.get(plan) ?? 0
      }))
      .sort((a, b) => b.requestsToday - a.requestsToday)
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  void monthStart

  return {
    events,
    totals: {
      checks: totalChecks,
      blocked: totalBlocked,
      blockedByLimitType,
      workspaces: workspaceCount,
      keys: keyCount
    },
    planUsage,
    planLimits: PLAN_LIMITS,
    limitTypes: LIMIT_TYPES
  }
}

export async function savePlanLimits(formData: FormData) {
  await assertAdminAccess()

  const plan = String(formData.get('plan') ?? '')
  if (!plan) {
    throw new Error('Plan is required')
  }

  console.info(
    `[admin] plan limits save requested for plan=${plan} (catalog only)`
  )

  revalidatePath('/admin/rate-limits')
}
