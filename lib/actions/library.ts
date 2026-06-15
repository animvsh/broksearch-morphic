'use server'

import { and, eq } from 'drizzle-orm'

import { type Chat, chats } from '@/lib/db/schema'
import { libraryItems } from '@/lib/db/schema-brok'
import { withRLS } from '@/lib/db/with-rls'

type SaveThreadToLibraryInput = {
  threadId: string
  userId: string
  visibility: 'public' | 'private'
}

type SaveThreadToLibraryResult = {
  thread: Chat
  libraryItemId: string
}

export async function saveThreadToLibrary({
  threadId,
  userId,
  visibility
}: SaveThreadToLibraryInput): Promise<SaveThreadToLibraryResult | null> {
  return withRLS(userId, async tx => {
    const [chat] = await tx
      .select()
      .from(chats)
      .where(eq(chats.id, threadId))
      .limit(1)

    if (!chat || chat.userId !== userId) {
      return null
    }

    const now = new Date()
    const [updatedThread] = await tx
      .update(chats)
      .set({ visibility })
      .where(eq(chats.id, threadId))
      .returning()

    const title = updatedThread.title?.trim() || 'Saved research thread'
    const href = `/search/${updatedThread.id}`
    const metadata = {
      threadId: updatedThread.id,
      visibility: updatedThread.visibility,
      savedFrom: 'thread_save'
    }

    const [existing] = await tx
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.userId, userId),
          eq(libraryItems.kind, 'search'),
          eq(libraryItems.sourceRefId, updatedThread.id)
        )
      )
      .limit(1)

    if (existing) {
      const [item] = await tx
        .update(libraryItems)
        .set({
          title,
          href,
          status: 'active',
          isPublic: visibility === 'public',
          metadata,
          lastUsedAt: now,
          updatedAt: now
        })
        .where(eq(libraryItems.id, existing.id))
        .returning({ id: libraryItems.id })

      return { thread: updatedThread, libraryItemId: item.id }
    }

    const [item] = await tx
      .insert(libraryItems)
      .values({
        userId,
        kind: 'search',
        title,
        href,
        status: 'active',
        isPublic: visibility === 'public',
        sourceRefId: updatedThread.id,
        metadata,
        lastUsedAt: now,
        updatedAt: now
      })
      .returning({ id: libraryItems.id })

    return { thread: updatedThread, libraryItemId: item.id }
  })
}
