import { createId } from '@paralleldrive/cuid2'
import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { usageEvents } from '@/lib/db/schema-brok'

export interface UsageRecord {
  requestId: string
  workspaceId: string
  userId: string
  apiKeyId: string
  endpoint: 'chat' | 'search' | 'code' | 'agents'
  model: string
  provider: string
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
      errorCode: record.errorCode
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (
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
