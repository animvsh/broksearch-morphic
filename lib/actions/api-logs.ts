'use server'

import { desc, eq, inArray } from 'drizzle-orm'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { canUseDevDbFallback, getErrorMessage } from '@/lib/db/dev-db-fallback'
import { usageEvents, workspaces } from '@/lib/db/schema-brok'

export interface UserLogEntry {
  id: string
  createdAt: Date | null
  endpoint: string
  model: string
  provider: string
  surface: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number | null
  billedUsd: string
  status: string
}

async function resolveUserWorkspaceIds(userId: string): Promise<string[]> {
  const owned = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, userId))
  return owned.map(w => w.id)
}

export async function getLogsForUser(limit = 50): Promise<UserLogEntry[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []

  try {
    const workspaceIds = await resolveUserWorkspaceIds(userId)
    if (workspaceIds.length === 0) return []

    const rows = await db
      .select({
        id: usageEvents.id,
        createdAt: usageEvents.createdAt,
        endpoint: usageEvents.endpoint,
        model: usageEvents.model,
        provider: usageEvents.provider,
        surface: usageEvents.surface,
        inputTokens: usageEvents.inputTokens,
        outputTokens: usageEvents.outputTokens,
        latencyMs: usageEvents.latencyMs,
        billedUsd: usageEvents.billedUsd,
        status: usageEvents.status
      })
      .from(usageEvents)
      .where(inArray(usageEvents.workspaceId, workspaceIds))
      .orderBy(desc(usageEvents.createdAt))
      .limit(Math.max(1, Math.min(limit, 500)))

    return rows.map(row => ({
      id: row.id,
      createdAt: row.createdAt ?? null,
      endpoint: row.endpoint,
      model: row.model,
      provider: row.provider,
      surface: row.surface,
      inputTokens: row.inputTokens ?? null,
      outputTokens: row.outputTokens ?? null,
      latencyMs: row.latencyMs ?? null,
      billedUsd: row.billedUsd ?? '0',
      status: row.status
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      console.warn(
        '[api-logs] Dev DB fallback: returning empty log list. ' +
          getErrorMessage(error)
      )
      return []
    }
    throw error
  }
}
