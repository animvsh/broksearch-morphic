import { and, desc, eq } from 'drizzle-orm'

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
    const [existing] = metadata
      ? await tx
          .select({ metadata: backgroundTasks.metadata })
          .from(backgroundTasks)
          .where(eq(backgroundTasks.id, id))
          .limit(1)
      : []
    const nextMetadata = metadata
      ? {
          ...(existing?.metadata ?? {}),
          ...metadata
        }
      : undefined
    const [task] = await tx
      .update(backgroundTasks)
      .set({
        status,
        ...(nextMetadata ? { metadata: nextMetadata } : {}),
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

export async function appendBackgroundTaskEvent({
  id,
  userId,
  message,
  progress,
  metadata
}: {
  id: string
  userId: string
  message: string
  progress?: number
  metadata?: Record<string, any>
}) {
  return withRLS(userId, async tx => {
    const [existing] = await tx
      .select({ metadata: backgroundTasks.metadata })
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, id))
      .limit(1)

    const currentMetadata = existing?.metadata ?? {}
    const currentEvents = Array.isArray(currentMetadata.events)
      ? currentMetadata.events
      : []
    const nextMetadata = {
      ...currentMetadata,
      ...metadata,
      ...(typeof progress === 'number' ? { progress } : {}),
      events: [
        ...currentEvents.slice(-49),
        {
          at: new Date().toISOString(),
          message,
          ...(typeof progress === 'number' ? { progress } : {})
        }
      ]
    }

    const [task] = await tx
      .update(backgroundTasks)
      .set({
        metadata: nextMetadata,
        updatedAt: new Date()
      })
      .where(eq(backgroundTasks.id, id))
      .returning()

    return task ?? null
  })
}

export async function getBackgroundTask({
  userId,
  id
}: {
  userId: string
  id: string
}) {
  return withRLS(userId, async tx => {
    const [task] = await tx
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, id))
      .limit(1)

    return task ?? null
  })
}

export async function listBackgroundTasks({
  userId,
  limit = 20,
  chatId
}: {
  userId: string
  limit?: number
  chatId?: string | null
}) {
  return withRLS(userId, async tx => {
    const whereClause = chatId
      ? and(
          eq(backgroundTasks.userId, userId),
          eq(backgroundTasks.chatId, chatId)
        )
      : eq(backgroundTasks.userId, userId)

    return tx
      .select()
      .from(backgroundTasks)
      .where(whereClause)
      .orderBy(desc(backgroundTasks.createdAt))
      .limit(limit)
  })
}
