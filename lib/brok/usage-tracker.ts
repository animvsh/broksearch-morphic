import { NextResponse } from 'next/server'

import { createId } from '@paralleldrive/cuid2'
import { and, eq, gte, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { apiKeys, usageEvents, workspaces } from '@/lib/db/schema-brok'

export interface UsageRecord {
  requestId: string
  workspaceId: string
  userId: string
  apiKeyId: string
  endpoint: 'chat' | 'search' | 'code' | 'agents'
  model: string
  provider: string
  surface?: string
  runtime?: string
  source?: string
  sessionId?: string
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  searchQueries?: number
  pagesFetched?: number
  toolCalls?: number
  providerCostUsd: number
  billedUsd: number
  latencyMs: number
  status: 'success' | 'error'
  errorCode?: string
  metadata?: Record<string, unknown>
}

export type UsageLimitResult =
  | { allowed: true }
  | {
      allowed: false
      code:
        | 'daily_request_limit_exceeded'
        | 'api_key_monthly_budget_exceeded'
        | 'workspace_monthly_budget_exceeded'
        | 'usage_storage_unavailable'
      message: string
      status: number
    }

export function usageLimitResponse(
  result: Extract<UsageLimitResult, { allowed: false }>
) {
  return NextResponse.json(
    {
      error: {
        type:
          result.status === 429
            ? 'rate_limit_error'
            : result.status === 402
              ? 'billing_error'
              : 'server_error',
        code: result.code,
        message: result.message
      }
    },
    { status: result.status }
  )
}

/**
 * Generate a unique request ID for tracking.
 */
export function generateRequestId(): string {
  return `req_${createId()}`
}

/**
 * Record usage for an API request.
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    await db.insert(usageEvents).values({
      requestId: record.requestId,
      workspaceId: record.workspaceId,
      userId: record.userId,
      apiKeyId: record.apiKeyId,
      endpoint: record.endpoint,
      model: record.model,
      provider: record.provider,
      surface: record.surface ?? 'api',
      runtime: record.runtime,
      source: record.source,
      sessionId: record.sessionId,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      cachedTokens: record.cachedTokens ?? 0,
      searchQueries: record.searchQueries ?? 0,
      pagesFetched: record.pagesFetched ?? 0,
      toolCalls: record.toolCalls ?? 0,
      providerCostUsd: record.providerCostUsd.toString(),
      billedUsd: record.billedUsd.toString(),
      latencyMs: record.latencyMs,
      status: record.status,
      errorCode: record.errorCode,
      metadata: record.metadata
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (
      message.includes('column "surface"') ||
      message.includes('column "runtime"') ||
      message.includes('column "source"') ||
      message.includes('column "session_id"') ||
      message.includes('column "metadata"') ||
      message.includes('column "feature"') ||
      message.includes('relation "usage_events" violates not-null constraint')
    ) {
      try {
        await db.execute(sql`
          insert into usage_events (
            request_id,
            workspace_id,
            user_id,
            api_key_id,
            endpoint,
            feature,
            model,
            provider,
            input_tokens,
            output_tokens,
            cached_tokens,
            search_queries,
            pages_fetched,
            tool_calls,
            provider_cost_usd,
            billed_usd,
            latency_ms,
            status,
            error_code
          ) values (
            ${record.requestId},
            ${record.workspaceId},
            ${record.userId},
            ${record.apiKeyId},
            ${record.endpoint},
            ${record.endpoint},
            ${record.model},
            ${record.provider},
            ${record.inputTokens},
            ${record.outputTokens},
            ${record.cachedTokens ?? 0},
            ${record.searchQueries ?? 0},
            ${record.pagesFetched ?? 0},
            ${record.toolCalls ?? 0},
            ${record.providerCostUsd.toString()},
            ${record.billedUsd.toString()},
            ${record.latencyMs},
            ${record.status},
            ${record.errorCode ?? null}
          )
        `)
        return
      } catch (legacyError) {
        console.error(
          'Failed to record usage with legacy usage_events schema:',
          legacyError
        )
      }
    }

    console.error('Failed to record usage:', error)
    // Don't throw - usage tracking should not break the request
  }
}

function startOfUtcDay() {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
}

function startOfUtcMonth() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function dollarsToCents(value: unknown) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : 0

  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0
}

/**
 * Enforce the API key/workspace limits shown in the product UI.
 * A value of 0 means unlimited for budgets.
 */
export async function checkUsageLimits({
  apiKey,
  workspace
}: {
  apiKey: typeof apiKeys.$inferSelect
  workspace: typeof workspaces.$inferSelect
}): Promise<UsageLimitResult> {
  try {
    const dailyLimit = apiKey.dailyRequestLimit ?? 0
    if (dailyLimit > 0) {
      const [daily] = await db
        .select({
          requests: sql<number>`count(*)::int`
        })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.apiKeyId, apiKey.id),
            gte(usageEvents.createdAt, startOfUtcDay())
          )
        )

      if ((daily?.requests ?? 0) >= dailyLimit) {
        return {
          allowed: false,
          code: 'daily_request_limit_exceeded',
          message: `Daily request limit exceeded for this API key (${dailyLimit} requests/day).`,
          status: 429
        }
      }
    }

    const monthlyStart = startOfUtcMonth()
    const [monthlyForKey] = await db
      .select({
        billedUsd: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.apiKeyId, apiKey.id),
          gte(usageEvents.createdAt, monthlyStart)
        )
      )

    const apiKeyBudgetCents = apiKey.monthlyBudgetCents ?? 0
    const apiKeySpentCents = dollarsToCents(monthlyForKey?.billedUsd)

    if (apiKeyBudgetCents > 0 && apiKeySpentCents >= apiKeyBudgetCents) {
      return {
        allowed: false,
        code: 'api_key_monthly_budget_exceeded',
        message: 'Monthly budget exceeded for this API key.',
        status: 402
      }
    }

    const workspaceBudgetCents = workspace.monthlyBudgetCents ?? 0
    if (workspaceBudgetCents > 0) {
      const [monthlyForWorkspace] = await db
        .select({
          billedUsd: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
        })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.workspaceId, workspace.id),
            gte(usageEvents.createdAt, monthlyStart)
          )
        )

      const workspaceSpentCents = dollarsToCents(monthlyForWorkspace?.billedUsd)
      if (workspaceSpentCents >= workspaceBudgetCents) {
        return {
          allowed: false,
          code: 'workspace_monthly_budget_exceeded',
          message: 'Monthly budget exceeded for this workspace.',
          status: 402
        }
      }
    }

    return { allowed: true }
  } catch (error) {
    console.error('Usage limit check failed:', error)
    return {
      allowed: false,
      code: 'usage_storage_unavailable',
      message:
        'Usage limit storage is unavailable. Check the database connection and try again.',
      status: 503
    }
  }
}
