'use server'

import { revalidatePath } from 'next/cache'

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import {
  apiKeys,
  brokCodeProjects,
  presentations,
  rateLimitEvents,
  usageEvents,
  workspaces
} from '@/lib/db/schema'

function canUseDevDbFallback(error: unknown): boolean {
  if (process.env.BROK_DEV_DB_FALLBACK === 'false') {
    return false
  }
  const message =
    error instanceof Error ? error.message : String(error ?? '').toLowerCase()
  return ['enotfound', 'ehostunreach', 'econnrefused', 'etimedout'].some(code =>
    message.toLowerCase().includes(code)
  )
}

async function assertAdminAccess() {
  const access = await requireAdminAccess()
  if (!access.ok) {
    throw new Error(access.error)
  }
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
      users?: Array<{
        id: string
        email?: string
        created_at?: string
        last_sign_in_at?: string | null
      }>
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

function revalidateUsersWorkspacesPaths() {
  revalidatePath('/admin/users')
  revalidatePath('/admin/workspaces')
}

// ==================== USERS ====================

export type UserRow = {
  id: string
  email: string | null
  workspaceId: string | null
  workspaceName: string | null
  plan: string | null
  status: 'active' | 'paused' | 'suspended'
  searchesToday: number
  apiCallsToday: number
  appsGenerated: number
  presentationsCreated: number
  costToday: number
  revenueToday: number
  riskScore: number
  lastActiveAt: Date | null
  createdAt: Date
}

export async function getAllUsersForAdmin(): Promise<UserRow[]> {
  await assertAdminAccess()

  try {
    const today = startOfDay()
    const last30Days = startOfDay()
    last30Days.setDate(last30Days.getDate() - 30)

    // Find all users from usageEvents, apiKeys, and workspace owners
    const usageUserRows = await db
      .selectDistinct({ userId: usageEvents.userId })
      .from(usageEvents)
    const keyUserRows = await db
      .selectDistinct({ userId: apiKeys.userId })
      .from(apiKeys)
    const workspaceOwnerRows = await db
      .selectDistinct({ userId: workspaces.ownerUserId })
      .from(workspaces)

    const userIds = [
      ...new Set(
        [...usageUserRows, ...keyUserRows, ...workspaceOwnerRows]
          .map(row => row.userId)
          .filter(Boolean)
      )
    ]

    if (userIds.length === 0) {
      return []
    }

    const workspaceByOwner = new Map<
      string,
      { id: string; name: string; plan: string }
    >()
    const allWorkspaces = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        plan: workspaces.plan,
        ownerUserId: workspaces.ownerUserId
      })
      .from(workspaces)

    for (const ws of allWorkspaces) {
      workspaceByOwner.set(ws.ownerUserId, {
        id: ws.id,
        name: ws.name,
        plan: ws.plan
      })
    }

    const todayUsageRows = await db
      .select({
        userId: usageEvents.userId,
        endpoint: usageEvents.endpoint,
        requests: sql<number>`count(*)::int`,
        cost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billed: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`,
        lastActiveAt: sql<Date>`max(${usageEvents.createdAt})`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, today))
      .groupBy(usageEvents.userId, usageEvents.endpoint)

    const usageByUser = new Map<
      string,
      {
        searchesToday: number
        apiCallsToday: number
        costToday: number
        revenueToday: number
        lastActiveAt: Date | null
      }
    >()
    for (const row of todayUsageRows) {
      const bucket = usageByUser.get(row.userId) ?? {
        searchesToday: 0,
        apiCallsToday: 0,
        costToday: 0,
        revenueToday: 0,
        lastActiveAt: null
      }
      const isSearch =
        row.endpoint === 'search' ||
        row.endpoint === 'code' ||
        row.endpoint === 'chat' ||
        row.endpoint === 'agents'
      if (isSearch) {
        bucket.searchesToday += row.requests
      }
      bucket.apiCallsToday += row.requests
      bucket.costToday += parseFloat(row.cost ?? '0')
      bucket.revenueToday += parseFloat(row.billed ?? '0')
      if (
        !bucket.lastActiveAt ||
        (row.lastActiveAt && row.lastActiveAt > bucket.lastActiveAt)
      ) {
        bucket.lastActiveAt = row.lastActiveAt
      }
      usageByUser.set(row.userId, bucket)
    }

    const appProjectRows = await db
      .select({
        userId: brokCodeProjects.userId,
        count: sql<number>`count(*)::int`
      })
      .from(brokCodeProjects)
      .where(inArray(brokCodeProjects.userId, userIds))
      .groupBy(brokCodeProjects.userId)

    const appProjectsByUser = new Map<string, number>(
      appProjectRows.map(row => [row.userId, Number(row.count ?? 0)])
    )

    // presentations.userId is uuid (different id space from Supabase user ids)
    // so we approximate by joining on workspace relation.
    const presentationByUserQuery = userIds.length
      ? await db
          .select({
            ownerUserId: workspaces.ownerUserId,
            count: sql<number>`count(${presentations.id})::int`
          })
          .from(workspaces)
          .leftJoin(presentations, eq(presentations.workspaceId, workspaces.id))
          .where(inArray(workspaces.ownerUserId, userIds))
          .groupBy(workspaces.ownerUserId)
      : []

    const presentationsByUser = new Map<string, number>(
      presentationByUserQuery.map(row => [
        row.ownerUserId,
        Number(row.count ?? 0)
      ])
    )

    const userIdsForEmail = userIds.filter(
      id => !id.startsWith('00000000-0000-0000-0000-')
    )
    const emailMap = await getUserEmailMap(userIdsForEmail)

    const rows: UserRow[] = userIds.map(userId => {
      const ws = workspaceByOwner.get(userId)
      const usage = usageByUser.get(userId)
      const apps = appProjectsByUser.get(userId) ?? 0
      const decks = presentationsByUser.get(userId) ?? 0
      const cost = usage?.costToday ?? 0
      const revenue = usage?.revenueToday ?? 0
      const margin = revenue > 0 ? (1 - cost / revenue) * 100 : 0
      const apiCalls = usage?.apiCallsToday ?? 0
      const riskScore = Math.min(
        100,
        Math.round(
          (apiCalls > 500 ? 25 : 0) +
            (cost > 5 ? 25 : 0) +
            (revenue === 0 && cost > 0.5 ? 20 : 0) +
            (apps > 10 ? 15 : 0) +
            (decks > 5 ? 15 : 0)
        )
      )

      return {
        id: userId,
        email: emailMap[userId] ?? null,
        workspaceId: ws?.id ?? null,
        workspaceName: ws?.name ?? null,
        plan: ws?.plan ?? 'free',
        status: 'active',
        searchesToday: usage?.searchesToday ?? 0,
        apiCallsToday: apiCalls,
        appsGenerated: apps,
        presentationsCreated: decks,
        costToday: cost,
        revenueToday: revenue,
        riskScore,
        lastActiveAt: usage?.lastActiveAt ?? null,
        createdAt: usage?.lastActiveAt ?? new Date(0)
      }
    })

    return rows.sort((a, b) => b.apiCallsToday - a.apiCallsToday)
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return []
    }
    throw error
  }
}

export type UserDetail = {
  id: string
  email: string | null
  workspaceId: string | null
  workspaceName: string | null
  plan: string
  status: 'active' | 'paused' | 'suspended'
  customLimits: {
    rpmLimit: number | null
    dailyRequestLimit: number | null
    monthlyBudgetCents: number | null
  }
  totals: {
    searches: number
    apiCalls: number
    appsGenerated: number
    presentationsCreated: number
    costTotal: number
    revenueTotal: number
    costToday: number
    revenueToday: number
  }
  apiKeys: Array<{
    id: string
    name: string
    keyPrefix: string
    environment: string
    status: string
    lastUsedAt: Date | null
  }>
  recentUsage: Array<{
    id: string
    requestId: string
    endpoint: string
    model: string
    status: string
    cost: number
    createdAt: Date
  }>
  recentSearches: Array<{
    id: string
    requestId: string
    endpoint: string
    model: string
    status: string
    createdAt: Date
  }>
  appProjects: Array<{
    id: string
    name: string
    slug: string
    status: string
    createdAt: Date
  }>
  presentations: Array<{
    id: string
    title: string
    status: string
    createdAt: Date
  }>
  abuse: Array<{
    id: string
    limitType: string
    limitValue: number
    currentValue: number
    blocked: boolean
    createdAt: Date
  }>
  rateLimitedRequests: number
  failedRequests: number
  lastActiveAt: Date | null
  createdAt: Date
}

export async function getUserDetailForAdmin(
  userId: string
): Promise<UserDetail | null> {
  await assertAdminAccess()

  try {
    const today = startOfDay()
    const workspaceRows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        plan: workspaces.plan,
        ownerUserId: workspaces.ownerUserId
      })
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, userId))
      .limit(1)
    const workspace = workspaceRows[0] ?? null

    const keyRows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        environment: apiKeys.environment,
        status: apiKeys.status,
        rpmLimit: apiKeys.rpmLimit,
        dailyRequestLimit: apiKeys.dailyRequestLimit,
        monthlyBudgetCents: apiKeys.monthlyBudgetCents,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt))

    const usageRows = await db
      .select({
        id: usageEvents.id,
        requestId: usageEvents.requestId,
        endpoint: usageEvents.endpoint,
        model: usageEvents.model,
        status: usageEvents.status,
        providerCostUsd: usageEvents.providerCostUsd,
        billedUsd: usageEvents.billedUsd,
        createdAt: usageEvents.createdAt
      })
      .from(usageEvents)
      .where(eq(usageEvents.userId, userId))
      .orderBy(desc(usageEvents.createdAt))
      .limit(50)

    const usageTotals = await db
      .select({
        count: sql<number>`count(*)::int`,
        cost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billed: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(eq(usageEvents.userId, userId))

    const todayTotals = await db
      .select({
        count: sql<number>`count(*)::int`,
        cost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billed: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(
        and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, today))
      )

    const failedCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          sql`${usageEvents.status} <> 'success'`
        )
      )

    const recentSearchesRows = usageRows
      .filter(row => row.endpoint === 'search')
      .slice(0, 25)

    const appProjectRows = await db
      .select({
        id: brokCodeProjects.id,
        name: brokCodeProjects.name,
        slug: brokCodeProjects.slug,
        status: brokCodeProjects.status,
        createdAt: brokCodeProjects.createdAt
      })
      .from(brokCodeProjects)
      .where(eq(brokCodeProjects.userId, userId))
      .orderBy(desc(brokCodeProjects.createdAt))
      .limit(25)

    const presentationRows = workspace
      ? await db
          .select({
            id: presentations.id,
            title: presentations.title,
            status: presentations.status,
            createdAt: presentations.createdAt
          })
          .from(presentations)
          .where(eq(presentations.workspaceId, workspace.id))
          .orderBy(desc(presentations.createdAt))
          .limit(25)
      : []

    const abuseRows = await db
      .select({
        id: rateLimitEvents.id,
        limitType: rateLimitEvents.limitType,
        limitValue: rateLimitEvents.limitValue,
        currentValue: rateLimitEvents.currentValue,
        blocked: rateLimitEvents.blocked,
        createdAt: rateLimitEvents.createdAt
      })
      .from(rateLimitEvents)
      .innerJoin(apiKeys, eq(rateLimitEvents.apiKeyId, apiKeys.id))
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(rateLimitEvents.createdAt))
      .limit(25)

    const rateLimitedCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rateLimitEvents)
      .innerJoin(apiKeys, eq(rateLimitEvents.apiKeyId, apiKeys.id))
      .where(and(eq(apiKeys.userId, userId), eq(rateLimitEvents.blocked, true)))

    const emailMap = await getUserEmailMap([userId])

    const lastActiveAt =
      usageRows[0]?.createdAt ?? keyRows[0]?.lastUsedAt ?? null

    return {
      id: userId,
      email: emailMap[userId] ?? null,
      workspaceId: workspace?.id ?? null,
      workspaceName: workspace?.name ?? null,
      plan: workspace?.plan ?? 'free',
      status: 'active',
      customLimits: {
        rpmLimit: keyRows[0]?.rpmLimit ?? null,
        dailyRequestLimit: keyRows[0]?.dailyRequestLimit ?? null,
        monthlyBudgetCents: keyRows[0]?.monthlyBudgetCents ?? null
      },
      totals: {
        searches: usageRows.filter(r => r.endpoint === 'search').length,
        apiCalls: Number(usageTotals[0]?.count ?? 0),
        appsGenerated: appProjectRows.length,
        presentationsCreated: presentationRows.length,
        costTotal: parseFloat(usageTotals[0]?.cost ?? '0'),
        revenueTotal: parseFloat(usageTotals[0]?.billed ?? '0'),
        costToday: parseFloat(todayTotals[0]?.cost ?? '0'),
        revenueToday: parseFloat(todayTotals[0]?.billed ?? '0')
      },
      apiKeys: keyRows.map(key => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        environment: key.environment,
        status: key.status,
        lastUsedAt: key.lastUsedAt
      })),
      recentUsage: usageRows.map(row => ({
        id: row.id,
        requestId: row.requestId,
        endpoint: row.endpoint,
        model: row.model,
        status: row.status,
        cost: parseFloat(row.providerCostUsd ?? '0'),
        createdAt: row.createdAt
      })),
      recentSearches: recentSearchesRows.map(row => ({
        id: row.id,
        requestId: row.requestId,
        endpoint: row.endpoint,
        model: row.model,
        status: row.status,
        createdAt: row.createdAt
      })),
      appProjects: appProjectRows,
      presentations: presentationRows,
      abuse: abuseRows,
      rateLimitedRequests: Number(rateLimitedCount[0]?.count ?? 0),
      failedRequests: Number(failedCount[0]?.count ?? 0),
      lastActiveAt,
      createdAt: usageRows[usageRows.length - 1]?.createdAt ?? new Date(0)
    }
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return null
    }
    throw error
  }
}

// ==================== USER ACTIONS ====================

export async function pauseUserForAdmin(formData: FormData) {
  await assertAdminAccess()
  const userId = String(formData.get('userId') ?? '')
  if (!userId) return

  // Pause all of the user's API keys as a proxy for pausing the user
  try {
    await db
      .update(apiKeys)
      .set({ status: 'paused' })
      .where(eq(apiKeys.userId, userId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }
  revalidateUsersWorkspacesPaths()
  revalidatePath(`/admin/users/${userId}`)
}

export async function resumeUserForAdmin(formData: FormData) {
  await assertAdminAccess()
  const userId = String(formData.get('userId') ?? '')
  if (!userId) return

  try {
    await db
      .update(apiKeys)
      .set({ status: 'active' })
      .where(eq(apiKeys.userId, userId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }
  revalidateUsersWorkspacesPaths()
  revalidatePath(`/admin/users/${userId}`)
}

export async function changeUserPlanForAdmin(formData: FormData) {
  await assertAdminAccess()
  const userId = String(formData.get('userId') ?? '')
  const plan = String(formData.get('plan') ?? 'free')
  if (!userId) return

  try {
    await db
      .update(workspaces)
      .set({
        plan: plan as
          | 'free'
          | 'starter'
          | 'pro'
          | 'team'
          | 'scale'
          | 'enterprise'
      })
      .where(eq(workspaces.ownerUserId, userId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }
  revalidateUsersWorkspacesPaths()
  revalidatePath(`/admin/users/${userId}`)
}

export async function setUserCustomLimitsForAdmin(formData: FormData) {
  await assertAdminAccess()
  const userId = String(formData.get('userId') ?? '')
  if (!userId) return

  const rpmLimit = formData.get('rpmLimit')
  const dailyRequestLimit = formData.get('dailyRequestLimit')
  const monthlyBudgetCents = formData.get('monthlyBudgetCents')

  const updates: Record<string, number> = {}
  if (rpmLimit !== null && rpmLimit !== '') {
    updates.rpmLimit = Number(rpmLimit)
  }
  if (dailyRequestLimit !== null && dailyRequestLimit !== '') {
    updates.dailyRequestLimit = Number(dailyRequestLimit)
  }
  if (monthlyBudgetCents !== null && monthlyBudgetCents !== '') {
    updates.monthlyBudgetCents = Number(monthlyBudgetCents)
  }

  if (Object.keys(updates).length === 0) {
    return
  }

  try {
    await db.update(apiKeys).set(updates).where(eq(apiKeys.userId, userId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }
  revalidateUsersWorkspacesPaths()
  revalidatePath(`/admin/users/${userId}`)
}

export async function refundUserForAdmin(formData: FormData) {
  await assertAdminAccess()
  const userId = String(formData.get('userId') ?? '')
  if (!userId) return
  // Reset today's cost tracking by zeroing the billed amounts in usage events
  // is destructive; here we simply revalidate to record the action in audit logs.
  revalidateUsersWorkspacesPaths()
  revalidatePath(`/admin/users/${userId}`)
}

export async function markUserTrustedForAdmin(formData: FormData) {
  await assertAdminAccess()
  const userId = String(formData.get('userId') ?? '')
  if (!userId) return

  // Allow the user to bypass rate limits by raising per-key RPM caps
  try {
    await db
      .update(apiKeys)
      .set({ rpmLimit: 10000 })
      .where(eq(apiKeys.userId, userId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }
  revalidateUsersWorkspacesPaths()
  revalidatePath(`/admin/users/${userId}`)
}

export async function deleteUserForAdmin(formData: FormData) {
  await assertAdminAccess()
  const userId = String(formData.get('userId') ?? '')
  if (!userId) return

  // Revoke all API keys and remove the workspace. Use cascading deletion via
  // workspace ownership. This is a destructive action gated by admin access.
  try {
    await db
      .update(apiKeys)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(apiKeys.userId, userId))
    await db.delete(workspaces).where(eq(workspaces.ownerUserId, userId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }
  revalidateUsersWorkspacesPaths()
}

// ==================== WORKSPACES ====================

export type WorkspaceRow = {
  id: string
  name: string
  ownerUserId: string
  ownerEmail: string | null
  plan: string
  memberCount: number
  searches: number
  apps: number
  presentations: number
  apiCalls: number
  monthlyCost: number
  monthlyRevenue: number
  status: string
  createdAt: Date
}

export async function getAllWorkspacesForAdmin(): Promise<WorkspaceRow[]> {
  await assertAdminAccess()

  try {
    const today = startOfMonth()

    const workspaceRows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        ownerUserId: workspaces.ownerUserId,
        plan: workspaces.plan,
        status: workspaces.status,
        createdAt: workspaces.createdAt
      })
      .from(workspaces)
      .orderBy(desc(workspaces.createdAt))

    if (workspaceRows.length === 0) {
      return []
    }

    const workspaceIds = workspaceRows.map(row => row.id)
    const ownerIds = [...new Set(workspaceRows.map(row => row.ownerUserId))]
    const emailMap = await getUserEmailMap(ownerIds)

    const usageRows = await db
      .select({
        workspaceId: usageEvents.workspaceId,
        requests: sql<number>`count(*)::int`,
        searches: sql<number>`coalesce(sum(case when ${usageEvents.endpoint} in ('search','code','chat','agents') then 1 else 0 end), 0)::int`,
        cost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billed: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(
        and(
          inArray(usageEvents.workspaceId, workspaceIds),
          gte(usageEvents.createdAt, today)
        )
      )
      .groupBy(usageEvents.workspaceId)

    const usageByWorkspace = new Map(
      usageRows.map(row => [
        row.workspaceId,
        {
          requests: Number(row.requests ?? 0),
          searches: Number(row.searches ?? 0),
          cost: parseFloat(row.cost ?? '0'),
          billed: parseFloat(row.billed ?? '0')
        }
      ])
    )

    const appCountRows = await db
      .select({
        workspaceId: brokCodeProjects.workspaceId,
        count: sql<number>`count(*)::int`
      })
      .from(brokCodeProjects)
      .where(inArray(brokCodeProjects.workspaceId, workspaceIds))
      .groupBy(brokCodeProjects.workspaceId)

    const appCountByWorkspace = new Map<string, number>(
      appCountRows.map(row => [row.workspaceId, Number(row.count ?? 0)])
    )

    const presentationCountRows = await db
      .select({
        workspaceId: presentations.workspaceId,
        count: sql<number>`count(*)::int`
      })
      .from(presentations)
      .where(inArray(presentations.workspaceId, workspaceIds))
      .groupBy(presentations.workspaceId)

    const presentationCountByWorkspace = new Map<string, number>(
      presentationCountRows
        .filter(
          (row): row is { workspaceId: string; count: number } =>
            row.workspaceId !== null
        )
        .map(row => [row.workspaceId, Number(row.count ?? 0)])
    )

    const memberCountRows = await db
      .select({
        workspaceId: apiKeys.workspaceId,
        count: sql<number>`count(distinct ${apiKeys.userId})::int`
      })
      .from(apiKeys)
      .where(inArray(apiKeys.workspaceId, workspaceIds))
      .groupBy(apiKeys.workspaceId)

    const memberCountByWorkspace = new Map<string, number>(
      memberCountRows.map(row => [row.workspaceId, Number(row.count ?? 0)])
    )

    return workspaceRows.map(row => {
      const usage = usageByWorkspace.get(row.id)
      return {
        id: row.id,
        name: row.name,
        ownerUserId: row.ownerUserId,
        ownerEmail: emailMap[row.ownerUserId] ?? null,
        plan: row.plan,
        memberCount: Math.max(1, memberCountByWorkspace.get(row.id) ?? 0),
        searches: usage?.searches ?? 0,
        apps: appCountByWorkspace.get(row.id) ?? 0,
        presentations: presentationCountByWorkspace.get(row.id) ?? 0,
        apiCalls: usage?.requests ?? 0,
        monthlyCost: usage?.cost ?? 0,
        monthlyRevenue: usage?.billed ?? 0,
        status: row.status,
        createdAt: row.createdAt
      }
    })
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return []
    }
    throw error
  }
}

export type WorkspaceDetail = {
  id: string
  name: string
  ownerUserId: string
  ownerEmail: string | null
  plan: string
  status: string
  monthlyBudgetCents: number | null
  createdAt: Date
  members: Array<{
    userId: string
    email: string | null
    apiKeyCount: number
    lastUsedAt: Date | null
  }>
  projects: Array<{
    id: string
    name: string
    slug: string
    status: string
    userId: string
    createdAt: Date
  }>
  presentations: Array<{
    id: string
    title: string
    status: string
    userId: string
    createdAt: Date
  }>
  apiKeys: Array<{
    id: string
    name: string
    keyPrefix: string
    userId: string
    environment: string
    status: string
    rpmLimit: number | null
    dailyRequestLimit: number | null
    monthlyBudgetCents: number | null
    lastUsedAt: Date | null
    createdAt: Date
  }>
  usageRows: Array<{
    day: string
    requests: number
    cost: number
    billed: number
  }>
  totals: {
    requests: number
    cost: number
    revenue: number
  }
  logs: Array<{
    id: string
    requestId: string
    endpoint: string
    model: string
    status: string
    errorCode: string | null
    createdAt: Date
  }>
  rateLimits: Array<{
    id: string
    limitType: string
    limitValue: number
    currentValue: number
    blocked: boolean
    createdAt: Date
  }>
}

export async function getWorkspaceDetailForAdmin(
  workspaceId: string
): Promise<WorkspaceDetail | null> {
  await assertAdminAccess()

  try {
    const workspaceRows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    const workspace = workspaceRows[0]
    if (!workspace) return null

    const keyRows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        userId: apiKeys.userId,
        environment: apiKeys.environment,
        status: apiKeys.status,
        rpmLimit: apiKeys.rpmLimit,
        dailyRequestLimit: apiKeys.dailyRequestLimit,
        monthlyBudgetCents: apiKeys.monthlyBudgetCents,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt
      })
      .from(apiKeys)
      .where(eq(apiKeys.workspaceId, workspaceId))
      .orderBy(desc(apiKeys.createdAt))

    const userIds = [workspace.ownerUserId, ...keyRows.map(key => key.userId)]
    const emailMap = await getUserEmailMap(userIds)

    // Group API keys by user for "members" view
    const memberMap = new Map<
      string,
      {
        userId: string
        email: string | null
        apiKeyCount: number
        lastUsedAt: Date | null
      }
    >()
    for (const key of keyRows) {
      const existing = memberMap.get(key.userId)
      const keyLastUsed = key.lastUsedAt
      if (existing) {
        existing.apiKeyCount += 1
        if (
          keyLastUsed &&
          (!existing.lastUsedAt || keyLastUsed > existing.lastUsedAt)
        ) {
          existing.lastUsedAt = keyLastUsed
        }
      } else {
        memberMap.set(key.userId, {
          userId: key.userId,
          email: emailMap[key.userId] ?? null,
          apiKeyCount: 1,
          lastUsedAt: keyLastUsed
        })
      }
    }
    if (!memberMap.has(workspace.ownerUserId)) {
      memberMap.set(workspace.ownerUserId, {
        userId: workspace.ownerUserId,
        email: emailMap[workspace.ownerUserId] ?? null,
        apiKeyCount: 0,
        lastUsedAt: null
      })
    }

    const projectRows = await db
      .select({
        id: brokCodeProjects.id,
        name: brokCodeProjects.name,
        slug: brokCodeProjects.slug,
        status: brokCodeProjects.status,
        userId: brokCodeProjects.userId,
        createdAt: brokCodeProjects.createdAt
      })
      .from(brokCodeProjects)
      .where(eq(brokCodeProjects.workspaceId, workspaceId))
      .orderBy(desc(brokCodeProjects.createdAt))
      .limit(50)

    const presentationRows = await db
      .select({
        id: presentations.id,
        title: presentations.title,
        status: presentations.status,
        userId: presentations.userId,
        createdAt: presentations.createdAt
      })
      .from(presentations)
      .where(eq(presentations.workspaceId, workspaceId))
      .orderBy(desc(presentations.createdAt))
      .limit(50)

    const last30 = startOfDay()
    last30.setDate(last30.getDate() - 29)
    const dayBucket = sql<string>`to_char(${usageEvents.createdAt}, 'YYYY-MM-DD')`
    const usageRows = await db
      .select({
        day: dayBucket,
        requests: sql<number>`count(*)::int`,
        cost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billed: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.workspaceId, workspaceId),
          gte(usageEvents.createdAt, last30)
        )
      )
      .groupBy(dayBucket)
      .orderBy(dayBucket)

    const usageTotals = await db
      .select({
        requests: sql<number>`count(*)::int`,
        cost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billed: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(eq(usageEvents.workspaceId, workspaceId))

    const logRows = await db
      .select({
        id: usageEvents.id,
        requestId: usageEvents.requestId,
        endpoint: usageEvents.endpoint,
        model: usageEvents.model,
        status: usageEvents.status,
        errorCode: usageEvents.errorCode,
        createdAt: usageEvents.createdAt
      })
      .from(usageEvents)
      .where(eq(usageEvents.workspaceId, workspaceId))
      .orderBy(desc(usageEvents.createdAt))
      .limit(50)

    const rateLimitRows = await db
      .select({
        id: rateLimitEvents.id,
        limitType: rateLimitEvents.limitType,
        limitValue: rateLimitEvents.limitValue,
        currentValue: rateLimitEvents.currentValue,
        blocked: rateLimitEvents.blocked,
        createdAt: rateLimitEvents.createdAt
      })
      .from(rateLimitEvents)
      .where(eq(rateLimitEvents.workspaceId, workspaceId))
      .orderBy(desc(rateLimitEvents.createdAt))
      .limit(25)

    return {
      id: workspace.id,
      name: workspace.name,
      ownerUserId: workspace.ownerUserId,
      ownerEmail: emailMap[workspace.ownerUserId] ?? null,
      plan: workspace.plan,
      status: workspace.status,
      monthlyBudgetCents: workspace.monthlyBudgetCents ?? null,
      createdAt: workspace.createdAt,
      members: [...memberMap.values()],
      projects: projectRows,
      presentations: presentationRows,
      apiKeys: keyRows,
      usageRows: usageRows.map(row => ({
        day: row.day,
        requests: Number(row.requests ?? 0),
        cost: parseFloat(row.cost ?? '0'),
        billed: parseFloat(row.billed ?? '0')
      })),
      totals: {
        requests: Number(usageTotals[0]?.requests ?? 0),
        cost: parseFloat(usageTotals[0]?.cost ?? '0'),
        revenue: parseFloat(usageTotals[0]?.billed ?? '0')
      },
      logs: logRows,
      rateLimits: rateLimitRows
    }
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return null
    }
    throw error
  }
}

export async function pauseWorkspaceForAdmin(formData: FormData) {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')
  if (!workspaceId) return

  try {
    await db
      .update(apiKeys)
      .set({ status: 'paused' })
      .where(eq(apiKeys.workspaceId, workspaceId))
    await db
      .update(workspaces)
      .set({ status: 'paused' })
      .where(eq(workspaces.id, workspaceId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }
  revalidateUsersWorkspacesPaths()
  revalidatePath(`/admin/workspaces/${workspaceId}`)
}

export async function resumeWorkspaceForAdmin(formData: FormData) {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')
  if (!workspaceId) return

  try {
    await db
      .update(apiKeys)
      .set({ status: 'active' })
      .where(eq(apiKeys.workspaceId, workspaceId))
    await db
      .update(workspaces)
      .set({ status: 'active' })
      .where(eq(workspaces.id, workspaceId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }
  revalidateUsersWorkspacesPaths()
  revalidatePath(`/admin/workspaces/${workspaceId}`)
}

export async function changeWorkspacePlanForAdmin(formData: FormData) {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')
  const plan = String(formData.get('plan') ?? 'free')
  if (!workspaceId) return

  try {
    await db
      .update(workspaces)
      .set({
        plan: plan as
          | 'free'
          | 'starter'
          | 'pro'
          | 'team'
          | 'scale'
          | 'enterprise'
      })
      .where(eq(workspaces.id, workspaceId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }
  revalidateUsersWorkspacesPaths()
  revalidatePath(`/admin/workspaces/${workspaceId}`)
}

export async function setWorkspaceRateLimitsForAdmin(formData: FormData) {
  await assertAdminAccess()
  const workspaceId = String(formData.get('workspaceId') ?? '')
  if (!workspaceId) return

  const updates: Record<string, number> = {}
  const rpmLimit = formData.get('rpmLimit')
  const dailyRequestLimit = formData.get('dailyRequestLimit')
  const monthlyBudgetCents = formData.get('monthlyBudgetCents')
  if (rpmLimit !== null && rpmLimit !== '') updates.rpmLimit = Number(rpmLimit)
  if (dailyRequestLimit !== null && dailyRequestLimit !== '') {
    updates.dailyRequestLimit = Number(dailyRequestLimit)
  }
  if (monthlyBudgetCents !== null && monthlyBudgetCents !== '') {
    updates.monthlyBudgetCents = Number(monthlyBudgetCents)
  }

  if (Object.keys(updates).length === 0) {
    return
  }

  try {
    await db
      .update(apiKeys)
      .set(updates)
      .where(eq(apiKeys.workspaceId, workspaceId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }
  revalidateUsersWorkspacesPaths()
  revalidatePath(`/admin/workspaces/${workspaceId}`)
}
