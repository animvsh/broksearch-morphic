import { NextRequest, NextResponse } from 'next/server'

import { generateId } from '@/lib/db/schema'

import { POST as postChat } from '@/app/api/chat/route'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  request: NextRequest,
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

  const body = await request.json().catch(() => null)
  const content = body?.content

  if (typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'missing_content',
          message: 'content must be a non-empty string.'
        }
      },
      { status: 400 }
    )
  }

  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')

  return postChat(
    new Request(request.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        chatId: threadId,
        trigger: 'submit-message',
        isNewChat: false,
        mode: body?.mode,
        message: {
          id: body?.message_id || generateId(),
          role: 'user',
          parts: [{ type: 'text', text: content.trim() }]
        }
      })
    })
  )
}
