'use server'

import { revalidatePath } from 'next/cache'

import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { BROK_MODELS } from '@/lib/brok/models'
import { db } from '@/lib/db'
import { providerRoutes, usageEvents } from '@/lib/db/schema'

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

function describeBrokModelUsage(modelId: string): string {
  switch (modelId) {
    case 'brok-fast':
      return 'Default fast chat, search, and tool use'
    case 'brok-lite':
      return 'Cheap chat for low-tier plans'
    case 'brok-search':
      return 'Search-powered answers with citations'
    case 'brok-search-pro':
      return 'Deep search with 10-20 sources'
    case 'brok-code':
      return 'Coding edits for BrokCode and OpenCode routes'
    case 'brok-agent':
      return 'Tool-using agent with browser and search'
    case 'brok-reasoning':
      return 'Advanced reasoning for complex problems'
    case 'brok-app-builder':
      return 'App generation pipeline via MiniMax + OpenCode'
    case 'brok-present':
      return 'Slide generation via MiniMax + slide generator'
    default:
      return BROK_MODELS[modelId]?.description ?? 'Brok-managed model'
  }
}

function defaultAllowedPlans(modelId: string): string[] {
  // Plans follow the existing workspace plan enum.
  // Most models are available to all paid plans; brok-reasoning is
  // Pro+; brok-search-pro is Pro+; brok-fast is universal.
  if (
    modelId === 'brok-fast' ||
    modelId === 'brok-lite' ||
    modelId === 'brok-search'
  ) {
    return ['free', 'starter', 'pro', 'team', 'scale', 'enterprise']
  }
  if (modelId === 'brok-code' || modelId === 'brok-agent') {
    return ['starter', 'pro', 'team', 'scale', 'enterprise']
  }
  return ['pro', 'team', 'scale', 'enterprise']
}

function fallbackModelsForAdmin() {
  return Object.entries(BROK_MODELS).map(([modelId, config]) => ({
    id: modelId,
    brokModel: modelId,
    displayName: config.name,
    usedFor: describeBrokModelUsage(modelId),
    provider: config.provider,
    providerModel: config.providerModel,
    enabled: true,
    isFallback: true,
    inputCostPerMillion: config.inputCostPerMillion,
    outputCostPerMillion: config.outputCostPerMillion,
    maxTokens: config.maxTokens,
    pricingMultiplier: 1,
    requestsToday: 0,
    avgLatencyMs: 0,
    errorRate: 0,
    allowedPlans: defaultAllowedPlans(modelId)
  }))
}

export interface AdminModelRow {
  id: string
  brokModel: string
  displayName: string
  usedFor: string
  provider: string
  providerModel: string
  enabled: boolean
  isFallback: boolean
  inputCostPerMillion: number
  outputCostPerMillion: number
  maxTokens: number
  pricingMultiplier: number
  requestsToday: number
  avgLatencyMs: number
  errorRate: number
  allowedPlans: string[]
}

export async function getModelsForAdmin(): Promise<AdminModelRow[]> {
  await assertAdminAccess()

  try {
    const today = startOfDay()

    // Aggregate per-model metrics from usage_events.
    const usageRows = await db
      .select({
        model: usageEvents.model,
        requests: sql<number>`count(*)::int`,
        avgLatency: sql<number>`coalesce(round(avg(${usageEvents.latencyMs})), 0)::int`,
        failedRequests: sql<number>`coalesce(sum(case when ${usageEvents.status} <> 'success' then 1 else 0 end), 0)::int`
      })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, today))
      .groupBy(usageEvents.model)

    const usageByModel = new Map(usageRows.map(row => [row.model, row]))

    const routes = await db
      .select({
        id: providerRoutes.id,
        brokModel: providerRoutes.brokModel,
        providerName: providerRoutes.providerName,
        providerModel: providerRoutes.providerModel,
        isActive: providerRoutes.isActive,
        inputCostPerMillion: providerRoutes.inputCostPerMillion,
        outputCostPerMillion: providerRoutes.outputCostPerMillion,
        priority: providerRoutes.priority
      })
      .from(providerRoutes)
      .orderBy(desc(providerRoutes.priority), desc(providerRoutes.id))

    // Pick the highest-priority active route per brok model; fall back to
    // the highest-priority route if none are active.
    const routeByModel = new Map<
      string,
      {
        id: string
        providerName: string
        providerModel: string
        isActive: boolean
        inputCostPerMillion: string
        outputCostPerMillion: string
        priority: number
      }
    >()

    for (const route of routes) {
      const existing = routeByModel.get(route.brokModel)
      const candidate = {
        id: route.id,
        providerName: route.providerName,
        providerModel: route.providerModel,
        isActive: route.isActive ?? true,
        inputCostPerMillion: route.inputCostPerMillion ?? '0',
        outputCostPerMillion: route.outputCostPerMillion ?? '0',
        priority: route.priority ?? 1
      }
      if (!existing) {
        routeByModel.set(route.brokModel, candidate)
        continue
      }
      // Prefer active routes over inactive ones, then higher priority.
      if (existing.isActive && !candidate.isActive) continue
      if (!existing.isActive && candidate.isActive) {
        routeByModel.set(route.brokModel, candidate)
        continue
      }
      if (candidate.priority > existing.priority) {
        routeByModel.set(route.brokModel, candidate)
      }
    }

    // Build a list of model IDs that exist in either routes or BROK_MODELS.
    const seen = new Set<string>()
    const rows: AdminModelRow[] = []

    for (const [brokModel, route] of routeByModel) {
      if (seen.has(brokModel)) continue
      seen.add(brokModel)

      const config = BROK_MODELS[brokModel as keyof typeof BROK_MODELS]
      const usage =
        usageByModel.get(brokModel) ?? usageByModel.get(route.providerModel)
      const requests = usage?.requests ?? 0
      const failed = usage?.failedRequests ?? 0
      const errorRate = requests > 0 ? (failed / requests) * 100 : 0

      rows.push({
        id: route.id,
        brokModel,
        displayName: config?.name ?? brokModel,
        usedFor: describeBrokModelUsage(brokModel),
        provider: route.providerName,
        providerModel: route.providerModel,
        enabled: route.isActive,
        isFallback: false,
        inputCostPerMillion: Number(route.inputCostPerMillion) || 0,
        outputCostPerMillion: Number(route.outputCostPerMillion) || 0,
        maxTokens: config?.maxTokens ?? 0,
        pricingMultiplier: 1,
        requestsToday: requests,
        avgLatencyMs: usage?.avgLatency ?? 0,
        errorRate,
        allowedPlans: defaultAllowedPlans(brokModel)
      })
    }

    for (const [brokModel, config] of Object.entries(BROK_MODELS)) {
      if (seen.has(brokModel)) continue
      seen.add(brokModel)
      const usage =
        usageByModel.get(brokModel) ?? usageByModel.get(config.providerModel)
      const requests = usage?.requests ?? 0
      const failed = usage?.failedRequests ?? 0
      const errorRate = requests > 0 ? (failed / requests) * 100 : 0

      rows.push({
        id: `fallback-${brokModel}`,
        brokModel,
        displayName: config.name,
        usedFor: describeBrokModelUsage(brokModel),
        provider: config.provider,
        providerModel: config.providerModel,
        enabled: true,
        isFallback: true,
        inputCostPerMillion: config.inputCostPerMillion,
        outputCostPerMillion: config.outputCostPerMillion,
        maxTokens: config.maxTokens,
        pricingMultiplier: 1,
        requestsToday: requests,
        avgLatencyMs: usage?.avgLatency ?? 0,
        errorRate,
        allowedPlans: defaultAllowedPlans(brokModel)
      })
    }

    return rows.sort((a, b) => a.brokModel.localeCompare(b.brokModel))
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return fallbackModelsForAdmin()
    }
    throw error
  }
}

export async function toggleModelEnabled(formData: FormData) {
  await assertAdminAccess()

  const id = String(formData.get('id') ?? '')
  const enabled = formData.get('enabled') === 'true'

  if (!id) {
    throw new Error('Model id is required')
  }

  try {
    await db
      .update(providerRoutes)
      .set({ isActive: enabled })
      .where(eq(providerRoutes.id, id))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  revalidatePath('/admin/models')
  revalidatePath('/admin/brok/providers')
}

export async function updateModelPricing(formData: FormData) {
  await assertAdminAccess()

  const id = String(formData.get('id') ?? '')
  const inputCostPerMillion = String(formData.get('inputCostPerMillion') ?? '0')
  const outputCostPerMillion = String(
    formData.get('outputCostPerMillion') ?? '0'
  )

  if (!id) {
    throw new Error('Model id is required')
  }

  try {
    await db
      .update(providerRoutes)
      .set({
        inputCostPerMillion,
        outputCostPerMillion
      })
      .where(eq(providerRoutes.id, id))
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  revalidatePath('/admin/models')
  revalidatePath('/admin/brok/providers')
}

export async function setModelFallback(formData: FormData) {
  await assertAdminAccess()

  const id = String(formData.get('id') ?? '')
  const priorityRaw = Number(formData.get('priority') ?? 1)
  const priority = Number.isFinite(priorityRaw) ? Math.max(1, priorityRaw) : 1

  if (!id) {
    throw new Error('Model id is required')
  }

  try {
    // Boost priority so this route wins selection while keeping other
    // route rows in place (admin can revert later).
    await db
      .update(providerRoutes)
      .set({ priority })
      .where(eq(providerRoutes.id, id))

    // De-duplicate: drop other active rows for the same brok model so
    // there is one clear fallback per model.
    const target = await db
      .select({ brokModel: providerRoutes.brokModel })
      .from(providerRoutes)
      .where(eq(providerRoutes.id, id))
      .limit(1)

    if (target[0]?.brokModel) {
      const brokModel = target[0].brokModel
      await db
        .update(providerRoutes)
        .set({ isActive: false })
        .where(
          and(
            eq(providerRoutes.brokModel, brokModel),
            // sql ne: keep the target row untouched
            sql`${providerRoutes.id} <> ${id}`
          )
        )
      await db
        .update(providerRoutes)
        .set({ isActive: true, priority })
        .where(eq(providerRoutes.id, id))
    }
  } catch (error) {
    if (!canUseDevDbFallback(error)) {
      throw error
    }
  }

  revalidatePath('/admin/models')
  revalidatePath('/admin/brok/providers')
}
