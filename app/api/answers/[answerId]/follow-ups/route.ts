import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { loadMessage } from '@/lib/db/actions'
import { extractFollowUpsFromMessage } from '@/lib/render/follow-ups'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ answerId: string }> }
) {
  const { answerId } = await params

  if (!answerId?.trim()) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'missing_answer_id',
          message: 'answer_id is required.'
        }
      },
      { status: 400 }
    )
  }

  const userId = await getCurrentUserId()
  let message

  try {
    message = await loadMessage(answerId, userId)
  } catch {
    return NextResponse.json(
      {
        error: {
          type: 'service_unavailable',
          code: 'follow_ups_unavailable',
          message: 'Follow-ups are temporarily unavailable.'
        }
      },
      { status: 503 }
    )
  }

  if (!message || message.role !== 'assistant') {
    return NextResponse.json(
      {
        error: {
          type: 'not_found',
          code: 'answer_not_found',
          message: 'Answer not found.'
        }
      },
      { status: 404 }
    )
  }

  return NextResponse.json({
    answer_id: answerId,
    follow_ups: extractFollowUpsFromMessage(message).map(followUp => ({
      ...followUp,
      clicked: false
    }))
  })
}
