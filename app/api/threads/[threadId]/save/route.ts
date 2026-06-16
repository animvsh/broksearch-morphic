import { NextRequest, NextResponse } from 'next/server'

import { saveThreadToLibrary } from '@/lib/actions/library'
import { getCurrentUserId } from '@/lib/auth/get-current-user'

export const runtime = 'nodejs'

function normalizeVisibility(value: unknown): 'public' | 'private' {
  return value === 'public' ? 'public' : 'private'
}

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

  const body = await request.json().catch(() => ({}))
  const visibility = normalizeVisibility(body?.visibility)

  try {
    const saved = await saveThreadToLibrary({
      threadId,
      userId,
      visibility
    })
    if (!saved) {
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

    return NextResponse.json({
      thread_id: saved.thread.id,
      saved: true,
      visibility: saved.thread.visibility,
      library_item_id: saved.libraryItemId
    })
  } catch {
    return NextResponse.json(
      {
        error: {
          type: 'service_unavailable',
          code: 'thread_save_unavailable',
          message: 'Thread could not be saved right now.'
        }
      },
      { status: 503 }
    )
  }
}
