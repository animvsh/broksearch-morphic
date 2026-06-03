'use server'

import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import { canUseDevDbFallback } from '@/lib/db/dev-db-fallback'
import { apiKeys, usageEvents, workspaces } from '@/lib/db/schema-brok'

const FEATURE_SOURCE_BUCKETS = [
  { key: 'search', label: 'Search cost', surface: 'search' },
  { key: 'app_gen', label: 'App generation cost', source: 'app_build' },
  {
    key: 'presentation_gen',
    label: 'Presentation generation cost',
    source: 'presentation'
  },
  { key: 'image_gen', label: 'Image generation cost', source: 'image' },
  { key: 'web_search', label: 'Web search cost', surface: 'web_search' },
  { key: 'api_usage', label: 'API usage cost', surface: 'api' },
  { key: 'export', label: 'Export cost', source: 'export' },
  { key: 'storage', label: 'Storage cost', source: 'storage' }
] as const

type FeatureBucket = (typeof FEATURE_SOURCE_BUCKETS)[number]['key']

export type CostsFeatureSplitRow = {
  key: FeatureBucket
  label: string
  requests: number
  providerCost: number
  billedCost: number
  percentage: number
}

export type CostsBreakdownRow = {
  label: string
  requests: number
  tokens: number
  providerCost: number
  billedCost: number
  percentage: number
}

export type CostsMarginRow = {
  userId: string
  email: string
  workspace: string
  plan: string
  revenue: number
  providerCost: number
  grossMargin: number
  topFeature: string
  risk: 'low' | 'medium' | 'high'
}

export type CostAlert = {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  href: string | null
  value: number
  threshold: number
}

export type CostOverview = {
  generatedAt: string
  providerCostToday: number
  providerCostMonth: number
  revenueToday: number
  revenueMonth: number
  grossMargin: number
  mostExpensiveUser: { id: string; email: string; cost: number } | null
  mostExpensiveFeature: { key: string; label: string; cost: number } | null
  negativeMarginUserCount: number
}

export type CostsData = {
  overview: CostOverview
  breakdown: {
    byFeature: CostsBreakdownRow[]
    byModel: CostsBreakdownRow[]
    byProvider: CostsBreakdownRow[]
    byUser: CostsBreakdownRow[]
    byWorkspace: CostsBreakdownRow[]
    byProject: CostsBreakdownRow[]
    byPresentation: CostsBreakdownRow[]
    byApiKey: CostsBreakdownRow[]
  }
  featureSplit: CostsFeatureSplitRow[]
  marginTable: CostsMarginRow[]
  alerts: CostAlert[]
}

async function assertAdminAccess() {
  const access = await requireAdminAccess()

  if (!access.ok) {
    throw new Error(access.error)
  }
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function startOfUtcDay(): Date {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
}

function startOfUtcMonth(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function startOfDaysAgo(days: number): Date {
  const start = startOfUtcDay()
  start.setUTCDate(start.getUTCDate() - days)
  return start
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function isFallbackEligible(error: unknown): boolean {
  if (!canUseDevDbFallback(error)) return false
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('enotfound') ||
    message.includes('econn') ||
    message.includes('etimedout') ||
    message.includes('connect') ||
    message.includes('unable to connect')
  )
}

async function getUserEmailMap(
  userIds: string[]
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueIds.length === 0) return {}

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return Object.fromEntries(uniqueIds.map(id => [id, id]))
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey
      },
      cache: 'no-store'
    })

    if (!response.ok) return {}
    const data = (await response.json()) as {
      users?: Array<{ id: string; email?: string }>
    }
    return Object.fromEntries(
      (data.users ?? [])
        .filter(user => uniqueIds.includes(user.id))
        .map(user => [user.id, user.email ?? user.id])
    )
  } catch {
    return {}
  }
}

function emptyBreakdown(): CostsData['breakdown'] {
  return {
    byFeature: [],
    byModel: [],
    byProvider: [],
    byUser: [],
    byWorkspace: [],
    byProject: [],
    byPresentation: [],
    byApiKey: []
  }
}

function emptyCostsData(): CostsData {
  return {
    overview: {
      generatedAt: new Date().toISOString(),
      providerCostToday: 0,
      providerCostMonth: 0,
      revenueToday: 0,
      revenueMonth: 0,
      grossMargin: 0,
      mostExpensiveUser: null,
      mostExpensiveFeature: null,
      negativeMarginUserCount: 0
    },
    breakdown: emptyBreakdown(),
    featureSplit: [],
    marginTable: [],
    alerts: []
  }
}

function percentage(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0
}

function mapBreakdown(
  rows: Array<{
    label: string
    requests: number
    tokens: number
    providerCost: number
    billedCost: number
  }>,
  total: number
): CostsBreakdownRow[] {
  return rows.map(row => ({
    ...row,
    percentage: percentage(row.providerCost, total)
  }))
}

function buildFeatureSplit(
  featureBuckets: Array<{
    key: FeatureBucket
    label: string
    requests: number
    providerCost: number
    billedCost: number
  }>,
  totalProviderCost: number
): CostsFeatureSplitRow[] {
  return featureBuckets.map(row => ({
    ...row,
    percentage: percentage(row.providerCost, totalProviderCost)
  }))
}

function buildAlerts(input: {
  overview: CostOverview
  featureSplit: CostsFeatureSplitRow[]
  marginTable: CostsMarginRow[]
  monthlyProviderSpike: number
  weeklyProviderSpike: number
  failedBuildLoops: number
  presentationRetries: number
  apiKeyAbuse: Array<{ label: string; outputTokens: number; requests: number }>
}): CostAlert[] {
  const alerts: CostAlert[] = []

  // 1) User cost > revenue
  const userOverage = input.marginTable.find(row => row.grossMargin < 0)
  if (userOverage) {
    alerts.push({
      id: 'user-cost-exceeds-revenue',
      severity: 'critical',
      title: 'User cost exceeds revenue',
      detail: `${userOverage.email} cost $${userOverage.providerCost.toFixed(2)} vs $${userOverage.revenue.toFixed(2)} billed this month`,
      href: '/admin/costs#margin',
      value: userOverage.providerCost,
      threshold: userOverage.revenue
    })
  }

  // 2) Provider cost spike (>50% day over day)
  if (input.weeklyProviderSpike > 0.5) {
    alerts.push({
      id: 'provider-cost-spike',
      severity: 'warning',
      title: 'Provider cost spike',
      detail: `Provider cost up ${(input.weeklyProviderSpike * 100).toFixed(0)}% week over week`,
      href: '/admin/costs#trends',
      value: input.weeklyProviderSpike,
      threshold: 0.5
    })
  }

  // 3) Image generation spike (>3x baseline share)
  const imageBucket = input.featureSplit.find(row => row.key === 'image_gen')
  if (imageBucket && imageBucket.percentage > 25) {
    alerts.push({
      id: 'image-gen-spike',
      severity: 'warning',
      title: 'Image generation spike',
      detail: `Image gen now ${imageBucket.percentage.toFixed(1)}% of provider cost ($${imageBucket.providerCost.toFixed(2)})`,
      href: '/admin/costs#features',
      value: imageBucket.percentage,
      threshold: 25
    })
  }

  // 4) Failed build loops
  if (input.failedBuildLoops > 5) {
    alerts.push({
      id: 'failed-build-loops',
      severity: 'critical',
      title: 'Failed build loops causing excess cost',
      detail: `${input.failedBuildLoops} failed build runs this week`,
      href: '/admin/costs#features',
      value: input.failedBuildLoops,
      threshold: 5
    })
  }

  // 5) Presentation retries too high
  if (input.presentationRetries > 0) {
    alerts.push({
      id: 'presentation-retries-high',
      severity: 'warning',
      title: 'Presentation generation retries too high',
      detail: `${input.presentationRetries} retries logged this week`,
      href: '/admin/costs#features',
      value: input.presentationRetries,
      threshold: 0
    })
  }

  // 6) API key abusing token output
  const worstAbuser = input.apiKeyAbuse[0]
  if (worstAbuser && worstAbuser.outputTokens > 1_000_000) {
    alerts.push({
      id: 'api-key-abuse',
      severity: 'critical',
      title: 'API key abusing token output',
      detail: `${worstAbuser.label} produced ${worstAbuser.outputTokens.toLocaleString()} output tokens (${worstAbuser.requests} requests)`,
      href: '/admin/costs#api-keys',
      value: worstAbuser.outputTokens,
      threshold: 1_000_000
    })
  }

  return alerts
}

async function loadCostsData(): Promise<CostsData> {
  await assertAdminAccess()

  try {
    const today = startOfUtcDay()
    const monthStart = startOfUtcMonth()
    const weekStart = startOfDaysAgo(6)
    const lastWeekStart = startOfDaysAgo(13)

    // Top level overview aggregates
    const [todayRow] = await db
      .select({
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billedUsd: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, today))

    const [monthRow] = await db
      .select({
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billedUsd: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, monthStart))

    const [thisWeekRow] = await db
      .select({
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(
        and(
          gte(usageEvents.createdAt, weekStart),
          lte(usageEvents.createdAt, today)
        )
      )

    const [lastWeekRow] = await db
      .select({
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(
        and(
          gte(usageEvents.createdAt, lastWeekStart),
          lte(usageEvents.createdAt, weekStart)
        )
      )

    const providerCostToday = toNumber(todayRow?.providerCost)
    const providerCostMonth = toNumber(monthRow?.providerCost)
    const revenueToday = toNumber(todayRow?.billedUsd)
    const revenueMonth = toNumber(monthRow?.billedUsd)
    const grossMargin =
      revenueMonth > 0
        ? ((revenueMonth - providerCostMonth) / revenueMonth) * 100
        : 0

    // Most expensive user
    const topUserRows = await db
      .select({
        id: usageEvents.userId,
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billed: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`,
        requests: sql<number>`count(*)::int`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, monthStart))
      .groupBy(usageEvents.userId)
      .orderBy(desc(sql`coalesce(sum(${usageEvents.providerCostUsd}), 0)`))
      .limit(20)

    const topUserIds = topUserRows.map(row => row.id)
    const userEmails = await getUserEmailMap(topUserIds)
    const topUser = topUserRows[0]
    const mostExpensiveUser = topUser
      ? {
          id: topUser.id,
          email: userEmails[topUser.id] ?? topUser.id,
          cost: toNumber(topUser.providerCost)
        }
      : null

    // Most expensive feature (one of our source buckets)
    const featureRows = await Promise.all(
      FEATURE_SOURCE_BUCKETS.map(async bucket => {
        const conditions = []
        if ('surface' in bucket && bucket.surface) {
          conditions.push(eq(usageEvents.surface, bucket.surface))
        }
        if ('source' in bucket && bucket.source) {
          conditions.push(eq(usageEvents.source, bucket.source))
        }

        const filter =
          conditions.length === 0
            ? sql`false`
            : conditions.length === 1
              ? conditions[0]
              : and(...conditions)

        const [row] = await db
          .select({
            requests: sql<number>`count(*)::int`,
            providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
            billedCost: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
          })
          .from(usageEvents)
          .where(and(filter, gte(usageEvents.createdAt, monthStart)))

        return {
          key: bucket.key,
          label: bucket.label,
          requests: row?.requests ?? 0,
          providerCost: toNumber(row?.providerCost),
          billedCost: toNumber(row?.billedCost)
        }
      })
    )

    const totalFeatureProviderCost = featureRows.reduce(
      (sum, row) => sum + row.providerCost,
      0
    )
    const mostExpensiveFeature =
      [...featureRows].sort((a, b) => b.providerCost - a.providerCost)[0] ??
      null
    const featureSplit = buildFeatureSplit(
      featureRows,
      totalFeatureProviderCost
    )

    // Per-user cost / margin
    const marginUserRows = await db
      .select({
        userId: usageEvents.userId,
        workspaceId: usageEvents.workspaceId,
        plan: workspaces.plan,
        workspaceName: workspaces.name,
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billed: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`,
        requests: sql<number>`count(*)::int`
      })
      .from(usageEvents)
      .leftJoin(workspaces, eq(usageEvents.workspaceId, workspaces.id))
      .where(gte(usageEvents.createdAt, monthStart))
      .groupBy(
        usageEvents.userId,
        usageEvents.workspaceId,
        workspaces.plan,
        workspaces.name
      )
      .orderBy(desc(sql`coalesce(sum(${usageEvents.providerCostUsd}), 0)`))
      .limit(50)

    const marginUserEmails = await getUserEmailMap(
      marginUserRows.map(row => row.userId)
    )

    // Per user top feature (most expensive surface for the user this month)
    const userTopFeatureMap = new Map<string, string>()
    if (marginUserRows.length > 0) {
      const userIds = marginUserRows.map(row => row.userId)
      const topFeatureRows = await db
        .select({
          userId: usageEvents.userId,
          surface: usageEvents.surface,
          providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`
        })
        .from(usageEvents)
        .where(
          and(
            gte(usageEvents.createdAt, monthStart),
            sql`${usageEvents.userId} = any(${userIds})`
          )
        )
        .groupBy(usageEvents.userId, usageEvents.surface)
        .orderBy(desc(sql`coalesce(sum(${usageEvents.providerCostUsd}), 0)`))

      for (const row of topFeatureRows) {
        if (!userTopFeatureMap.has(row.userId)) {
          userTopFeatureMap.set(row.userId, row.surface ?? 'api')
        }
      }
    }

    const marginTable: CostsMarginRow[] = marginUserRows.map(row => {
      const providerCost = toNumber(row.providerCost)
      const revenue = toNumber(row.billed)
      const grossMargin = revenue > 0 ? revenue - providerCost : -providerCost
      let risk: CostsMarginRow['risk'] = 'low'
      if (providerCost > revenue * 1.2) risk = 'high'
      else if (providerCost > revenue * 0.8) risk = 'medium'

      return {
        userId: row.userId,
        email: marginUserEmails[row.userId] ?? row.userId,
        workspace: row.workspaceName ?? 'Unassigned',
        plan: row.plan ?? 'free',
        revenue,
        providerCost,
        grossMargin,
        topFeature: userTopFeatureMap.get(row.userId) ?? 'unknown',
        risk
      }
    })

    const negativeMarginUserCount = marginTable.filter(
      row => row.grossMargin < 0
    ).length

    // Cost by feature (using endpoint enum as feature group)
    const featureGroupRows = await db
      .select({
        label: usageEvents.endpoint,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billedCost: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, monthStart))
      .groupBy(usageEvents.endpoint)
      .orderBy(desc(sql`coalesce(sum(${usageEvents.providerCostUsd}), 0)`))

    const byFeature = mapBreakdown(
      featureGroupRows.map(row => ({
        label: String(row.label),
        requests: row.requests,
        tokens: row.tokens,
        providerCost: toNumber(row.providerCost),
        billedCost: toNumber(row.billedCost)
      })),
      providerCostMonth
    )

    const modelRows = await db
      .select({
        label: usageEvents.model,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billedCost: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, monthStart))
      .groupBy(usageEvents.model)
      .orderBy(desc(sql`coalesce(sum(${usageEvents.providerCostUsd}), 0)`))
      .limit(12)

    const byModel = mapBreakdown(
      modelRows.map(row => ({
        label: row.label,
        requests: row.requests,
        tokens: row.tokens,
        providerCost: toNumber(row.providerCost),
        billedCost: toNumber(row.billedCost)
      })),
      providerCostMonth
    )

    const providerRows = await db
      .select({
        label: usageEvents.provider,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billedCost: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, monthStart))
      .groupBy(usageEvents.provider)
      .orderBy(desc(sql`coalesce(sum(${usageEvents.providerCostUsd}), 0)`))

    const byProvider = mapBreakdown(
      providerRows.map(row => ({
        label: row.label,
        requests: row.requests,
        tokens: row.tokens,
        providerCost: toNumber(row.providerCost),
        billedCost: toNumber(row.billedCost)
      })),
      providerCostMonth
    )

    const byUser = mapBreakdown(
      marginTable.slice(0, 12).map(row => ({
        label: row.email,
        requests: 0,
        tokens: 0,
        providerCost: row.providerCost,
        billedCost: row.revenue
      })),
      providerCostMonth
    )

    const workspaceRows = await db
      .select({
        label: workspaces.name,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billedCost: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .leftJoin(workspaces, eq(usageEvents.workspaceId, workspaces.id))
      .where(gte(usageEvents.createdAt, monthStart))
      .groupBy(workspaces.name)
      .orderBy(desc(sql`coalesce(sum(${usageEvents.providerCostUsd}), 0)`))

    const byWorkspace = mapBreakdown(
      workspaceRows.map(row => ({
        label: row.label ?? 'Unassigned',
        requests: row.requests,
        tokens: row.tokens,
        providerCost: toNumber(row.providerCost),
        billedCost: toNumber(row.billedCost)
      })),
      providerCostMonth
    )

    // Cost by project: from usageEvents.metadata->>'projectId' or sessionId
    const byProjectRows = await db
      .select({
        label: sql<string>`coalesce(${usageEvents.sessionId}, ${usageEvents.source}, 'unknown')`,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billedCost: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(
        and(
          gte(usageEvents.createdAt, monthStart),
          or(
            eq(usageEvents.source, 'app_build'),
            eq(usageEvents.surface, 'app_build')
          )
        )
      )
      .groupBy(
        sql`coalesce(${usageEvents.sessionId}, ${usageEvents.source}, 'unknown')`
      )
      .orderBy(desc(sql`coalesce(sum(${usageEvents.providerCostUsd}), 0)`))
      .limit(12)

    const byProject = mapBreakdown(
      byProjectRows.map(row => ({
        label: row.label,
        requests: row.requests,
        tokens: row.tokens,
        providerCost: toNumber(row.providerCost),
        billedCost: toNumber(row.billedCost)
      })),
      providerCostMonth
    )

    const byPresentationRows = await db
      .select({
        label: sql<string>`coalesce(${usageEvents.sessionId}, 'presentation')`,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billedCost: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(
        and(
          gte(usageEvents.createdAt, monthStart),
          or(
            eq(usageEvents.source, 'presentation'),
            eq(usageEvents.surface, 'presentation')
          )
        )
      )
      .groupBy(sql`coalesce(${usageEvents.sessionId}, 'presentation')`)
      .orderBy(desc(sql`coalesce(sum(${usageEvents.providerCostUsd}), 0)`))
      .limit(12)

    const byPresentation = mapBreakdown(
      byPresentationRows.map(row => ({
        label: row.label,
        requests: row.requests,
        tokens: row.tokens,
        providerCost: toNumber(row.providerCost),
        billedCost: toNumber(row.billedCost)
      })),
      providerCostMonth
    )

    const apiKeyRows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.keyPrefix,
        requests: sql<number>`count(${usageEvents.id})::int`,
        tokens: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)::int`,
        providerCost: sql<string>`coalesce(sum(${usageEvents.providerCostUsd}), 0)::text`,
        billedCost: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .leftJoin(apiKeys, eq(usageEvents.apiKeyId, apiKeys.id))
      .where(
        and(
          gte(usageEvents.createdAt, monthStart),
          sql`${usageEvents.apiKeyId} is not null`
        )
      )
      .groupBy(apiKeys.id, apiKeys.name, apiKeys.keyPrefix)
      .orderBy(desc(sql`coalesce(sum(${usageEvents.providerCostUsd}), 0)`))
      .limit(12)

    const byApiKey = mapBreakdown(
      apiKeyRows.map(row => ({
        label: row.name
          ? `${row.name} (${row.prefix})`
          : (row.prefix ?? 'Unknown'),
        requests: row.requests,
        tokens: row.tokens,
        providerCost: toNumber(row.providerCost),
        billedCost: toNumber(row.billedCost)
      })),
      providerCostMonth
    )

    // Failed build loops + presentation retries
    const [failedBuildRow] = await db
      .select({
        count: sql<number>`count(*)::int`
      })
      .from(usageEvents)
      .where(
        and(
          gte(usageEvents.createdAt, weekStart),
          or(
            eq(usageEvents.source, 'app_build'),
            eq(usageEvents.surface, 'app_build')
          ),
          sql`${usageEvents.status} <> 'success'`
        )
      )

    const [presentationRetryRow] = await db
      .select({
        count: sql<number>`count(*)::int`
      })
      .from(usageEvents)
      .where(
        and(
          gte(usageEvents.createdAt, weekStart),
          or(
            eq(usageEvents.source, 'presentation'),
            eq(usageEvents.surface, 'presentation')
          ),
          sql`${usageEvents.status} <> 'success'`
        )
      )

    // API key token abuse (output tokens)
    const apiKeyAbuseRows = await db
      .select({
        label: sql<string>`coalesce(${apiKeys.name}, ${apiKeys.keyPrefix}, 'unknown')`,
        requests: sql<number>`count(*)::int`,
        outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::int`
      })
      .from(usageEvents)
      .leftJoin(apiKeys, eq(usageEvents.apiKeyId, apiKeys.id))
      .where(gte(usageEvents.createdAt, monthStart))
      .groupBy(sql`coalesce(${apiKeys.name}, ${apiKeys.keyPrefix}, 'unknown')`)
      .orderBy(desc(sql`coalesce(sum(${usageEvents.outputTokens}), 0)`))
      .limit(5)

    const apiKeyAbuse = apiKeyAbuseRows
      .filter(row => row.outputTokens > 100_000)
      .map(row => ({
        label: row.label,
        requests: row.requests,
        outputTokens: row.outputTokens
      }))

    const thisWeekCost = toNumber(thisWeekRow?.providerCost)
    const lastWeekCost = toNumber(lastWeekRow?.providerCost)
    const weeklyProviderSpike =
      lastWeekCost > 0
        ? (thisWeekCost - lastWeekCost) / lastWeekCost
        : thisWeekCost > 0
          ? 1
          : 0

    const overview: CostOverview = {
      generatedAt: new Date().toISOString(),
      providerCostToday,
      providerCostMonth,
      revenueToday,
      revenueMonth,
      grossMargin,
      mostExpensiveUser,
      mostExpensiveFeature: mostExpensiveFeature
        ? {
            key: mostExpensiveFeature.key,
            label: mostExpensiveFeature.label,
            cost: mostExpensiveFeature.providerCost
          }
        : null,
      negativeMarginUserCount
    }

    const alerts = buildAlerts({
      overview,
      featureSplit,
      marginTable,
      monthlyProviderSpike: providerCostMonth,
      weeklyProviderSpike,
      failedBuildLoops: failedBuildRow?.count ?? 0,
      presentationRetries: presentationRetryRow?.count ?? 0,
      apiKeyAbuse
    })

    return {
      overview,
      breakdown: {
        byFeature,
        byModel,
        byProvider,
        byUser,
        byWorkspace,
        byProject,
        byPresentation,
        byApiKey
      },
      featureSplit,
      marginTable,
      alerts
    }
  } catch (error) {
    if (isFallbackEligible(error)) {
      return emptyCostsData()
    }
    throw error
  }
}

export async function getCostsData(): Promise<CostsData> {
  return loadCostsData()
}
