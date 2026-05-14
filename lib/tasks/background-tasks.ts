import { desc, eq } from 'drizzle-orm'

import { backgroundTasks, generateId } from '@/lib/db/schema'
import { withRLS } from '@/lib/db/with-rls'

export type BackgroundTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export async function createBackgroundTask({
  id = generateId(),
  userId,
  chatId,
  kind,
  title,
  metadata
}: {
  id?: string
  userId: string
  chatId?: string | null
  kind: string
  title: string
  metadata?: Record<string, any>
}) {
  return withRLS(userId, async tx => {
    const [task] = await tx
      .insert(backgroundTasks)
      .values({
        id,
        userId,
        chatId: chatId || null,
        kind,
        title,
        status: 'queued',
        metadata
      })
      .returning()

    return task
  })
}

export async function updateBackgroundTask({
  id,
  userId,
  status,
  metadata,
  result,
  error
}: {
  id: string
  userId: string
  status: BackgroundTaskStatus
  metadata?: Record<string, any>
  result?: Record<string, any>
  error?: string | null
}) {
  return withRLS(userId, async tx => {
    const now = new Date()
    const [task] = await tx
      .update(backgroundTasks)
      .set({
        status,
        ...(metadata ? { metadata } : {}),
        ...(result ? { result } : {}),
        ...(error !== undefined ? { error } : {}),
        ...(status === 'running' ? { startedAt: now } : {}),
        ...(status === 'succeeded' ||
        status === 'failed' ||
        status === 'cancelled'
          ? { completedAt: now }
          : {}),
        updatedAt: now
      })
      .where(eq(backgroundTasks.id, id))
      .returning()

    return task ?? null
  })
}

export async function listBackgroundTasks({
  userId,
  limit = 20
}: {
  userId: string
  limit?: number
}) {
  return withRLS(userId, async tx => {
    return tx
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.userId, userId))
      .orderBy(desc(backgroundTasks.createdAt))
      .limit(limit)
  })
}
