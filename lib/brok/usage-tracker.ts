import { createId } from '@paralleldrive/cuid2';

import { db } from '@/lib/db';
import { usageEvents } from '@/lib/db/schema-brok';

export interface UsageRecord {
  requestId: string;
  workspaceId: string;
  userId: string;
  apiKeyId: string;
  endpoint: 'chat' | 'search' | 'code' | 'agents';
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  searchQueries?: number;
  pagesFetched?: number;
  toolCalls?: number;
  providerCostUsd: number;
  billedUsd: number;
  latencyMs: number;
  status: 'success' | 'error';
  errorCode?: string;
}

/**
 * Generate a unique request ID for tracking.
 */
export function generateRequestId(): string {
  return `req_${createId()}`;
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
      errorCode: record.errorCode,
    });
  } catch (error) {
    console.error('Failed to record usage:', error);
    // Don't throw - usage tracking should not break the request
  }
}
