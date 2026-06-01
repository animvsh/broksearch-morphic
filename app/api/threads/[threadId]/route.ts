import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { loadChatWithMessages } from '@/lib/db/actions'

export const runtime = 'nodejs'

function threadNotFound() {
  return NextResponse.json(
    {
      error: {
        type: 'not_found',
        code: 'thread_not_found',
        message: 'Thread not found.'
      }
    },
    { status: 404 }
  )
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params

  if (!threadId?.trim()) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'missing_thread_id',
          message: 'thread_id is required.'
        }
      },
      { status: 400 }
    )
  }

  const userId = await getCurrentUserId()

  try {
    const thread = await loadChatWithMessages(threadId, userId)
    if (!thread) return threadNotFound()

    return NextResponse.json({
      thread_id: thread.id,
      id: thread.id,
      title: thread.title,
      visibility: thread.visibility,
      user_id: thread.userId,
      created_at: thread.createdAt,
      messages: thread.messages
    })
  } catch {
    return NextResponse.json(
      {
        error: {
          type: 'service_unavailable',
          code: 'thread_unavailable',
          message: 'Thread is temporarily unavailable.'
        }
      },
      { status: 503 }
    )
  }
}
