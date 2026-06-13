import { NextResponse } from 'next/server'

import { createId } from '@paralleldrive/cuid2'
import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { apiKeys, usageEvents, workspaces } from '@/lib/db/schema-brok'

export interface UsageRecord {
  requestId: string
  workspaceId: string
  userId: string
  apiKeyId: string | null
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
  status: 'success' | 'error' | 'aborted'
  errorCode?: string
  metadata?: Record<string, unknown>
}

const LOCAL_FALLBACK_API_KEY_ID = '00000000-0000-0000-0000-000000000001'
const LOCAL_FALLBACK_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000'

function isLocalFallbackIdentity(apiKeyId: string | null, workspaceId: string) {
  return (
    process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK === 'true' &&
    process.env.BROK_CLOUD_DEPLOYMENT !== 'true' &&
    apiKeyId === LOCAL_FALLBACK_API_KEY_ID &&
    workspaceId === LOCAL_FALLBACK_WORKSPACE_ID
  )
}

export type UsageLimitResult =
  | { allowed: true }
  | {
      allowed: false
      code:
        | 'daily_request_limit_exceeded'
        | 'api_key_monthly_budget_exceeded'
        | 'api_key_monthly_budget_required'
        | 'workspace_monthly_budget_exceeded'
        | 'workspace_monthly_budget_required'
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
 *
 * Schema drift is no longer silently absorbed: if a column is missing the
 * insert fails loudly so operators can run the missing migration. The
 * historical "fall back to legacy insert" path was removed because it
 * silently dropped surface/runtime/source/sessionId/metadata in
 * production whenever the new columns weren't present.
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  if (isLocalFallbackIdentity(record.apiKeyId, record.workspaceId)) {
    return
  }

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
    const looksLikeMissingColumn =
      message.includes('column') &&
      (message.includes('does not exist') ||
        message.includes('not-null constraint') ||
        message.includes('not_null'))
    if (looksLikeMissingColumn) {
      console.error(
        '[usage-tracker] usage_events schema drift detected. Run pending migrations. Original error:',
        error
      )
    } else {
      console.error('[usage-tracker] Failed to record usage:', error)
    }
    // Do not throw — usage tracking must not break the user request, but
    // we surface the failure in the logs for operator action.
  }
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
  if (
    process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK === 'true' &&
    process.env.BROK_CLOUD_DEPLOYMENT !== 'true' &&
    apiKey.id === '00000000-0000-0000-0000-000000000001' &&
    workspace.id === '00000000-0000-0000-0000-000000000000'
  ) {
    return { allowed: true }
  }

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
            sql`${usageEvents.createdAt} >= date_trunc('day', now())::timestamp`
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

    const [monthlyForKey] = await db
      .select({
        billedUsd: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.apiKeyId, apiKey.id),
          sql`${usageEvents.createdAt} >= date_trunc('month', now())::timestamp`
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

    if (
      process.env.BROK_CLOUD_DEPLOYMENT === 'true' &&
      apiKeyBudgetCents === 0
    ) {
      return {
        allowed: false,
        code: 'api_key_monthly_budget_required',
        message:
          'A positive monthly budget is required for API keys in cloud deployments.',
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
            sql`${usageEvents.createdAt} >= date_trunc('month', now())::timestamp`
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

    if (
      process.env.BROK_CLOUD_DEPLOYMENT === 'true' &&
      workspaceBudgetCents === 0
    ) {
      return {
        allowed: false,
        code: 'workspace_monthly_budget_required',
        message:
          'A positive monthly budget is required for workspaces in cloud deployments.',
        status: 402
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
