'use server'

import { and, eq, sql } from 'drizzle-orm'

import { type Chat, chats, messages, parts } from '@/lib/db/schema'
import { libraryItems } from '@/lib/db/schema-brok'
import { withRLS } from '@/lib/db/with-rls'
import { countAnswerMetadataSources } from '@/lib/library/answer-metadata-sources'

type SaveThreadToLibraryInput = {
  threadId: string
  userId: string
  visibility: 'public' | 'private'
}

type SaveThreadToLibraryResult = {
  thread: Chat
  libraryItemId: string
}

function summarizeAnswer(text: string | null | undefined) {
  if (!text) return null

  const normalized = text
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return null
  return normalized.length > 220
    ? `${normalized.slice(0, 217).trimEnd()}...`
    : normalized
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
    const [threadSummary] = (await tx
      .select({ text: parts.text_text, metadata: messages.metadata })
      .from(parts)
      .innerJoin(messages, eq(parts.messageId, messages.id))
      .where(
        and(
          eq(messages.chatId, updatedThread.id),
          eq(messages.role, 'assistant'),
          eq(parts.type, 'text')
        )
      )
      .orderBy(sql`${messages.createdAt} desc`, sql`${parts.order} asc`)
      .limit(1)) as Array<{
      text: string | null
      metadata: Record<string, any> | null
    }>

    const [threadSources] = (await tx.execute(sql`
      select
        count(distinct coalesce(
          ${parts.source_url_url},
          ${parts.source_document_url},
          ${parts.source_document_title},
          ${parts.source_document_filename}
        ))::int as "citeCount"
      from ${parts}
      inner join ${messages} on ${messages.id} = ${parts.messageId}
      where ${messages.chatId} = ${updatedThread.id}
        and (
          ${parts.source_url_url} is not null
          or ${parts.source_document_url} is not null
          or ${parts.source_document_title} is not null
          or ${parts.source_document_filename} is not null
        )
    `)) as unknown as Array<{ citeCount: number | null }>

    const summary = summarizeAnswer(threadSummary?.text)
    const metadataCiteCount = countAnswerMetadataSources(
      threadSummary?.metadata ?? null
    )
    const citeCount = metadataCiteCount || Number(threadSources?.citeCount) || 0
    const metadata = {
      threadId: updatedThread.id,
      visibility: updatedThread.visibility,
      savedFrom: 'thread_save',
      sourceSignal: citeCount > 0 ? 'source_grounded' : 'thread',
      sourceCountSource:
        metadataCiteCount > 0 ? 'answer_metadata' : 'message_parts'
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
          summary,
          href,
          status: 'active',
          isPublic: visibility === 'public',
          citeCount,
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
        summary,
        href,
        status: 'active',
        isPublic: visibility === 'public',
        citeCount,
        sourceRefId: updatedThread.id,
        metadata,
        lastUsedAt: now,
        updatedAt: now
      })
      .returning({ id: libraryItems.id })

    return { thread: updatedThread, libraryItemId: item.id }
  })
}
