import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import * as dbActions from '@/lib/db/actions'
import type { UIMessage } from '@/lib/types/ai'

export const runtime = 'nodejs'

type PersistSearchMessagesBody = {
  messages?: unknown
}

function getTextFromMessage(message: UIMessage | undefined) {
  return (
    message?.parts
      ?.filter(
        (part): part is { type: 'text'; text: string } =>
          part?.type === 'text' &&
          typeof (part as { text?: unknown }).text === 'string'
      )
      .map(part => part.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim() || ''
  )
}

function normalizeMessages(value: unknown): UIMessage[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((message): message is UIMessage => {
      if (!message || typeof message !== 'object') return false
      const candidate = message as Partial<UIMessage>
      return (
        typeof candidate.id === 'string' &&
        (candidate.role === 'user' || candidate.role === 'assistant') &&
        Array.isArray(candidate.parts)
      )
    })
    .slice(0, 20)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ searchId: string }> }
) {
  const { searchId } = await params
  const normalizedSearchId = searchId?.trim()

  if (!normalizedSearchId || !normalizedSearchId.startsWith('search_')) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'invalid_search_id',
          message: 'search_id must identify a search session.'
        }
      },
      { status: 400 }
    )
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json(
      {
        error: {
          type: 'authentication_error',
          code: 'authentication_required',
          message: 'Authentication required.'
        }
      },
      { status: 401 }
    )
  }

  const body = (await request
    .json()
    .catch(() => ({}))) as PersistSearchMessagesBody
  const messages = normalizeMessages(body.messages)
  if (messages.length === 0) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'missing_messages',
          message:
            'messages must contain at least one user or assistant message.'
        }
      },
      { status: 400 }
    )
  }

  try {
    const existingChat = await dbActions.getChat(normalizedSearchId, userId)
    if (existingChat && existingChat.userId !== userId) {
      return NextResponse.json(
        {
          error: {
            type: 'permission_error',
            code: 'search_session_forbidden',
            message: 'Search session is not available to this user.'
          }
        },
        { status: 403 }
      )
    }

    if (!existingChat) {
      await dbActions.createChat({
        id: normalizedSearchId,
        title: (getTextFromMessage(messages[0]) || 'Search').slice(0, 255),
        userId,
        visibility: 'private'
      })
    }

    for (const message of messages) {
      await dbActions.upsertMessage(
        {
          ...message,
          chatId: normalizedSearchId
        },
        userId
      )
    }

    revalidateTag(`chat-${normalizedSearchId}`, 'max')

    return NextResponse.json({
      search_id: normalizedSearchId,
      saved: true,
      messages: messages.length
    })
  } catch {
    return NextResponse.json(
      {
        error: {
          type: 'service_unavailable',
          code: 'search_session_save_unavailable',
          message: 'Search session could not be saved right now.'
        }
      },
      { status: 503 }
    )
  }
}
