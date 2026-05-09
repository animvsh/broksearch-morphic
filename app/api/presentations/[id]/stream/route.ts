import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getPresentation } from '@/lib/db/actions/presentations'

/**
 * GET /api/presentations/:id/stream
 * SSE stream for generation events
 *
 * Note: This is a placeholder endpoint. The actual streaming is handled
 * by the generate-outline and generate-slides routes which return
 * SSE streams directly. This endpoint exists for clients that need to
 * poll for stream status or reconnect to an existing stream.
 *
 * Events returned:
 * - outline_started, outline_delta, outline_complete
 * - slide_started, slide_complete, deck_complete
 * - error
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = await getCurrentUserId()

    // Optional: verify user has access to this presentation
    if (userId) {
      const presentation = await getPresentation(id, userId)
      if (!presentation) {
        return NextResponse.json(
          { error: 'Presentation not found' },
          { status: 404 }
        )
      }
    }

    // Return a simple status endpoint since actual streaming
    // happens in generate-outline and generate-slides routes
    return NextResponse.json({
      message: 'Stream endpoint. Use generate-outline or generate-slides to start generation.',
      presentationId: id
    })
  } catch (error) {
    console.error('Error in stream endpoint:', error)
    return NextResponse.json(
      { error: 'Failed to get stream status' },
      { status: 500 }
    )
  }
}
